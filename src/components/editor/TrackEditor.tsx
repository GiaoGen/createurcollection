"use client";
import { Plus, GripVertical, Trash2 } from "lucide-react";
import { useCompilationStore } from "@/store/use-compilation-store";
import { createId } from "@/lib/storage";

function formatTime(d: number): string {
  if (d <= 0) return "--:--";
  const m = Math.floor(d / 60);
  const s = String(d % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function TrackEditor() {
  const tracks = useCompilationStore((s) => s.project.tracks);
  const activeTrackId = useCompilationStore((s) => s.project.activeTrackId);
  // 动作经 getState 取稳定引用，避免每帧重渲染；数据订阅如上两行。
  const { updateTrack, removeTrack, addTrack, setActiveTrack, reorderTracks } = useCompilationStore.getState();

  const add = () => {
    const t = { id: createId("trk"), title: "未命名曲目", artist: "—", duration: 0, src: "" };
    addTrack(t);
  };

  return (
    <div className="space-y-1">
      <ul>
        {tracks.map((t, i) => (
          <li
            key={t.id}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = Number(e.dataTransfer.getData("text/index"));
              if (from !== i) reorderTracks(from, i);
            }}
            onClick={() => setActiveTrack(t.id)}
            className={`group flex items-center gap-2 px-2 py-2 rounded-lg border-b border-[var(--line)] cursor-pointer ${
              t.id === activeTrackId ? "bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]" : ""
            }`}>
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/index", String(i));
                e.dataTransfer.effectAllowed = "move";
              }}
              className="text-[var(--muted)] cursor-grab"
              aria-label="拖动排序">
              <GripVertical size={14} />
            </button>
            <span className="font-mono-num text-xs text-[var(--muted)] w-6">{String(i + 1).padStart(2, "0")}</span>
            <div className="flex-1 min-w-0">
              <input
                value={t.title}
                onChange={(e) => updateTrack(t.id, { title: e.target.value })}
                className="w-full bg-transparent text-sm outline-none"
              />
              <input
                value={t.artist}
                onChange={(e) => updateTrack(t.id, { artist: e.target.value })}
                className="w-full bg-transparent text-xs text-[var(--muted)] outline-none"
              />
            </div>
            <span className="font-mono-num text-xs text-[var(--muted)]">{formatTime(t.duration)}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTrack(t.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-[var(--muted)]"
              aria-label="删除曲目">
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={add}
        className="w-full py-2 text-sm text-[var(--muted)] border border-dashed border-[var(--strong-line)] rounded-lg flex items-center justify-center gap-1">
        <Plus size={14} /> 添加曲目
      </button>
    </div>
  );
}
