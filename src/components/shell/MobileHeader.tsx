"use client";
import { Folder, Sun, Moon, PencilLine } from "lucide-react";
import { useCompilationStore } from "@/store/use-compilation-store";

export function MobileHeader({
  className = "",
  onOpenProjects,
}: {
  className?: string;
  onOpenProjects: () => void;
}) {
  const title = useCompilationStore((s) => s.project.title);
  const theme = useCompilationStore((s) => s.project.theme);
  const setTheme = useCompilationStore((s) => s.setTheme);
  const setMobileSheetOpen = useCompilationStore((s) => s.setMobileSheetOpen);
  return (
    <header className={`${className} flex items-center justify-between h-14 px-4 shrink-0 border-b border-[var(--line)] bg-[var(--surface)]`}>
      <div className="min-w-0 truncate font-mono-num text-sm tracking-widest text-[var(--foreground)]">{title}</div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" aria-label="精选集" title="精选集"
          onClick={onOpenProjects}
          className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-200">
          <Folder size={18} />
        </button>
        <button type="button" aria-label="主题" title="主题"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-200">
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button type="button" aria-label="编辑" title="编辑"
          onClick={() => setMobileSheetOpen(true)}
          className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-200">
          <PencilLine size={18} />
        </button>
      </div>
    </header>
  );
}
