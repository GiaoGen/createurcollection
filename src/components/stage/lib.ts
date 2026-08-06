"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { FilterId, SpineStyle } from "@/types/compilation";

/* ------------------------------------------------------------------ *
 * WebGL capability + tiny math helpers
 * ------------------------------------------------------------------ */

/** Detect WebGL support safely (no-op / false on SSR where `document` is absent). */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/* ------------------------------------------------------------------ *
 * Inline CSS-filter stand-in.
 * Task 9 (src/lib/filters.ts FILTERS/drawFiltered) replaces this map;
 * the texture is driven purely by imageUrl, so the swap is safe.
 * ------------------------------------------------------------------ */

export const INLINE_FILTER_CSS: Record<FilterId, string> = {
  original: "none",
  mono: "grayscale(1)",
  contrast: "contrast(1.2)",
  faded: "contrast(0.9) saturate(0.8)",
  cold: "sepia(0.25) hue-rotate(165deg) saturate(0.9)",
  deepblack: "contrast(1.4) brightness(0.7)",
  duotone: "grayscale(1) contrast(1.15)",
  grain: "contrast(0.95)",
  softblur: "blur(1.5px)",
  invert: "invert(1)",
};

/* ------------------------------------------------------------------ *
 * Canvas 2D paint helpers — adapted verbatim from cd-showcase-3d
 * assets/template.html texture factories (makeCaseTexture /
 * makeSpineTexture / makeTrayTexture / makeDiscTexture).
 * ------------------------------------------------------------------ */

const TEX = 1024;

function roundRectPath(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/** No-image placeholder: neutral gray #3a3a3a + mono "NO COVER". */
function paintPlaceholder(ctx: CanvasRenderingContext2D, text: string) {
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(0, 0, TEX, TEX);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "600 44px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, TEX / 2, TEX / 2);
}

/** Album cover: center-crop to square + radial vignette (rgba(0,0,0,0.30) at rim). */
function paintCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  filter: FilterId,
  flipX = false
) {
  const s = Math.min(img.width, img.height);
  ctx.save();
  if (flipX) {
    ctx.translate(TEX, 0);
    ctx.scale(-1, 1);
  }
  ctx.filter = INLINE_FILTER_CSS[filter];
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, TEX, TEX);
  ctx.filter = "none";
  ctx.restore();
  const vg = ctx.createRadialGradient(TEX / 2, TEX / 2, 430, TEX / 2, TEX / 2, 770);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.30)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, TEX, TEX);
}

/** Black-vinyl disc: full-canvas vinyl (#0a0a0a, no transparent ring) + circular photo + centre label + hub hole. */
function paintDisc(ctx: CanvasRenderingContext2D, img: HTMLImageElement, filter: FilterId) {
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, TEX, TEX);
  ctx.save();
  ctx.beginPath();
  ctx.arc(TEX / 2, TEX / 2, 492, 0, 7);
  ctx.clip();
  const s = Math.min(img.width, img.height);
  ctx.filter = INLINE_FILTER_CSS[filter];
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 20, 20, 984, 984);
  ctx.filter = "none";
  ctx.restore();
  ctx.beginPath(); ctx.arc(512, 512, 492, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.stroke();
  ctx.beginPath(); ctx.arc(512, 512, 120, 0, 7); ctx.fillStyle = "#111"; ctx.fill();
  ctx.beginPath(); ctx.arc(512, 512, 120, 0, 7); ctx.lineWidth = 4; ctx.strokeStyle = "#c9bfa9"; ctx.stroke();
  ctx.beginPath(); ctx.arc(512, 512, 22, 0, 7); ctx.fillStyle = "#f5f5f5"; ctx.fill();
  ctx.beginPath(); ctx.arc(512, 512, 22, 0, 7); ctx.lineWidth = 6; ctx.strokeStyle = "#000"; ctx.stroke();
}

/** Spine: avg colour darkened (rgba(0,0,0,0.42)) + vertical mono title (rotate(-PI/2)+scale(1,-1)) + edge highlight. */
function paintSpine(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  title: string,
  spineStyle: SpineStyle
) {
  const scv = document.createElement("canvas");
  scv.width = scv.height = 8;
  scv.getContext("2d")!.drawImage(img, 0, 0, 8, 8);
  ctx.drawImage(scv, 0, 0, 128, 1024);
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.fillRect(0, 0, 128, 1024);
  const vg = ctx.createLinearGradient(0, 0, 128, 0);
  vg.addColorStop(0, "rgba(255,255,255,0.14)");
  vg.addColorStop(0.5, "rgba(255,255,255,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, 128, 1024);
  // spineStyle: the 4-style detail lands in a later task; for now every style
  // renders the vertical-title variant (only a subtle alpha tweak differs).
  const color = spineStyle === "transparent" ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.94)";
  ctx.save();
  ctx.translate(64, 512);
  ctx.rotate(-Math.PI / 2);
  ctx.scale(1, -1);
  ctx.fillStyle = color;
  ctx.font = "500 46px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, 0, 0);
  ctx.restore();
}

