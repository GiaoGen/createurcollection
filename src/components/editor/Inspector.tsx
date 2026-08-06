"use client";
import { useCompilationStore } from "@/store/use-compilation-store";

const MODES = [
  { mode: "info", label: "信息" },
  { mode: "artwork", label: "封面" },
  { mode: "filters", label: "滤镜" },
  { mode: "spine", label: "侧标" },
  { mode: "tracks", label: "曲目" },
] as const;

// Task 5 占位：Task 6 将替换为完整 Inspector + 模式动画。
export function Inspector({ className = "" }: { className?: string }) {
  const mode = useCompilationStore((s) => s.mode);
  const setMode = useCompilationStore((s) => s.setMode);
  return (
    <aside className={`${className} flex-col bg-[var(--surface)]`}>
      <div className="px-4 py-3 font-mono-num text-xs tracking-widest text-[var(--muted)] border-b border-[var(--line)]">
        INSPECTOR
      </div>
      <div className="flex flex-wrap gap-1 p-3 border-b border-[var(--line)]">
        {MODES.map((m) => (
          <button key={m.mode} type="button" onClick={() => setMode(m.mode)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors duration-200 ${
              mode === m.mode
                ? "text-[var(--foreground)] bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="p-4 text-sm text-[var(--muted)]">编辑器面板将在 Task 6 实现。</div>
    </aside>
  );
}
