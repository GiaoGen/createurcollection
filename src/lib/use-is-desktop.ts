"use client";

import { useSyncExternalStore } from "react";

/** 桌面断点（≥768px，与 Tailwind `md` 一致）。 */
export const DESKTOP_MQ = "(min-width: 768px)";

/** 订阅 matchMedia 的 isDesktop；SSR 首帧取 false，客户端挂载后立即对齐真实断点。 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(DESKTOP_MQ);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(DESKTOP_MQ).matches,
    () => false
  );
}
