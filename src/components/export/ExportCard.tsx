"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { bakeFilteredUrl } from "@/lib/image/art-filters";
import { trackCoverBake } from "@/lib/export-bake";
import { useCompilationStore } from "@/store/use-compilation-store";
import type { SpineStyle } from "@/types/compilation";

/**
 * Fixed 1200×900 marketing/export card. Rendered permanently as an
 * off-screen node (`position: fixed; left: -9999px`) so the user can hit the
 * Rail export button at any time and get a fresh PNG without mounting work.
 *
 * All content is real DOM + <img> (no canvas) so html-to-image can clone it.
 * The export is a fixed LIGHT sheet (#f5f5f3) regardless of the app theme —
 * consistency beats theme-following for a shareable promo image.
 *
 * Layout:
 *   left   — CD cover (foreground) sitting on a jewel case that carries the
 *            spine (honours `spineStyle`, the 4 styles from CLAUDE.md §五).
 *   right  — editorial title / subtitle · curator / year, a 1px divider,
 *            a backlist track listing (Geist Mono numbers + titles, artist
 *            when present, two columns for long playlists), and a Geist Mono
 *            catalog-number footer row.
 *
 * The cover is baked through `bakeFilteredUrl` so the chosen art filter is
 * baked into the PNG. Always baking (even for `original`) also turns the
 * source into a dataURL, which html-to-image embeds directly — avoiding a
 * blob: fetch + `cacheBust` query-string that would break the capture.
 */

/* Export-specific light tokens — independent of the live theme. */
const E = {
  bg: "#f5f5f3",
  surface: "#ffffff",
  fg: "#0a0a0a",
  muted: "#737373",
  strong: "rgba(0, 0, 0, 0.28)",
  hairline: "rgba(0, 0, 0, 0.08)",
  sans: "var(--font-geist-sans), system-ui, sans-serif",
  mono: "var(--font-geist-mono), ui-monospace, monospace",
} as const;

/** Full-bake edge length — matches the app's "1600px export bake" resolution. */
const BAKE_MAX_EDGE = 1600;

