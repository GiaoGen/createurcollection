"use client";

import { useEffect, useState } from "react";
import { ART_FILTERS, bakeFilteredUrl } from "@/lib/image/art-filters";
import { useCompilationStore } from "@/store/use-compilation-store";

/** Bake cache keyed by `face:filter:imageUrl` — survives component remounts. */
const thumbCache = new Map<string, string>();
const THUMB_MAX_CACHE = 240;

export function FilterSelector() {
  const face = useCompilationStore((s) => s.face);
  const art = useCompilationStore((s) =>
    s.project[face === "front" ? "frontCover" : face === "back" ? "backCover" : "discArtwork"]
  );
  const setArtwork = useCompilationStore((s) => s.setArtwork);
  const imageUrl = art.imageUrl;
  const active = art.filter;
  // Store the bake results alongside the imageUrl they were derived from,
  // so stale thumbs (from a previous face/crop) are never shown while a
  // new set is baking.
  const [thumbs, setThumbs] = useState<{ key: string; map: Record<string, string> }>({ key: "", map: {} });
  const thumbKey = imageUrl ? `${face}:${imageUrl}` : "";
  const shown = thumbs.key === thumbKey ? thumbs.map : {};

  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;

    const build = async () => {
      const out: Record<string, string> = {};
      await Promise.all(
        ART_FILTERS.map(async (f) => {
          const key = `${face}:${f.id}:${imageUrl}`;
          const cached = thumbCache.get(key);
          if (cached) {
            out[f.id] = cached;
            return;
          }
          try {
            const url = await bakeFilteredUrl(imageUrl, f.id, 96);
            if (cancelled) return;
            if (thumbCache.size > THUMB_MAX_CACHE) thumbCache.clear();
            thumbCache.set(key, url);
            out[f.id] = url;
          } catch {
            /* bake failed → leave cell grey */
          }
        })
      );
      if (!cancelled) setThumbs({ key: `${face}:${imageUrl}`, map: out });
    };

    void build();
    return () => {
      cancelled = true;
    };
  }, [face, imageUrl]);

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">滤镜</span>
      <div className="grid grid-cols-5 gap-2">
        {ART_FILTERS.map((f) => {
          const selected = active === f.id;
          const src = shown[f.id];
          return (
            <button
              key={f.id}
              type="button"
              title={f.label}
              aria-pressed={selected}
              onClick={() => setArtwork(face, { filter: f.id })}
              className="group flex flex-col items-center gap-1"
            >
              <span
                className={`aspect-square w-full overflow-hidden rounded-md border bg-[var(--surface)] transition-colors ${
                  selected ? "border-[var(--strong-line)]" : "border-[var(--line)] group-hover:border-[var(--strong-line)]"
                }`}
              >
                {src ? (
                  <img src={src} alt={f.label} className="h-full w-full object-cover" />
                ) : null}
              </span>
              <span
                className={`w-full min-h-[22px] text-center text-[9px] leading-[1.2] ${
                  selected ? "text-[var(--foreground)]" : "text-[var(--muted)]"
                }`}
              >
                {f.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
