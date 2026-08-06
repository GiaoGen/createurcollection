"use client";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { X } from "lucide-react";
import { useCompilationStore } from "@/store/use-compilation-store";
import { EDITOR_PANELS, EditorTabs, FaceSwitcher } from "@/components/editor/panels";

const SHEET_SPRING = { type: "spring", stiffness: 260, damping: 28, mass: 0.8 } as const;
const FADE = { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } as const;

export function MobileEditorSheet() {
  const open = useCompilationStore((s) => s.mobileSheetOpen);
  const setOpen = useCompilationStore((s) => s.setMobileSheetOpen);
  const mode = useCompilationStore((s) => s.mode);
  const controls = useDragControls();

  const Panel = EDITOR_PANELS[mode];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: FADE }}
          exit={{ opacity: 0, transition: FADE }}
        >
          {/* 背景：点击关闭 */}
          <div className="absolute inset-0 bg-black/20" onClick={() => setOpen(false)} />
          <motion.div
            className="absolute inset-x-0 bottom-0 h-[70dvh] flex flex-col rounded-t-[20px] bg-[var(--surface)] border-t border-[var(--line)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SHEET_SPRING}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) setOpen(false);
            }}
          >
            {/* 顶部拖拽区：仅此处启动拖动（dragControls），避免与内容区滚动/
                 Cropper/range/输入框/拖拽排序的指针手势冲突 */}
            <div
              className="shrink-0 cursor-grab active:cursor-grabbing select-none"
              onPointerDown={(e) => controls.start(e)}
            >
              <div className="pt-2 pb-1 flex justify-center">
                <div className="h-1 w-8 rounded-full bg-[var(--line)]" />
              </div>
              <div className="flex items-center justify-between px-4 pb-2">
                <span className="font-mono-num text-xs tracking-widest text-[var(--muted)]">编辑器</span>
                <button
                  type="button"
                  aria-label="关闭"
                  onClick={() => setOpen(false)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-2 -m-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-200"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            {/* 模式 Tab：与桌面 Inspector 一致 */}
            <EditorTabs />
            {/* 内容区：内部滚动，面板切换动画与 Inspector 相同 */}
            <div className="relative flex-1 min-h-0 overflow-y-auto">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={mode}
                  className="p-4"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } }}
                >
                  <Panel />
                </motion.div>
              </AnimatePresence>
            </div>
            {/* 底部 face 选择器：与桌面 Inspector 一致，artwork/filters 依赖 */}
            <FaceSwitcher />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
