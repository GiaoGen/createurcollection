import type { FilterId } from "@/types/compilation";

/* ------------------------------------------------------------------ *
 * Art-filter pipeline (Task 9).
 *
 * 12 pixel-art filters implemented on Canvas 2D, applied after the
 * source image is drawn onto the canvas. Each filter is a pure function
 * over the RGBA buffer (O(n)) — heavy/random filters (oilpainting /
 * vhs / glitch / collage) derive their randomness from a deterministic
 * seed (see `filterSeed`) so previews (96px), the live texture (1024px)
 * and the export bake (1600px) all render the same structure.
 *
 * Riso uses a cold two-color split (#1a2238 + #5b7a9d) — NO yellow, per
 * project rules (CLAUDE.md bans warm-yellow surfaces).
 * ------------------------------------------------------------------ */

export interface ArtFilterDef {
  id: FilterId;
  label: string;
}

export const ART_FILTERS: ArtFilterDef[] = [
  { id: "original", label: "Original" },
  { id: "ascii", label: "ASCII" },
  { id: "halftone", label: "Halftone" },
  { id: "pixel", label: "Pixel" },
  { id: "oilpainting", label: "Oil Painting" },
  { id: "dither", label: "Dither" },
  { id: "comic", label: "Comic" },
  { id: "risograph", label: "Risograph" },
  { id: "vhs", label: "VHS" },
  { id: "glitch", label: "Glitch" },
  { id: "sketch", label: "Sketch" },
  { id: "collage", label: "Collage" },
  { id: "filmnegative", label: "Film Negative" },
];

/* ------------------------------------------------------------------ *
 * Deterministic PRNG + string hash
 * ------------------------------------------------------------------ */

/** FNV-1a 32-bit — stable string hash used to derive filter seeds. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — tiny seeded PRNG returning [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Resolution-independent, face-agnostic seed for an artwork+filter pair.
 * Derived from the source URL (which changes when a new image/crop is
 * applied) so heavy random filters re-roll for new artwork while staying
 * consistent between the 96px thumbnails, the 1024px texture and the
 * 1600px export bake of the same URL.
 */
export function filterSeed(imageUrl: string, filter: FilterId): number {
  return hashString(`${imageUrl}::${filter}`);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/* Bayer 4×4 threshold matrix (brief: [0,8,2,10;12,4,14,6;3,11,1,9;15,7,13,5]). */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const ASCII_CHARS = " .:-=+*#%@";

/* ------------------------------------------------------------------ *
 * applyArtFilter — dispatch. Pure-pixel filters mutate `d` and are
 * written back with putImageData; compositing filters (ascii / halftone
 * / oilpainting / collage) redraw directly onto the context instead.
 * ------------------------------------------------------------------ */

export function applyArtFilter(
  ctx: CanvasRenderingContext2D,
  id: FilterId,
  seed = 0
): void {
  if (id === "original") return;

  const c = ctx.canvas;
  const w = c.width;
  const h = c.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  switch (id) {
    case "ascii":
      asciiFilter(ctx, d, w, h);
      break;
    case "halftone":
      halftoneFilter(ctx, d, w, h);
      break;
    case "pixel":
      pixelFilter(d, w, h);
      ctx.putImageData(img, 0, 0);
      break;
    case "oilpainting":
      oilPaintingFilter(ctx, w, h);
      break;
    case "dither":
      ditherFilter(d, w, h);
      ctx.putImageData(img, 0, 0);
      break;
    case "comic":
      comicFilter(d, w, h);
      ctx.putImageData(img, 0, 0);
      break;
    case "risograph":
      risographFilter(d, w, h);
      ctx.putImageData(img, 0, 0);
      break;
    case "vhs":
      vhsFilter(d, w, h, seed);
      ctx.putImageData(img, 0, 0);
      break;
    case "glitch":
      glitchFilter(d, w, h, seed);
      ctx.putImageData(img, 0, 0);
      break;
    case "sketch":
      sketchFilter(d, w, h);
      ctx.putImageData(img, 0, 0);
      break;
    case "collage":
      collageFilter(ctx, d, w, h, seed);
      break;
    case "filmnegative":
      filmNegativeFilter(d);
      ctx.putImageData(img, 0, 0);
      break;
    default:
      ctx.putImageData(img, 0, 0);
  }
}

/* ------------------------------------------------------------------ *
 * bakeFilteredUrl — downscale → apply filter → dataURL.
 *   maxEdge  320  preview /  96  thumbnail  /  1600  full bake
 * ------------------------------------------------------------------ */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export async function bakeFilteredUrl(
  src: string,
  filter: FilterId,
  maxEdge = 1600,
  seed?: number
): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  applyArtFilter(ctx, filter, seed ?? filterSeed(src, filter));
  return canvas.toDataURL("image/png");
}

