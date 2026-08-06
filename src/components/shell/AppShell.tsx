"use client";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ProjectRail } from "./ProjectRail";
import { CDStage } from "@/components/stage/CDStage";
import { Inspector } from "@/components/editor/Inspector";
import { Player } from "@/components/player/Player";
import { MobileHeader } from "./MobileHeader";
import { MobileEditorSheet } from "./MobileEditorSheet";
import { ProjectsOverlay } from "@/components/projects/ProjectManager";
import { NeteasePicker } from "@/components/editor/NeteasePicker";
import { ExportCard } from "@/components/export/ExportCard";
import { exportCardPng } from "@/lib/export-image";
import { getLatestCoverBake } from "@/lib/export-bake";
import { useCompilationStore } from "@/store/use-compilation-store";
import { useIsDesktop, DESKTOP_MQ } from "@/lib/use-is-desktop";

export function AppShell() {
  const theme = useCompilationStore((s) => s.project.theme);
  const projectTitle = useCompilationStore((s) => s.project.title);
  const setOffline = useCompilationStore((s) => s.setOffline);
  // IndexedDB 引导完成前渲染占位，避免“demo 项目”闪现后切到真实项目（视觉跳变）。
  const hydrated = useCompilationStore((s) => s.hydrated);
  // 移动端 Bottom Sheet 打开时 Stage 轻微上移缩小；桌面 Sheet 为 md:hidden 不触发。
  const mobileSheetOpen = useCompilationStore((s) => s.mobileSheetOpen);
  const setMobileSheetOpen = useCompilationStore((s) => s.setMobileSheetOpen);
  // 桌面断点：Stage 缩小生效条件再加 !isDesktop，保证桌面永不缩小。
  const isDesktop = useIsDesktop();
  // 导出失败时显示的轻量提示（成功不提示）。
  const [exportError, setExportError] = useState<string | null>(null);
  // 项目管理面板开关（桌面抽屉 / 移动端 Sheet 共享同一状态与面板）。
  const [projectsOpen, setProjectsOpen] = useState(false);
  // 打开项目面板时顺手收起移动端编辑 Sheet，避免两个全屏层叠。
  const openProjects = () => {
    setMobileSheetOpen(false);
    setProjectsOpen(true);
  };
  // 同步 <html data-theme>：挂载时写一次，之后随 project.theme 变化。
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  // 设备在线状态 → setOffline（网易云曲目断网不可播，demo 不受影响；跨 loadProject 存活）。
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [setOffline]);
  // reduced-motion：Stage 位移 spring 压不到（JS spring 不归全局 CSS 管），
  // 这里改为瞬态。注意与 M-3 一致：useReducedMotion 是挂载快照非实时订阅。
  const reduced = useReducedMotion();

  // Rail 的导出按钮 dispatch `cyc:export` → 渲染隐藏 ExportCard 并下载 PNG。
  useEffect(() => {
    let errorTimer: ReturnType<typeof setTimeout> | null = null;
    const onExport = async () => {
      const node = document.getElementById("cyc-export-card");
      if (!node) return;
      // 先等待 ExportCard 最近一次在飞的封面烘焙 settle——用户刚换滤镜/刚上传
      // 封面就点导出时，避免抓到旧的烘焙结果或 "NO COVER" 占位。烘焙失败则不
      // 阻塞导出，用当前已渲染的封面。
      try {
        await getLatestCoverBake();
      } catch {
        // bake rejected → capture whatever cover is already rendered
      }
      // 烘焙 settle 后再给 React 一帧把 dataURL 提交进 <img>，然后抓取。
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        const url = await exportCardPng(node);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${projectTitle.trim() || "collection"}.png`;
        a.click();
        // toPng 返回 dataURL（非 blob URL），无需 revoke。
      } catch (error) {
        console.error("export failed", error);
        setExportError("导出失败，请重试");
        if (errorTimer) clearTimeout(errorTimer);
        errorTimer = setTimeout(() => setExportError(null), 2600);
      }
    };
    window.addEventListener("cyc:export", onExport);
    return () => {
      window.removeEventListener("cyc:export", onExport);
      if (errorTimer) clearTimeout(errorTimer);
    };
  }, [projectTitle]);

  // 跨断点自动收口：手机打开 Sheet 后旋转/拉伸到 ≥768px，Sheet 与 MobileHeader 编辑
  // 按钮 md:hidden 消失但 open 仍为 true，状态残留且无 UI 可重置。这里在进入桌面断点
  // 时清掉 open 标志（setState 放 matchMedia 回调里，避开 set-state-in-effect）。
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileSheetOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setMobileSheetOpen]);

  if (!hydrated) {
    return <div className="h-full w-full bg-[var(--background)]" aria-hidden />;
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* 桌面：左 rail */}
      <ProjectRail className="hidden md:flex w-16 shrink-0 border-r border-[var(--line)]" onOpenProjects={openProjects} />
      {/* 主区 + 移动端头 + 桌面底部 Player */}
      <div className="relative flex-1 flex flex-col min-w-0">
        <MobileHeader className="md:hidden" onOpenProjects={openProjects} />
        {/* 桌面：Stage 与 Inspector 并排 */}
        <div className="flex flex-1 min-h-0">
          <motion.main
            className="flex-1 min-h-0 relative"
            animate={{ scale: mobileSheetOpen && !isDesktop ? 0.96 : 1, y: mobileSheetOpen && !isDesktop ? -8 : 0 }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 28, mass: 0.8 }}
          >
            <CDStage />
          </motion.main>
          <Inspector className="hidden md:flex w-[340px] shrink-0 border-l border-[var(--line)]" />
        </div>
        {/* 桌面 Player 横跨 Stage+Inspector 底部；移动端 Player 在头部下方固定底栏 */}
        <Player className="hidden md:flex h-[72px] shrink-0 border-t border-[var(--line)]" />
        <Player className="md:hidden border-t border-[var(--line)]" />
      </div>
      <MobileEditorSheet />
      {/* 项目管理面板：桌面贴边抽屉 / 移动端底部 Sheet，同一 open 状态 */}
      <ProjectsOverlay open={projectsOpen} onClose={() => setProjectsOpen(false)} />
      {/* 网易云添加：桌面居中弹层 / 移动端底部 Sheet，z-[60] 盖于编辑 Sheet 与项目面板之上 */}
      <NeteasePicker />
      {/* 隐藏的宣传图节点：position:fixed 移出视口，供 html-to-image 抓取 */}
      <ExportCard />
      {/* 导出失败的轻量提示：固定底栏上方，避免看起来像假按钮 */}
      {exportError ? (
        <div className="pointer-events-none fixed left-1/2 bottom-24 z-50 -translate-x-1/2 rounded-full border border-[var(--strong-line)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] shadow-lg">
          {exportError}
        </div>
      ) : null}
    </div>
  );
}
