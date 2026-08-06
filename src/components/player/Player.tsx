"use client";
import { Play, Pause } from "lucide-react";
import { useCompilationStore } from "@/store/use-compilation-store";

// Task 5 占位：Task 11 将替换为完整播放器引擎 + 进度 + 唱片联动。
export function Player({ className = "" }: { className?: string }) {
  const isPlaying = useCompilationStore((s) => s.player.isPlaying);
  const setIsPlaying = useCompilationStore((s) => s.setIsPlaying);
  return (
    <div className={`${className} flex items-center gap-3 px-4 py-3 border-t border-[var(--line)] bg-[var(--surface)]`}>
      <button type="button" aria-label={isPlaying ? "暂停" : "播放"}
        onClick={() => setIsPlaying(!isPlaying)}
        className="p-2 rounded-lg text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] transition-colors duration-200">
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <span className="font-mono-num text-xs tracking-widest text-[var(--muted)]">PLAYER</span>
    </div>
  );
}
