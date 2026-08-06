"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Disc3, Pencil, Plus, Trash2, X } from "lucide-react";
import { useProjectsStore, type ProjectListItem } from "@/store/use-projects-store";
import { useCompilationStore } from "@/store/use-compilation-store";
import { formatRelativeTime } from "@/lib/storage";
import { useObjectUrl } from "@/lib/image/blobs";
import { BackupActions } from "@/components/export/BackupActions";

const FADE = { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } as const;
const PANEL = { duration: 0.32, ease: [0.22, 1, 0.36, 1] } as const;
const INSTANT = { duration: 0 } as const;
/** 删除二次确认的自动取消时长（防误触「确认删除」）。 */
const CONFIRM_TIMEOUT = 4000;

/**
 * 项目管理面板（T16，纯功能面板，非动效重点）：列表 + 新建 + 重命名 + 删除（确认）+ 打开。
 * 双端复用：桌面放贴边抽屉、移动端放底部 Sheet（见 ProjectsOverlay）。
 * 打开/新建后关闭面板进入编辑器；重命名/删除留在面板内可连续操作。
 */
export function ProjectManager({ onClose }: { onClose: () => void }) {
  const list = useProjectsStore((s) => s.list);
  const loading = useProjectsStore((s) => s.loading);
  const error = useProjectsStore((s) => s.error);
  const currentId = useCompilationStore((s) => s.project.id);
  const refresh = useProjectsStore((s) => s.refresh);
  const create = useProjectsStore((s) => s.create);
  const rename = useProjectsStore((s) => s.rename);
  const remove = useProjectsStore((s) => s.remove);
  const open = useProjectsStore((s) => s.open);
  const clearError = useProjectsStore((s) => s.clearError);

  // 内联编辑/确认态（组件层，非 store）：重命名中的行 + 草稿；确认删除中的行。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 面板每次打开刷新列表（db 为准，显示库中真实状态）并清掉上次残留的错误。
  useEffect(() => {
    clearError();
    void refresh();
  }, [refresh, clearError]);

  // 进入重命名态后聚焦输入框。
  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  // 确认删除停留过久自动取消，避免误触。
  useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirmId(null), CONFIRM_TIMEOUT);
    return () => clearTimeout(t);
  }, [confirmId]);

  const commitRename = () => {
    if (editingId) void rename(editingId, draft);
    setEditingId(null);
    setDraft("");
  };
  const cancelRename = () => {
    setEditingId(null);
    setDraft("");
  };

  const startEdit = (item: ProjectListItem) => {
    setConfirmId(null);
    setEditingId(item.id);
    setDraft(item.title);
  };
  const startDelete = (id: string) => {
    setEditingId(null);
    setConfirmId(id);
  };
  const cancelDelete = () => setConfirmId(null);
  const confirmDelete = async (id: string) => {
    setConfirmId(null);
    await remove(id);
  };

  const handleOpen = async (id: string) => {
    await open(id);
    onClose();
  };
  const handleCreate = async () => {
    await create();
    onClose();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 flex h-12 items-center justify-between border-b border-[var(--line)] px-4">
        <span className="font-mono-num text-xs tracking-widest text-[var(--muted)]">精选集</span>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="-m-1 rounded-lg p-2 text-[var(--muted)] transition-colors duration-200 hover:text-[var(--foreground)]"
        >
          <X size={18} />
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-2 flex shrink-0 items-center gap-1.5 border-l-2 border-[#dc2626]/60 px-2 py-1 text-xs leading-snug text-[#dc2626]/90">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleCreate()}
        className="mx-4 mt-3 flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--strong-line)] py-2 text-sm text-[var(--foreground)] transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)]"
      >
        <Plus size={15} /> 新建精选集
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading && list.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[var(--muted)]">加载中…</div>
        ) : list.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[var(--muted)]">还没有精选集，点击上方新建</div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {list.map((item) => (
              <ProjectRow
                key={item.id}
                item={item}
                isCurrent={item.id === currentId}
                isEditing={item.id === editingId}
                isConfirming={item.id === confirmId}
                draft={draft}
                inputRef={inputRef}
                onDraftChange={setDraft}
                onOpen={() => void handleOpen(item.id)}
                onStartEdit={() => startEdit(item)}
                onCommit={commitRename}
                onCancel={cancelRename}
                onStartDelete={() => startDelete(item.id)}
                onCancelDelete={cancelDelete}
                onConfirmDelete={() => void confirmDelete(item.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* 备份与恢复（T17）：导出 JSON / ZIP + 导入，纯浏览器文件下载/解析 */}
      <div className="shrink-0 border-t border-[var(--line)] px-4 py-3">
        <div className="mb-2 font-mono-num text-xs tracking-widest text-[var(--muted)]">备份与恢复</div>
        <BackupActions />
      </div>
    </div>
  );
}

