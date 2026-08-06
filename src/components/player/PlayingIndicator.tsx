"use client";

interface PlayingIndicatorProps {
  playing: boolean;
}

/**
 * 正在播放指示：3 条竖线波形。仅 transform（scaleY）动画，见 globals.css `cyc-wave`。
 * 暂停/未播时静态全高；播放时错峰跳动。宽度 w-6 与 TrackEditor 编号列对齐，行高稳定。
 */
export function PlayingIndicator({ playing }: PlayingIndicatorProps) {
  return (
    <span className="w-6 inline-flex items-center justify-center gap-[2px]" aria-label="正在播放" role="img">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`block w-[3px] rounded-full bg-[var(--foreground)] ${playing ? "cyc-wave" : ""}`}
          style={{ height: 12, transformOrigin: "bottom", animationDelay: `${i * 0.14}s` }}
        />
      ))}
    </span>
  );
}
