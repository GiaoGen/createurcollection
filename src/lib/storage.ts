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

/** 相对时间（项目列表用）：刚刚 / N 分钟前 / N 小时前 / N 天前；更早显示「M月D日」。 */
export function formatRelativeTime(t: number): string {
  if (!t) return "—";
  const diff = Date.now() - t;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