function paintSpinePlaceholder(
  ctx: CanvasRenderingContext2D,
  title: string,
  spineStyle: SpineStyle
) {
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(0, 0, 128, 1024);
  const color = spineStyle === "transparent" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.7)";
  ctx.save();
  ctx.translate(64, 512);
  ctx.rotate(-Math.PI / 2);
  ctx.scale(1, -1);
  ctx.fillStyle = color;
  ctx.font = "500 30px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, 0, 0);
  ctx.restore();
}

/** Tray (inside of the case, seen when the lid is open): black + recessed ring + hub + 4 screws. */
function makeTrayTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = TEX;
  const g = c.getContext("2d")!;
  roundRectPath(g, 6, 6, 1012, 1012, 18);
  g.fillStyle = "#101010";
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = "#2e2e2e";
  g.stroke();
  g.strokeStyle = "#1e1e1e";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(24, 150); g.lineTo(1000, 150);
  g.moveTo(24, 874); g.lineTo(1000, 874);
  g.stroke();
  const cx = 512, cy = 512;
  g.beginPath(); g.arc(cx, cy, 438, 0, 7); g.fillStyle = "#1c1c1c"; g.fill();
  g.beginPath(); g.arc(cx, cy, 402, 0, 7); g.fillStyle = "#262626"; g.fill();
  g.beginPath(); g.arc(cx, cy, 438, 0, 7); g.lineWidth = 5; g.strokeStyle = "#080808"; g.stroke();
  g.beginPath(); g.arc(cx, cy, 120, 0, 7); g.fillStyle = "#151515"; g.fill();
  g.beginPath(); g.arc(cx, cy, 20, 0, 7); g.fillStyle = "#d8d8d8"; g.fill();
  for (const [sx, sy] of [[64, 64], [960, 64], [64, 960], [960, 960]] as const) {
    g.beginPath(); g.arc(sx, sy, 17, 0, 7); g.fillStyle = "#3a3a3a"; g.fill();
    g.lineWidth = 4; g.strokeStyle = "#050505"; g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ------------------------------------------------------------------ *
 * Texture hooks — rebuilt + disposed when inputs change. No useLoader
 * (URLs change often and need explicit dispose to avoid GPU leaks).
 * ------------------------------------------------------------------ */

/** Front/back/disc artwork: CanvasTexture that repaints when the image loads. */
export function useArtworkTexture(
  url: string | null,
  filter: FilterId,
  mode: "cover" | "disc" = "cover",
  flipX = false
): THREE.Texture {
  const tex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = TEX;
    const ctx = canvas.getContext("2d")!;
    paintPlaceholder(ctx, "NO COVER");
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (url) {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        ctx.clearRect(0, 0, TEX, TEX);
        if (mode === "cover") paintCover(ctx, img, filter, flipX);
        else paintDisc(ctx, img, filter);
        t.needsUpdate = true;
      };
      img.onerror = () => {
        ctx.clearRect(0, 0, TEX, TEX);
        paintPlaceholder(ctx, "NO COVER");
        t.needsUpdate = true;
      };
      img.src = url;
    }
    return t;
  }, [url, filter, mode, flipX]);

  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Spine: built from the front-cover average colour + vertical title. */
export function useSpineTexture(
  url: string | null,
  title: string,
  spineStyle: SpineStyle
): THREE.Texture {
  const tex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d")!;
    paintSpinePlaceholder(ctx, title, spineStyle);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (url) {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        ctx.clearRect(0, 0, 128, 1024);
        paintSpine(ctx, img, title, spineStyle);
        t.needsUpdate = true;
      };
      img.onerror = () => {
        ctx.clearRect(0, 0, 128, 1024);
        paintSpinePlaceholder(ctx, title, spineStyle);
        t.needsUpdate = true;
      };
      img.src = url;
    }
    return t;
  }, [url, title, spineStyle]);

  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Tray texture is static — build once, dispose on unmount. */
export function useTrayTexture(): THREE.Texture {
  const tex = useMemo(() => makeTrayTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}
