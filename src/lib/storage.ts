export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 秒 → `m:ss`（秒取整补零）。非正时长显示占位。 */
export function formatTime(d: number): string {
  if (d <= 0) return "--:--";
  const m = Math.floor(d / 60);
  const s = String(Math.floor(d % 60)).padStart(2, "0");
  return `${m}:${s}`;
}