export function ExportCard() {
  const project = useCompilationStore((s) => s.project);

  // Baked cover: pre-bake the front-cover filter so the captured PNG carries it.
  const [coverSrc, setCoverSrc] = useState<string | null>(null);
  const frontImageUrl = project.frontCover.imageUrl;
  const frontFilter = project.frontCover.filter;

  useEffect(() => {
    let cancelled = false;
    if (!frontImageUrl) {
      // No image → placeholder. Register "no bake" so an export clicked in
      // this state does not wait on a stale bake. Defer the state write onto
      // a microtask so the effect body never calls setState synchronously
      // (react-hooks/set-state-in-effect).
      trackCoverBake(null);
      Promise.resolve().then(() => {
        if (!cancelled) setCoverSrc(null);
      });
      return () => {
        cancelled = true;
      };
    }
    // Register the in-flight bake so the export handler awaits it before
    // capturing — otherwise a click right after a filter/image change would
    // grab the previous bake's result (or the "NO COVER" placeholder). Each
    // re-run overwrites the previous registration, so the handler only ever
    // waits on the newest bake.
    const bake = bakeFilteredUrl(frontImageUrl, frontFilter, BAKE_MAX_EDGE)
      .then((url) => {
        if (!cancelled) setCoverSrc(url);
      })
      .catch(() => {
        if (!cancelled) setCoverSrc(null); // bake failed → placeholder, no crash
      });
    trackCoverBake(bake);
    return () => {
      cancelled = true;
    };
  }, [frontImageUrl, frontFilter]);

  const title = project.title.trim();
  const metaLine = [
    project.subtitle.trim(),
    [project.curator.trim(), project.year.trim()].filter(Boolean).join(" / "),
  ]
    .filter(Boolean)
    .join(" · ");

  const tracks = project.tracks;
  // Catalog number: keep only digits, pad to 4, take the last 4 — so a
  // non-4-digit year (e.g. "96" or "020s") yields a sane "CYC-0096", and a
  // year with no digits at all falls back to the limited edition mark.
  const yearDigits = project.year.replace(/\D/g, "");
  const catNo = yearDigits ? `CYC-${yearDigits.padStart(4, "0").slice(-4)}` : "CYC-LTD";
  // Deliberate cap on the backlist: the two-column area is a fixed height, so
  // a very long playlist would otherwise be silently clipped in the PNG. 24
  // (12 rows/column) fits comfortably inside the ~570px budget; anything more
  // gets an explicit "+N MORE" marker in the footer instead of a silent cut.
  const MAX_DISPLAY_TRACKS = 24;
  const shownTracks = tracks.slice(0, MAX_DISPLAY_TRACKS);
  const hiddenCount = tracks.length - shownTracks.length;
  const cols = shownTracks.length > 6 ? 2 : 1;
  const per = cols === 1 ? shownTracks.length : Math.ceil(shownTracks.length / 2);
  const columns = Array.from({ length: cols }, (_, i) => shownTracks.slice(i * per, (i + 1) * per));

  return (
    <div
      id="cyc-export-card"
      aria-hidden
      style={{
        position: "fixed",
        left: "-9999px",
        top: 0,
        transform: "scale(1)",
        boxSizing: "border-box",
        width: 1200,
        height: 900,
        background: E.bg,
        color: E.fg,
        fontFamily: E.sans,
        display: "flex",
        padding: 72,
        gap: 84,
      }}
    >
      {/* Left — cover on the jewel case (with spine) */}
      <div
        style={{
          width: 400,
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <div style={{ position: "relative", width: 380, height: 380 }}>
          {/* case body */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: E.surface,
              border: `1px solid ${E.strong}`,
              borderRadius: 12,
              boxShadow: "0 28px 56px -28px rgba(0,0,0,0.28)",
            }}
          />
          <ExportSpine spineStyle={project.spineStyle} title={title || "COLLECTION"} />
          {/* cover (foreground) */}
          <div
            style={{
              position: "absolute",
              left: 56,
              top: 40,
              width: 300,
              height: 300,
              background: "#e5e5e2",
              border: "1px solid rgba(0,0,0,0.2)",
              borderRadius: 2,
              overflow: "hidden",
              boxShadow: "0 20px 40px -20px rgba(0,0,0,0.38)",
            }}
          >
            {coverSrc ? (
              <img
                src={coverSrc}
                alt={title || "cover"}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontFamily: E.mono, fontSize: 13, letterSpacing: "0.3em", color: E.muted }}>
                  NO COVER
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right — title, meta, divider, backlist, catalog footer */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 0.95,
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
              color: E.fg,
            }}
          >
            {title || "UNTITLED"}
          </h1>
          <div
            style={{
              marginTop: 20,
              fontFamily: E.mono,
              fontSize: 15,
              letterSpacing: "0.05em",
              color: E.muted,
            }}
          >
            {metaLine || "—"}
          </div>
        </div>

        <div style={{ height: 1, background: E.strong, margin: "30px 0 26px" }} />

        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {tracks.length === 0 ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontFamily: E.mono, fontSize: 13, letterSpacing: "0.3em", color: E.muted }}>
                NO TRACKS
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 48, height: "100%" }}>
              {columns.map((col, ci) => (
                <div key={ci} style={{ flex: 1, minWidth: 0 }}>
                  {col.map((t, i) => {
                    const n = ci * per + i + 1;
                    return (
                      <div
                        key={t.id}
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 14,
                          padding: "9px 0",
                          borderBottom: `1px solid ${E.hairline}`,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: E.mono,
                            fontSize: 12,
                            letterSpacing: "0.05em",
                            color: E.muted,
                            minWidth: 30,
                          }}
                        >
                          {String(n).padStart(2, "0")}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 15,
                            fontWeight: 500,
                            color: E.fg,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {t.title.trim() || "UNTITLED"}
                        </span>
                        {t.artist.trim() ? (
                          <span
                            style={{
                              fontFamily: E.mono,
                              fontSize: 12,
                              letterSpacing: "0.04em",
                              color: E.muted,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {t.artist}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            paddingTop: 22,
          }}
        >
          <span style={{ fontFamily: E.mono, fontSize: 12, letterSpacing: "0.14em", color: E.muted }}>
            {catNo}
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              fontFamily: E.mono,
              fontSize: 12,
              letterSpacing: "0.14em",
              color: E.muted,
            }}
          >
            {hiddenCount > 0 ? <span>… +{hiddenCount} MORE</span> : null}
            <span>{tracks.length === 0 ? "EMPTY" : `${String(tracks.length).padStart(2, "0")} TRACKS`}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Spine band on the left edge of the jewel case — the 4 styles from §五. */
function ExportSpine({ spineStyle, title }: { spineStyle: SpineStyle; title: string }) {
  const base: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  };

  const titleStyle: CSSProperties = {
    fontFamily: E.mono,
    fontSize: 13,
    letterSpacing: "0.3em",
    writingMode: "vertical-rl",
  };

  switch (spineStyle) {
    case "catalog":
      return (
        <div style={{ ...base, background: "#141414" }}>
          <span style={{ ...titleStyle, color: "#f4f4f4" }}>{title}</span>
          <span
            style={{
              position: "absolute",
              bottom: 10,
              fontFamily: E.mono,
              fontSize: 10,
              letterSpacing: "0.2em",
              color: "rgba(244,244,244,0.7)",
            }}
          >
            001
          </span>
        </div>
      );
    case "obi":
      return (
        <div style={{ ...base, background: "#f4f4f2", borderRight: "1px solid rgba(0,0,0,0.9)" }}>
          <span style={{ ...titleStyle, color: E.fg }}>{title}</span>
        </div>
      );
    case "vertical":
      return (
        <div style={{ ...base, background: E.surface, borderRight: `1px solid ${E.strong}` }}>
          <span style={{ ...titleStyle, color: E.fg }}>{title}</span>
        </div>
      );
    case "transparent":
      return (
        <div style={{ ...base, background: "rgba(0,0,0,0.06)", borderRight: "1px solid rgba(0,0,0,0.1)" }}>
          <span style={{ ...titleStyle, color: "rgba(0,0,0,0.55)" }}>{title}</span>
        </div>
      );
  }
}
