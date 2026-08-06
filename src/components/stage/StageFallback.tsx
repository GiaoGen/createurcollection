"use client";

import { useCompilationStore } from "@/store/use-compilation-store";
import type { ArtworkState } from "@/types/compilation";
import { INLINE_FILTER_CSS } from "./lib";
import type { CSSProperties } from "react";

const FACE_ROT: Record<string, number> = { front: 0, back: 180, disc: 90 };
const CASE_W = 260; // px
const CASE_H = 200;
const CASE_T = 18;

/** Pure-CSS 3D fallback used when WebGL is unavailable. */
export function StageFallback() {
  const face = useCompilationStore((s) => s.face);
  const theme = useCompilationStore((s) => s.project.theme);
  const front = useCompilationStore((s) => s.project.frontCover);
  const back = useCompilationStore((s) => s.project.backCover);
  const disc = useCompilationStore((s) => s.project.discArtwork);
  const title = useCompilationStore((s) => s.project.title);

  const rotY = FACE_ROT[face];

  const faceStyle = (art: ArtworkState): CSSProperties => ({
    position: "absolute",
    top: 0,
    left: 0,
    width: CASE_W,
    height: CASE_H,
    backgroundImage: art.imageUrl ? `url(${art.imageUrl})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: art.imageUrl ? INLINE_FILTER_CSS[art.filter] : undefined,
    backgroundColor: art.imageUrl ? undefined : "#3a3a3a",
    border: "1px solid rgba(0,0,0,0.2)",
    backfaceVisibility: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: art.imageUrl ? undefined : "rgba(255,255,255,0.55)",
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    fontSize: 12,
    letterSpacing: "0.3em",
  });

  return (
    <div
      className="relative w-full h-full flex items-center justify-center overflow-hidden"
      style={{ background: "var(--background)" }}
    >
      <div style={{ perspective: "900px" }}>
        <div
          style={{
            width: CASE_W,
            height: CASE_H,
            position: "relative",
            transformStyle: "preserve-3d",
            transform: `rotateX(-6deg) rotateY(${rotY}deg)`,
            transition: "transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {/* front */}
          <div style={{ ...faceStyle(front), transform: `translateZ(${CASE_T / 2}px)` }}>
            {!front.imageUrl && <span>NO COVER</span>}
          </div>
          {/* back */}
          <div
            style={{
              ...faceStyle(back),
              transform: `rotateY(180deg) translateZ(${CASE_T / 2}px)`,
            }}
          >
            {!back.imageUrl && <span>NO COVER</span>}
          </div>
          {/* spine */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: CASE_T,
              height: CASE_H,
              transform: `rotateY(90deg) translateZ(${CASE_W / 2}px)`,
              backgroundColor: theme === "dark" ? "#151515" : "#e8e8e6",
              backfaceVisibility: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                writingMode: "vertical-rl",
                fontSize: 9,
                letterSpacing: "0.2em",
                color: theme === "dark" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)",
                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              }}
            >
              {title}
            </span>
          </div>
          {/* disc */}
          <div
            style={{
              position: "absolute",
              top: (CASE_H - 120) / 2,
              left: face === "disc" ? CASE_W - 96 : (CASE_W - 120) / 2,
              width: 120,
              height: 120,
              borderRadius: "50%",
              backgroundImage: disc.imageUrl ? `url(${disc.imageUrl})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: disc.imageUrl ? INLINE_FILTER_CSS[disc.filter] : undefined,
              backgroundColor: "#0a0a0a",
              transform: `translateZ(${CASE_T / 2 + 1}px)`,
              transition: "left 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
              boxShadow: "inset 0 0 0 2px #000, inset 0 0 0 10px rgba(255,255,255,0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#f5f5f5" }} />
          </div>
        </div>
      </div>
      {/* 当前编辑对象标识 */}
      <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 text-[11px] tracking-[0.3em] uppercase text-[var(--muted)]">
        {face === "front" ? "Front Cover" : face === "back" ? "Back Cover" : "Disc"}
      </div>
    </div>
  );
}
