"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCompilationStore } from "@/store/use-compilation-store";
import { EDITOR_PANELS, EditorTabs, FaceSwitcher } from "./panels";

export function Inspector({ className = "" }: { className?: string }) {
  const mode = useCompilationStore((s) => s.mode);
  const Panel = EDITOR_PANELS[mode];
  return (
    <aside className={`${className} flex-col overflow-y-auto bg-[var(--surface)]`}>
      {/* 模式 Tab（顶部分隔线，非悬浮） */}
      <EditorTabs />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={mode} className="p-4 flex-1 min-h-0 overflow-y-auto"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } }}>
          <Panel />
        </motion.div>
      </AnimatePresence>
      {/* 底部 face 选择器：正面/背面/盘面 */}
      <FaceSwitcher />
    </aside>
  );
}
