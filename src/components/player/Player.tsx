"use client";
import type { ReactNode } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { usePlayerEngine } from "@/hooks/use-player-engine";
import { useCompilationStore } from "@/store/use-compilation-store";
import { formatTime } from "@/lib/storage";
import { Progress } from "./Progress";
import { PlayingIndicator } from "./PlayingIndicator";

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
  const loading = useCompilationStore((s) => s.player.loading);
  const playerError = useCompilationStore((s) => s.player.error);
  const denied = useCompilationStore((s) => s.player.denied);
  const offline = useCompilationStore((s) => s.offline);

  const deniedKind = activeTrack ? denied[activeTrack.id] : undefined;
  const neteaseOffline = !!activeTrack && activeTrack.provider === "netease" && offline;

  // 状态行（第二行）优先级：受限 > 离线 > error > 正常 artist。
  // loading 在标题旁以静态灰态波形表示（下方第一行）。
  let status: ReactNode = activeTrack?.artist ?? "";
  if (deniedKind) {
    const href =
      activeTrack?.externalUrl ??
      (activeTrack?.providerTrackId ? `https://music.163.com/song?id=${activeTrack.providerTrackId}` : undefined);
    status = href ? (
      <>
        受限 ·{" "}
        <a href={href} target="_blank" rel="noreferrer" className="hover:underline">
          在网易云打开
        </a>
      </>
    ) : (
      "受限"
    );
  } else if (neteaseOffline) {
    status = "离线";
  } else if (playerError) {
    status = playerError;
  }

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
        <div className="text-sm truncate leading-tight flex items-center gap-1.5">
          <span className="truncate">{activeTrack?.title ?? "未选择曲目"}</span>
          {loading && (
            <span className="opacity-50 shrink-0" aria-label="加载中">
              <PlayingIndicator playing={false} />
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--muted)] truncate leading-tight">{status}</div>
      </div>
      <Progress currentTime={currentTime} duration={duration} onSeek={seek} />
      <span className="font-mono-num text-xs text-[var(--muted)] tabular-nums shrink-0">
        {formatTime(duration > 0 ? Math.min(currentTime, duration) : 0)} / {formatTime(duration)}
      </span>
    </div>
  );
}
