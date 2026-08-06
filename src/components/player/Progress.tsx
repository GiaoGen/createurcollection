"use client";

interface ProgressProps {
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
}

/** 细线可拖动进度条：样式见 globals.css `.player-progress`。 */
export function Progress({ currentTime, duration, onSeek }: ProgressProps) {
  const disabled = duration <= 0;
  return (
    <input
      type="range"
      min={0}
      max={duration > 0 ? duration : 1}
      step={0.1}
      value={duration > 0 ? Math.min(currentTime, duration) : 0}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label="播放进度"
      onChange={(e) => onSeek(Number(e.target.value))}
      className="player-progress flex-1 min-w-[72px]"
    />
  );
}