/* ------------------------------------------------------------------ *
 * ASCII — downscale to a ~96-cell grid, map luminance to chars, render
 * via fillText on a near-black background (keeps source aspect).
 * ------------------------------------------------------------------ */

function asciiFilter(ctx: CanvasRenderingContext2D, d: Uint8ClampedArray, w: number, h: number): void {
  const cols = Math.min(96, w);
  const cellW = w / cols;
  const rows = Math.max(1, Math.round(h / cellW));
  const cellH = h / rows;

  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(246,246,246,0.92)";
  ctx.font = `${Math.ceil(cellH * 1.18)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let cy = 0; cy < rows; cy++) {
    const y0 = Math.floor(cy * cellH);
    const y1 = Math.min(h, Math.floor((cy + 1) * cellH));
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.floor(cx * cellW);
      const x1 = Math.min(w, Math.floor((cx + 1) * cellW));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          n++;
        }
      }
      const lum = n ? sum / n : 0;
      // dark → dense char, light → sparse char
      const idx = Math.round((1 - lum / 255) * (ASCII_CHARS.length - 1));
      ctx.fillText(ASCII_CHARS[clamp(idx, 0, ASCII_CHARS.length - 1)], (cx + 0.5) * cellW, (cy + 0.5) * cellH);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Halftone — white paper + black dots sized by cell luminance.
 * ------------------------------------------------------------------ */

function halftoneFilter(ctx: CanvasRenderingContext2D, d: Uint8ClampedArray, w: number, h: number): void {
  const cell = 8;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);

  ctx.fillStyle = "#f6f6f4"; // neutral cold-white paper
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#0b0b0b";

  for (let cy = 0; cy < rows; cy++) {
    const y0 = cy * cell;
    const y1 = Math.min(h, y0 + cell);
    for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * cell;
      const x1 = Math.min(w, x0 + cell);
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          n++;
        }
      }
      const lum = n ? sum / n : 255;
      // dark cell → large dot
      const r = (1 - lum / 255) * cell * 0.62;
      if (r > 0.4) {
        ctx.beginPath();
        ctx.arc((cx + 0.5) * cell, (cy + 0.5) * cell, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Pixel — block average (12px) then nearest-neighbour fill.
 * ------------------------------------------------------------------ */

function pixelFilter(d: Uint8ClampedArray, w: number, h: number): void {
  const block = 12;
  for (let by = 0; by < h; by += block) {
    const y2 = Math.min(h, by + block);
    for (let bx = 0; bx < w; bx += block) {
      const x2 = Math.min(w, bx + block);
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let y = by; y < y2; y++) {
        for (let x = bx; x < x2; x++) {
          const i = (y * w + x) * 4;
          sr += d[i];
          sg += d[i + 1];
          sb += d[i + 2];
          n++;
        }
      }
      const ar = sr / n;
      const ag = sg / n;
      const ab = sb / n;
      for (let y = by; y < y2; y++) {
        for (let x = bx; x < x2; x++) {
          const i = (y * w + x) * 4;
          d[i] = ar;
          d[i + 1] = ag;
          d[i + 2] = ab;
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Oil Painting — neighbourhood (radius 4) luminance-bucket histogram,
 * 8 buckets, most-frequent bucket's mean colour per pixel.
 *
 * Runs on a working canvas capped at ~340px and upscales back, so the
 * brush scale is consistent at every bake resolution and stays O(340²)
 * even for the 1600px export bake.
 * ------------------------------------------------------------------ */

function oilPaintPixels(data: Uint8ClampedArray, w: number, h: number): void {
  const r = 4;
  const src = data.slice();
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    L[i] = 0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2];
  }
  const cnt = new Int32Array(8);
  const sr = new Float32Array(8);
  const sg = new Float32Array(8);
  const sb = new Float32Array(8);

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let k = 0; k < 8; k++) {
        cnt[k] = 0;
        sr[k] = 0;
        sg[k] = 0;
        sb[k] = 0;
      }
      let best = 0;
      let bestC = -1;
      for (let jy = y0; jy <= y1; jy++) {
        const row = jy * w;
        for (let jx = x0; jx <= x1; jx++) {
          const li = row + jx;
          const b = L[li] >> 5; // 0..7
          const b4 = li * 4;
          const c = cnt[b] + 1;
          cnt[b] = c;
          sr[b] += src[b4];
          sg[b] += src[b4 + 1];
          sb[b] += src[b4 + 2];
          if (c > bestC) {
            bestC = c;
            best = b;
          }
        }
      }
      const o = (y * w + x) * 4;
      const total = cnt[best];
      data[o] = sr[best] / total;
      data[o + 1] = sg[best] / total;
      data[o + 2] = sb[best] / total;
      data[o + 3] = src[o + 3];
    }
  }
}

function oilPaintingFilter(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const WORK = 340;
  if (Math.max(w, h) <= WORK) {
    const img = ctx.getImageData(0, 0, w, h);
    oilPaintPixels(img.data, w, h);
    ctx.putImageData(img, 0, 0);
    return;
  }
  const scale = WORK / Math.max(w, h);
  const ww = Math.max(1, Math.round(w * scale));
  const wh = Math.max(1, Math.round(h * scale));
  const off = document.createElement("canvas");
  off.width = ww;
  off.height = wh;
  const octx = off.getContext("2d")!;
  octx.drawImage(ctx.canvas, 0, 0, ww, wh);
  const oimg = octx.getImageData(0, 0, ww, wh);
  oilPaintPixels(oimg.data, ww, wh);
  octx.putImageData(oimg, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(off, 0, 0, w, h);
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * Dither — Bayer 4×4 thresholding to 2 levels.
 * ------------------------------------------------------------------ */

function ditherFilter(d: Uint8ClampedArray, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    const by = y & 3;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const t = ((BAYER4[(by << 2) + (x & 3)] + 0.5) / 16) * 255;
      const v = lum < t ? 0 : 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Comic — posterize to 4 luminance levels + halftone dots in shadows +
 * thin Sobel edge outlines.
 * ------------------------------------------------------------------ */

/** Rotated 45° dot screen returning ink amount in [0,1] (1 = dot centre).
 *  JS % keeps the dividend's sign, so fold into [0, span) for a truly
 *  periodic grid (otherwise `x - y` negative would distort the lattice). */
function dotScreen(x: number, y: number, p: number, phase: number): number {
  const span = p * 2;
  const u = (((x + y + phase) % span) + span) % span - p;
  const v = (((x - y) % span) + span) % span - p;
  const rr = Math.sqrt(u * u + v * v) / (p * 0.72);
  return clamp(1 - rr, 0, 1);
}

function comicFilter(d: Uint8ClampedArray, w: number, h: number): void {
  const src = d.slice();
  const L = new Float32Array(w * h);
  const flat = new Float32Array(w * h); // posterized luminance 0..255

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      L[i / 4] = lum;
      const q = Math.round(lum / 64); // 0..3
      const nl = Math.min(255, q * 85);
      flat[i / 4] = nl;
      const ratio = lum > 0.5 ? nl / (lum + 0.001) : 1;
      d[i] = clamp(r * ratio, 0, 255);
      d[i + 1] = clamp(g * ratio, 0, 255);
      d[i + 2] = clamp(b * ratio, 0, 255);
    }
  }

  // Sobel edges → thin dark outlines
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = L[(y - 1) * w + (x - 1)];
      const t = L[(y - 1) * w + x];
      const tr = L[(y - 1) * w + (x + 1)];
      const ml = L[y * w + (x - 1)];
      const mr = L[y * w + (x + 1)];
      const bl = L[(y + 1) * w + (x - 1)];
      const b = L[(y + 1) * w + x];
      const br = L[(y + 1) * w + (x + 1)];
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      if (gx * gx + gy * gy > 1700) {
        const i = (y * w + x) * 4;
        d[i] = 0x16;
        d[i + 1] = 0x16;
        d[i + 2] = 0x16;
      }
    }
  }

  // Halftone dots in shaded areas
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const nl = flat[i / 4];
      if (nl < 175) {
        const screen = dotScreen(x, y, 7, 0);
        const mult = 0.74 + 0.26 * screen;
        d[i] *= mult;
        d[i + 1] *= mult;
        d[i + 2] *= mult;
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Risograph — luminance → two cold inks (dark #1a2238 + accent #5b7a9d,
 * NO yellow), each pass a halftone dot screen rotated 45° apart.
 * ------------------------------------------------------------------ */

function risographFilter(d: Uint8ClampedArray, w: number, h: number): void {
  const DARK_R = 0x1a;
  const DARK_G = 0x22;
  const DARK_B = 0x38;
  const ACC_R = 0x5b;
  const ACC_G = 0x7a;
  const ACC_B = 0x9d;
  const PAPER_R = 0xf1;
  const PAPER_G = 0xf0;
  const PAPER_B = 0xed;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // coverage grows as pixels move away from the midtone
      const darkCov = clamp((150 - lum) / 150, 0, 1);
      const accentCov = clamp((lum - 105) / 150, 0, 1);
      // pass screens offset by half a period → 45° visual offset
      const sA = dotScreen(x, y, 8, 0);
      const sB = dotScreen(x, y, 8, 8);
      let outR: number;
      let outG: number;
      let outB: number;
      if (darkCov > 0.03 && sA >= 1 - darkCov) {
        outR = DARK_R;
        outG = DARK_G;
        outB = DARK_B;
      } else if (accentCov > 0.03 && sB >= 1 - accentCov) {
        outR = ACC_R;
        outG = ACC_G;
        outB = ACC_B;
      } else {
        outR = PAPER_R;
        outG = PAPER_G;
        outB = PAPER_B;
      }
      d[i] = outR;
      d[i + 1] = outG;
      d[i + 2] = outB;
    }
  }
}

/* ------------------------------------------------------------------ *
 * VHS — horizontal scanlines (dim every 3rd line) + RGB channel
 * horizontal offset 1-2px + noise + subtle line brightness wobble.
 * ------------------------------------------------------------------ */

function vhsFilter(d: Uint8ClampedArray, w: number, h: number, seed: number): void {
  const src = d.slice();
  const rng = mulberry32(seed ^ 0x9e3779b9);
  for (let y = 0; y < h; y++) {
    const dim = y % 3 === 2 ? 0.78 : 1;
    const wob = 1 + 0.05 * Math.sin(y * 0.32 + (seed % 9) * 1.37);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const xr = clamp(x + 2, 0, w - 1);
      const xb = clamp(x - 2, 0, w - 1);
      const ir = (y * w + xr) * 4;
      const ib = (y * w + xb) * 4;
      const n = (rng() - 0.5) * 18;
      d[i] = clamp(src[ir] * wob * dim + n, 0, 255);
      d[i + 1] = clamp(src[i] * wob * dim + n, 0, 255);
      d[i + 2] = clamp(src[ib] * wob * dim + n, 0, 255);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Glitch — RGB channel split (R/B ±6px) + seeded random row-slice
 * displacement (±12px) + a slight hue shift.
 * ------------------------------------------------------------------ */

function glitchFilter(d: Uint8ClampedArray, w: number, h: number, seed: number): void {
  const src = d.slice();
  const rng = mulberry32(seed ^ 0x85ebca6b);
  for (let y = 0; y < h; y++) {
    let slice = 0;
    if (rng() < 0.07) slice = Math.round((rng() * 2 - 1) * 12);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const xr = clamp(x + slice + 6, 0, w - 1);
      const xg = clamp(x + slice, 0, w - 1);
      const xb = clamp(x + slice - 6, 0, w - 1);
      const r = src[(y * w + xr) * 4];
      const g = src[(y * w + xg) * 4 + 1];
      const b = src[(y * w + xb) * 4 + 2];
      // subtle hue shift (warm/cold cross-mix)
      d[i] = clamp(r * 0.93 + g * 0.07, 0, 255);
      d[i + 1] = g;
      d[i + 2] = clamp(b * 0.93 + g * 0.07, 0, 255);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Sketch — Sobel edge magnitude → white ground, dark strokes.
 * ------------------------------------------------------------------ */

function sketchFilter(d: Uint8ClampedArray, w: number, h: number): void {
  const src = d.slice();
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    L[i] = 0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
        continue;
      }
      const tl = L[(y - 1) * w + (x - 1)];
      const t = L[(y - 1) * w + x];
      const tr = L[(y - 1) * w + (x + 1)];
      const ml = L[y * w + (x - 1)];
      const mr = L[y * w + (x + 1)];
      const bl = L[(y + 1) * w + (x - 1)];
      const b = L[(y + 1) * w + x];
      const br = L[(y + 1) * w + (x + 1)];
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      const mag = Math.sqrt(gx * gx + gy * gy);
      const ink = clamp((mag - 24) * 5, 0, 255);
      const v = 255 - ink;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Collage — 4-6 offset "paper strip" rectangles (seeded position /
 * rotation / alpha ≈ 0.85) over a paper ground + darkened edges.
 * ------------------------------------------------------------------ */

function collageFilter(
  ctx: CanvasRenderingContext2D,
  d: Uint8ClampedArray,
  w: number,
  h: number,
  seed: number
): void {
  const src = d.slice();
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d")!;
  const tmp = octx.createImageData(w, h);
  tmp.data.set(src);
  octx.putImageData(tmp, 0, 0);

  const rng = mulberry32(seed ^ 0x27d4eb2f);
  const strips = 4 + Math.floor(rng() * 3); // 4-6

  ctx.fillStyle = "#f2f1ee"; // neutral paper
  ctx.fillRect(0, 0, w, h);

  for (let k = 0; k < strips; k++) {
    ctx.save();
    const sw = w * (0.45 + rng() * 0.55);
    const sh = h * (0.45 + rng() * 0.55);
    const sx = rng() * (w - sw);
    const sy = rng() * (h - sh);
    const dx = (rng() * 2 - 1) * w * 0.09;
    const dy = (rng() * 2 - 1) * h * 0.09;
    const rot = (rng() * 2 - 1) * 0.07;
    ctx.globalAlpha = 0.85;
    ctx.translate(w / 2 + dx, h / 2 + dy);
    ctx.rotate(rot);
    ctx.drawImage(off, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    // darkened edge on each strip
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = Math.max(1, Math.min(4, w * 0.012));
    ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }

  // gentle edge darkening over the whole sheet
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

/* ------------------------------------------------------------------ *
 * Film Negative — RGB invert + slight contrast.
 * ------------------------------------------------------------------ */

function filmNegativeFilter(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    let r = 255 - d[i];
    let g = 255 - d[i + 1];
    let b = 255 - d[i + 2];
    // slight contrast boost around mid-grey
    r = clamp((r - 128) * 1.08 + 128, 0, 255);
    g = clamp((g - 128) * 1.08 + 128, 0, 255);
    b = clamp((b - 128) * 1.08 + 128, 0, 255);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}