/** 单行项目：封面缩略 + 标题/相对时间 + 重命名/删除（内联输入与二次确认）。 */
function ProjectRow({
  item,
  isCurrent,
  isEditing,
  isConfirming,
  draft,
  inputRef,
  onDraftChange,
  onOpen,
  onStartEdit,
  onCommit,
  onCancel,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  item: ProjectListItem;
  isCurrent: boolean;
  isEditing: boolean;
  isConfirming: boolean;
  draft: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onDraftChange: (v: string) => void;
  onOpen: () => void;
  onStartEdit: () => void;
  onCommit: () => void;
  onCancel: () => void;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const coverUrl = useObjectUrl(item.coverImageId);
  return (
    <li className="flex items-center gap-1 px-2 py-2">
      <button
        type="button"
        onClick={onOpen}
        title="打开精选集"
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        {/* 封面缩略：有 frontCover.imageId 显示小方块；无则图标占位 */}
        <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--line)] bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] text-[var(--muted)]">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Disc3 size={15} />
          )}
        </span>
        {isEditing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCommit();
              } else if (e.key === "Escape") {
                onCancel();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label="重命名精选集"
            className="min-w-0 flex-1 border-b border-[var(--strong-line)] bg-transparent text-sm text-[var(--foreground)] outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-[var(--foreground)]">
              {item.title || "未命名精选集"}
            </span>
            <span className="block font-mono-num text-[10px] text-[var(--muted)]">
              {formatRelativeTime(item.updatedAt)}
            </span>
          </span>
        )}
      </button>

      {/* 操作：常态按钮常显（移动端无 hover）；编辑态确认/取消；删除二次确认 */}
      {isConfirming ? (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onConfirmDelete}
            className="rounded-md border border-[#dc2626]/40 bg-[color-mix(in_srgb,#dc2626_12%,transparent)] px-2 py-1 text-xs text-[#dc2626]"
          >
            确认删除
          </button>
          <button type="button" onClick={onCancelDelete} aria-label="取消删除" className="rounded-md p-1.5 text-[var(--muted)] transition-colors duration-150 hover:text-[var(--foreground)]">
            <X size={14} />
          </button>
        </span>
      ) : isEditing ? (
        <span className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={onCommit} aria-label="保存重命名" className="rounded-md p-1.5 text-[var(--muted)] transition-colors duration-150 hover:text-[var(--foreground)]">
            <Check size={14} />
          </button>
          <button type="button" onClick={onCancel} aria-label="取消重命名" className="rounded-md p-1.5 text-[var(--muted)] transition-colors duration-150 hover:text-[var(--foreground)]">
            <X size={14} />
          </button>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={onStartEdit} aria-label="重命名" title="重命名" className="rounded-md p-1.5 text-[var(--muted)] transition-colors duration-150 hover:text-[var(--foreground)]">
            <Pencil size={14} />
          </button>
          <button type="button" onClick={onStartDelete} aria-label="删除" title="删除" className="rounded-md p-1.5 text-[var(--muted)] transition-colors duration-150 hover:text-[#dc2626]">
            <Trash2 size={14} />
          </button>
        </span>
      )}
      {isCurrent && !isEditing && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--foreground)]" title="当前项目" />
      )}
    </li>
  );
}

/**
 * 双端容器：桌面为贴边抽屉（Rail 右缘，覆盖 Stage/Inspector，从左侧滑入），
 * 移动端为底部 Sheet，复用同一个 ProjectManager 面板。motion 0.32s 出入场。
 */
export function ProjectsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduced = useReducedMotion();
  const fade = reduced ? INSTANT : FADE;
  const panel = reduced ? INSTANT : PANEL;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="desktop"
          className="fixed inset-0 z-40 hidden md:block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
        >
          <div className="absolute inset-0 bg-black/20" onClick={onClose} />
          <motion.div
            className="absolute bottom-0 left-16 top-0 flex w-[300px] flex-col border-r border-[var(--line)] bg-[var(--surface)]"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={panel}
          >
            <ProjectManager onClose={onClose} />
          </motion.div>
        </motion.div>
      )}
      {open && (
        <motion.div
          key="mobile"
          className="fixed inset-0 z-50 md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
        >
          <div className="absolute inset-0 bg-black/20" onClick={onClose} />
          <motion.div
            className="absolute inset-x-0 bottom-0 flex h-[70dvh] flex-col rounded-t-[20px] border-t border-[var(--line)] bg-[var(--surface)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={panel}
          >
            {/* 顶部拖拽把手（装饰；本项目面板不做拖拽关闭，交互从简） */}
            <div className="flex shrink-0 justify-center pb-1 pt-2">
              <div className="h-1 w-8 rounded-full bg-[var(--line)]" />
            </div>
            <ProjectManager onClose={onClose} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
