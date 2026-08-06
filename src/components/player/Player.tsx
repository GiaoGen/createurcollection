"use client";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { usePlayerEngine } from "@/hooks/use-player-engine";
import { useCompilationStore } from "@/store/use-compilation-store";
import { formatTime } from "@/lib/storage";
import { Progress } from "./Progress";

/**
 * 底部单层播放器（AppShell 已负责定位与 border-t，勿重复加边框）。
 * 引擎为模块级单例（use-player-engine），桌面/移动两个实例共享同一 <audio>。
 * 行点击只选中不播放；播放仅由 Play 按钮触发。
 */
export function Player({ className = "" }: { className?: string }) {
  const { activeTrack, toggle, next, prev, seek } = usePlayerEngine();
  const isPlaying = useCompilationStore((s) => s.player.isPlaying);
  const currentTime = useCompilationStore((s) => s.player.currentTime);
  const duration = useCompilationStore((s) => s.player.duration);
  const hasTracks = useCompilationStore((s) => s.project.tracks.length > 0);

  const control =
    "p-2 rounded-lg text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] transition-colors duration-200 disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div className={`${className} flex items-center gap-3 px-4 py-2 bg-[var(--surface)]`}>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" aria-label="上一首" onClick={prev} disabled={!hasTracks} className={control}>
          <SkipBack size={18} />
        </button>
        <button type="button" aria-label={isPlaying ? "暂停" : "播放"} onClick={toggle} disabled={!hasTracks} className={control}>
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button type="button" aria-label="下一首" onClick={next} disabled={!hasTracks} className={control}>
          <SkipForward size={18} />
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate leading-tight">{activeTrack?.title ?? "未选择曲目"}</div>
        <div className="text-xs text-[var(--muted)] truncate leading-tight">{activeTrack?.artist ?? ""}</div>
      </div>
      <Progress currentTime={currentTime} duration={duration} onSeek={seek} />
      <span className="font-mono-num text-xs text-[var(--muted)] tabular-nums shrink-0">
        {formatTime(duration > 0 ? Math.min(currentTime, duration) : 0)} / {formatTime(duration)}
      </span>
    </div>
  );
}
