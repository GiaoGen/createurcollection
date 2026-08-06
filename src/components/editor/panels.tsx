"use client";
import type { FC } from "react";
import { InfoEditor } from "./InfoEditor";
import { ArtworkEditor } from "./ArtworkEditor";
import { FilterSelector } from "./FilterSelector";
import { SpineEditor } from "./SpineEditor";
import { TrackEditor } from "./TrackEditor";
import { useCompilationStore } from "@/store/use-compilation-store";
import type { EditorMode, FaceTarget } from "@/types/compilation";

/** 编辑模式 Tab（桌面 Inspector 与移动端 Bottom Sheet 共用，含滤镜）。 */
export const EDITOR_TABS: { key: EditorMode; label: string }[] = [
  { key: "info", label: "信息" },
  { key: "artwork", label: "封面" },
  { key: "filters", label: "滤镜" },
  { key: "spine", label: "侧标" },
  { key: "tracks", label: "曲目" },
];

/** 编辑模式 → 子面板组件（两处共享同一批 *Editor，DRY）。 */
export const EDITOR_PANELS: Record<EditorMode, FC> = {
  info: InfoEditor,
  artwork: ArtworkEditor,
  filters: FilterSelector,
  spine: SpineEditor,
  tracks: TrackEditor,
};

const FACE_LABELS: Record<FaceTarget, string> = {
  front: "正面",
  back: "背面",
  disc: "盘面",
};

/** 模式 Tab 栏：1px 分隔线 + 字号层级，无胶囊堆叠。 */
export function EditorTabs() {
  const mode = useCompilationStore((s) => s.mode);
  const setMode = useCompilationStore((s) => s.setMode);
  return (
    <div className="shrink-0 border-b border-[var(--line)] p-1 flex gap-1">
      {EDITOR_TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => setMode(key)}
          className={`px-2 py-1 text-xs rounded-md transition-colors ${
            mode === key ? "text-[var(--foreground)]" : "text-[var(--muted)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** 底部 face 选择器：正面/背面/盘面（artwork 与 filters 面板依赖它切换目标面）。 */
export function FaceSwitcher() {
  const face = useCompilationStore((s) => s.face);
  const setFace = useCompilationStore((s) => s.setFace);
  return (
    <div className="shrink-0 border-t border-[var(--line)] p-2 flex gap-1 text-xs text-[var(--muted)]">
      {(Object.keys(FACE_LABELS) as FaceTarget[]).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => setFace(f)}
          className={`px-2 py-1 rounded-md border border-transparent ${
            face === f ? "border-[var(--strong-line)] text-[var(--foreground)]" : ""
          }`}
        >
          {FACE_LABELS[f]}
        </button>
      ))}
    </div>
  );
}
