"use client";
import { useCompilationStore } from "@/store/use-compilation-store";

const FIELDS: { key: "title" | "subtitle" | "curator" | "year"; label: string }[] = [
  { key: "title", label: "标题" },
  { key: "subtitle", label: "副标题" },
  { key: "curator", label: "创建者" },
  { key: "year", label: "年份" },
];

export function InfoEditor() {
  const project = useCompilationStore((s) => s.project);
  const setProjectField = useCompilationStore((s) => s.setProjectField);
  return (
    <div className="flex flex-col gap-5">
      {FIELDS.map(({ key, label }) => (
        <label key={key} className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</span>
          <input
            type="text"
            value={project[key]}
            onChange={(e) => setProjectField(key, e.target.value)}
            className="bg-transparent border-b border-[var(--line)] focus:border-[var(--strong-line)] outline-none py-1.5 text-sm"
          />
        </label>
      ))}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">简介</span>
        <textarea
          value={project.description}
          onChange={(e) => setProjectField("description", e.target.value)}
          rows={4}
          className="bg-transparent border-b border-[var(--line)] focus:border-[var(--strong-line)] outline-none py-1.5 text-sm resize-none"
        />
      </label>
    </div>
  );
}
