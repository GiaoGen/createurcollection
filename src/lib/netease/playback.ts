// 播放地址（Task 18）：/song/url/v1 优先，失败/空 url 回退 /song/url。
// 播放 URL 只做内存短缓存（≤5min），绝不落任何持久存储。

import { neteaseClient } from "./client";
import { normalizePlayback } from "./normalize";
import type { NeteasePlaybackResponse, PlaybackResolution } from "./types";

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { expiresAt: number; res: PlaybackResolution }>();

/**
 * 取歌曲播放地址（需登录态 Cookie）。
 * - 优先 /song/url/v1（level=standard）；空 url / 结构不兼容 / 抛错 → 回退 /song/url。
 * - 结果内存缓存 ≤5min；播放过期由上层 clearPlaybackCache(id) 后重试（T20）。
 * - 受限/VIP/不可播：availability 非 playable、url 空，绝不伪造可播地址。
 */
export async function getPlaybackUrl(id: number, cookie: string): Promise<PlaybackResolution> {
  const key = `song-${id}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.res;

  let res: PlaybackResolution | null = null;
  try {
    const body = await neteaseClient.request<NeteasePlaybackResponse>("/song/url/v1", {
      params: { id, level: "standard" },
      cookie,
    });
    res = normalizePlayback(body);
  } catch {
    res = null;
  }

  // v1 失败或不可播 → 回退 /song/url（不假定所有第三方实例支持 v1）。
  if (!res || res.availability !== "playable" || !res.url) {
    try {
      const body = await neteaseClient.request<NeteasePlaybackResponse>("/song/url", {
        params: { id },
        cookie,
      });
      res = normalizePlayback(body);
    } catch {
      res = { availability: "unavailable", reason: "获取播放地址失败" };
    }
  }

  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, res });
  return res;
}

/** 清除播放地址缓存：指定歌曲（无参则全部）。播放过期重试时由上层调用。 */
export function clearPlaybackCache(id?: number): void {
  if (typeof id === "number") {
    cache.delete(`song-${id}`);
  } else {
    cache.clear();
  }
}
