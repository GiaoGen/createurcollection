"use client";

// Task 6 占位：Task 10 将替换为完整曲目编辑器（增删改 + 拖排序）。
export function TrackEditor() {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">曲目</span>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 rounded-md border border-[var(--line)] bg-[var(--background)]" />
        ))}
      </div>
    </div>
  );
}
