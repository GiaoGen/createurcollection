"use client";
import { useEffect } from "react";
import { ProjectRail } from "./ProjectRail";
import { CDStage } from "@/components/stage/CDStage";
import { Inspector } from "@/components/editor/Inspector";
import { Player } from "@/components/player/Player";
import { MobileHeader } from "./MobileHeader";
import { MobileEditorSheet } from "./MobileEditorSheet";
import { ExportCard } from "@/components/export/ExportCard";
import { exportCardPng } from "@/lib/export-image";
import { useCompilationStore } from "@/store/use-compilation-store";

export function AppShell() {
  const theme = useCompilationStore((s) => s.project.theme);
  const projectTitle = useCompilationStore((s) => s.project.title);
  // 同步 <html data-theme>：挂载时写一次，之后随 project.theme 变化。
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Rail 的导出按钮 dispatch `cyc:export` → 渲染隐藏 ExportCard 并下载 PNG。
  useEffect(() => {
    const onExport = async () => {
      const node = document.getElementById("cyc-export-card");
      if (!node) return;
      // 让任何在途的滤镜烘焙完成一帧后再抓取，避免导出到未就绪的封面。
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
      }
    };
    window.addEventListener("cyc:export", onExport);
    return () => window.removeEventListener("cyc:export", onExport);
  }, [projectTitle]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* 桌面：左 rail */}
      <ProjectRail className="hidden md:flex w-16 shrink-0 border-r border-[var(--line)]" />
      {/* 主区 + 移动端头 + 桌面底部 Player */}
      <div className="relative flex-1 flex flex-col min-w-0">
        <MobileHeader className="md:hidden" />
        {/* 桌面：Stage 与 Inspector 并排 */}
        <div className="flex flex-1 min-h-0">
          <main className="flex-1 min-h-0 relative">
            <CDStage />
          </main>
          <Inspector className="hidden md:flex w-[340px] shrink-0 border-l border-[var(--line)]" />
        </div>
        {/* 桌面 Player 横跨 Stage+Inspector 底部；移动端 Player 在头部下方固定底栏 */}
        <Player className="hidden md:flex h-[72px] shrink-0 border-t border-[var(--line)]" />
        <Player className="md:hidden" />
      </div>
      <MobileEditorSheet />
      {/* 隐藏的宣传图节点：position:fixed 移出视口，供 html-to-image 抓取 */}
      <ExportCard />
    </div>
  );
}
