"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCompilationStore } from "@/store/use-compilation-store";
import { InfoEditor } from "./InfoEditor";
import { SpineEditor } from "./SpineEditor";
import { FilterSelector } from "./FilterSelector";
import { TrackEditor } from "./TrackEditor";
import { EditorMode } from "@/types/compilation";
import type { FC } from "react";

const PANELS: Record<EditorMode, FC> = {
  info: InfoEditor,
  artwork: FilterSelector, // Task 9 换为 ArtworkEditor 组合
  filters: FilterSelector,
  spine: SpineEditor,
  tracks: TrackEditor,
};

export function Inspector({ className = "" }: { className?: string }) {
  const mode = useCompilationStore((s) => s.mode);
  const face = useCompilationStore((s) => s.face);
  const setMode = useCompilationStore((s) => s.setMode);
  const setFace = useCompilationStore((s) => s.setFace);
  const Panel = PANELS[mode];
  return (
    <aside className={`${className} flex-col overflow-y-auto bg-[var(--surface)]`}>
      {/* 模式 Tab（顶部分隔线，非悬浮） */}
      <div className="shrink-0 border-b border-[var(--line)] p-1 flex gap-1">
        {(["info", "artwork", "spine", "tracks"] as EditorMode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-2 py-1 text-xs rounded-md transition-colors ${mode === m ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
            {m}
          </button>
        ))}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={mode} className="p-4 flex-1 min-h-0 overflow-y-auto"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } }}>
          <Panel />
        </motion.div>
      </AnimatePresence>
      <div className="shrink-0 border-t border-[var(--line)] p-2 flex gap-1 text-xs text-[var(--muted)]">
        {(["front", "back", "disc"] as const).map((f) => (
          <button key={f} onClick={() => setFace(f)}
            className={`px-2 py-1 rounded-md border border-transparent ${face === f ? "border-[var(--strong-line)] text-[var(--foreground)]" : ""}`}>
            {f}
          </button>
        ))}
      </div>
    </aside>
  );
}
