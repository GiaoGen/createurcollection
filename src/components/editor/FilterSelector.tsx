"use client";

import { useEffect, useState } from "react";
import { ART_FILTERS, bakeFilteredUrl, filterSeed } from "@/lib/image/art-filters";
import { useObjectUrl } from "@/lib/image/blobs";
import { useCompilationStore } from "@/store/use-compilation-store";

/** Bake cache keyed by `face:filter:imageId` — survives component remounts.
 *  key 用稳定的 imageId（非 Object URL——URL 每次加载都重建），跨会话一致。 */
const thumbCache = new Map<string, string>();
const THUMB_MAX_CACHE = 240;

export function FilterSelector() {
  const face = useCompilationStore((s) => s.face);
  const art = useCompilationStore((s) =>
    s.project[face === "front" ? "frontCover" : face === "back" ? "backCover" : "discArtwork"]
  );
  const setArtwork = useCompilationStore((s) => s.setArtwork);
  // hold=false：切面时先清空再加载，避免把旧面的 URL 烘焙进新 imageId 的缓存 key。
  const imageUrl = useObjectUrl(art.imageId, false);
  // 缓存/seed 一律用稳定 imageId；const 局部变量以便 effect 闭包内类型收窄为 string。
  const imageId = art.imageId;
  const active = art.filter;
  // Store the bake results alongside the imageUrl they were derived from,
  // so stale thumbs (from a previous face/crop) are never shown while a
  // new set is baking.
  const [thumbs, setThumbs] = useState<{ key: string; map: Record<string, string> }>({ key: "", map: {} });
  const thumbKey = imageUrl ? `${face}:${imageUrl}` : "";
  const shown = thumbs.key === thumbKey ? thumbs.map : {};

  useEffect(() => {
    if (!imageUrl || !imageId) return;
    let cancelled = false;

    const build = async () => {
      const out: Record<string, string> = {};
      await Promise.all(
        ART_FILTERS.map(async (f) => {
          const key = `${face}:${f.id}:${imageId}`;
          const cached = thumbCache.get(key);
          if (cached) {
            out[f.id] = cached;
            return;
          }
          try {
            const url = await bakeFilteredUrl(imageUrl, f.id, 96, filterSeed(imageId, f.id));
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
  }, [face, imageUrl, imageId]);

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
