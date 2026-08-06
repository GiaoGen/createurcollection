"use client";
import { X } from "lucide-react";
import { useCompilationStore } from "@/store/use-compilation-store";

// Task 5 占位：Task 13 将替换为完整 Bottom Sheet。
export function MobileEditorSheet() {
  const open = useCompilationStore((s) => s.mobileSheetOpen);
  const setMobileSheetOpen = useCompilationStore((s) => s.setMobileSheetOpen);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={() => setMobileSheetOpen(false)} />
      <div className="absolute inset-x-0 bottom-0 max-h-[70vh] rounded-t-2xl bg-[var(--surface)] border-t border-[var(--line)] shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
          <div className="font-mono-num text-xs tracking-widest text-[var(--muted)]">EDITOR</div>
          <button type="button" aria-label="关闭" onClick={() => setMobileSheetOpen(false)}
            className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-200">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 text-sm text-[var(--muted)]">编辑器面板将在后续任务中实现。</div>
      </div>
    </div>
  );
}
