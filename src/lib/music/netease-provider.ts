import type { MusicProvider, PlayableSource, PlaybackRefusal, TrackMetadata, TrackSearchResult } from "./types";
import type { CompilationTrack } from "@/types/compilation";
import { isNeteaseAvailable, neteaseClient } from "@/lib/netease/client";
import { loadSession } from "@/lib/netease/auth";
import { getPlaybackUrl } from "@/lib/netease/playback";
import { normalizeTrack } from "@/lib/netease/normalize";
import type { NeteaseSearchResponse } from "@/lib/netease/types";

/**
 * 网易云真实 Provider（Task 18）：纯前端，浏览器直调第三方 API。
 * - search：/search 无需登录。
 * - resolve：不强制（T19 用 search/歌单直接取曲目），保持 null。
 * - getPlayableSource：携带 Cookie 现取播放地址；未登录/受限/不可播返回 PlaybackRefusal
 *   （判别：kind === "audio" 才可播），由引擎分流处理。绝不伪造可播地址。
 */
export class NeteaseProvider implements MusicProvider {
  isAvailable(): boolean {
    return isNeteaseAvailable();
  }

  async search(q: string): Promise<TrackSearchResult[]> {
    if (!isNeteaseAvailable() || !q.trim()) return [];
    try {
      const body = await neteaseClient.request<NeteaseSearchResponse>("/search", {
        params: { keywords: q.trim(), limit: 20 },
      });
      const songs = body.result?.songs ?? [];
      return songs.slice(0, 20).map((song) => {
        const t = normalizeTrack(song);
        return { id: String(song.id), title: t.title, artist: t.artist };
      });
    } catch {
      return [];
    }
  }

  async resolve(_input: string): Promise<TrackMetadata | null> {
    return null;
  }

  async getPlayableSource(track: CompilationTrack): Promise<PlayableSource | PlaybackRefusal | null> {
    if (track.provider !== "netease") return null; // 分发器只路由 netease 过来；防御性不处理其它
    if (!isNeteaseAvailable()) return { kind: "unavailable", reason: "网易云未启用" };
    const session = await loadSession();
    if (!session?.cookie) return { kind: "auth-required", reason: "请先登录网易云" };
    if (!track.providerTrackId) return { kind: "unavailable", reason: "缺少网易云歌曲 ID" };
    const res = await getPlaybackUrl(track.providerTrackId, session.cookie);
    if (res.availability === "playable" && res.url) {
      return {
        url: res.url,
        kind: "audio",
        duration: res.durationMs ? Math.round(res.durationMs / 1000) : undefined,
      };
    }
    if (res.availability === "vip-required") {
      return { kind: "restricted", reason: res.reason ?? "VIP/付费歌曲，当前账号暂无播放权限" };
    }
    return { kind: "unavailable", reason: res.reason ?? "暂无可播放地址" };
  }
}

/** 分发器直接引用的单例（provider.ts 按 track.provider 路由到它）。 */
export const neteaseProvider = new NeteaseProvider();
