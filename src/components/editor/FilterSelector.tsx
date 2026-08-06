"use client";

// Task 6 占位：Task 9 将替换为完整滤镜选择器（filters.ts 烘焙）。
export function FilterSelector() {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">滤镜</span>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-md border border-[var(--line)] bg-[var(--background)]" />
        ))}
      </div>
    </div>
  );
}
