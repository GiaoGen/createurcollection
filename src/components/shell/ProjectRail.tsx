"use client";
import type { ReactNode } from "react";
import { Plus, SlidersHorizontal, ListMusic, Sun, Moon, Download } from "lucide-react";
import { useCompilationStore } from "@/store/use-compilation-store";

const tools = [
  { mode: "info", icon: SlidersHorizontal, label: "信息" },
  { mode: "tracks", icon: ListMusic, label: "曲目" },
] as const;

export function ProjectRail({ className = "" }: { className?: string }) {
  const mode = useCompilationStore((s) => s.mode);
  const setMode = useCompilationStore((s) => s.setMode);
  const theme = useCompilationStore((s) => s.project.theme);
  const setTheme = useCompilationStore((s) => s.setTheme);
  const resetProject = useCompilationStore((s) => s.resetProject);
  return (
    <nav className={`${className} flex-col items-center py-3 gap-1 bg-[var(--surface)]`}>
      <div className="font-mono-num text-xs tracking-widest mb-4">CYC</div>
      <IconBtn title="新建" onClick={resetProject}><Plus size={18} /></IconBtn>
      {tools.map((t) => (
        <IconBtn key={t.mode} title={t.label} active={mode === t.mode}
          onClick={() => setMode(t.mode)}>{<t.icon size={18} />}</IconBtn>
      ))}
      <div className="flex-1" />
      <IconBtn title="导出" onClick={() => window.dispatchEvent(new CustomEvent("cyc:export"))}><Download size={18} /></IconBtn>
      <IconBtn title="主题" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </IconBtn>
    </nav>
  );
}

function IconBtn({ title, onClick, active, children }: {
  title: string; onClick: () => void; active?: boolean; children: ReactNode;
}) {
  return (
    <button title={title} onClick={onClick} aria-label={title}
      className={`group relative p-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-200
        ${active ? "text-[var(--foreground)] bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]" : ""}`}>
      {children}
      <span className="pointer-events-none absolute left-full ml-2 px-2 py-0.5 text-xs whitespace-nowrap rounded-md
        bg-[var(--surface)] border border-[var(--line)] opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
        {title}
      </span>
    </button>
  );
}
