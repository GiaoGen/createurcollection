"use client";
import { useCompilationStore } from "@/store/use-compilation-store";
import { SpineStyle } from "@/types/compilation";

const OPTIONS: { value: SpineStyle; label: string }[] = [
  { value: "catalog", label: "目录" },
  { value: "obi", label: "侧标" },
  { value: "vertical", label: "竖排" },
  { value: "transparent", label: "透明" },
];

function SpinePreview({ value }: { value: SpineStyle }) {
  const base = "w-6 h-16 rounded-sm border border-[var(--line)] overflow-hidden";
  switch (value) {
    case "catalog":
      return (
        <div className={`${base} bg-[var(--foreground)] flex items-end justify-center pb-1`}>
          <span className="font-mono-num text-[8px] leading-none text-[var(--surface)]">01</span>
        </div>
      );
    case "obi":
      return (
        <div className={`${base} relative`}>
          <div className="absolute inset-x-0 top-1/4 h-1/2 bg-[var(--strong-line)]/50" />
          <div className="absolute inset-x-0 top-1/4 flex justify-center py-0.5">
            <span className="font-mono-num text-[7px] leading-none bg-[var(--surface)] text-[var(--foreground)] px-0.5">OBI</span>
          </div>
        </div>
      );
    case "vertical":
      return (
        <div className={`${base} flex items-center justify-center`}>
          <span
            style={{ writingMode: "vertical-rl" }}
            className="font-mono-num text-[7px] tracking-widest text-[var(--foreground)]"
          >
            COLLECTION
          </span>
        </div>
      );
    case "transparent":
      return (
        <div className={`${base} flex items-center justify-center`}>
          <span className="font-mono-num text-[7px] text-[var(--muted)]">—</span>
        </div>
      );
  }
}

export function SpineEditor() {
  const spineStyle = useCompilationStore((s) => s.project.spineStyle);
  const setProjectField = useCompilationStore((s) => s.setProjectField);
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">侧标样式</span>
      <div className="grid grid-cols-4 gap-2">
        {OPTIONS.map(({ value, label }) => {
          const active = spineStyle === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setProjectField("spineStyle", value)}
              className={`flex flex-col items-center gap-2 rounded-md border p-2 transition-colors ${
                active ? "border-[var(--strong-line)]" : "border-[var(--line)]"
              }`}
            >
              <SpinePreview value={value} />
              <span className={`text-[11px] ${active ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
