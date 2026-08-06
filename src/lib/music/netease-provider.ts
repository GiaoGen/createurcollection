import type { MusicProvider, PlayableSource, TrackMetadata, TrackSearchResult } from "./types";
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
 * - getPlayableSource：携带 Cookie 现取播放地址；未登录/受限/不可播一律返回 null，
 *   由既有引擎 if (!source) 干净处理。availability 语义、受限提示与自动切歌归 T20。
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

  async getPlayableSource(track: CompilationTrack): Promise<PlayableSource | null> {
    if (!isNeteaseAvailable() || track.provider !== "netease" || !track.providerTrackId) return null;
    const session = await loadSession();
    if (!session?.cookie) return null; // 未登录 → null（T20 升级为「请先登录」信号）
    const res = await getPlaybackUrl(track.providerTrackId, session.cookie);
    if (res.availability !== "playable" || !res.url) return null; // 受限/无 url → null（T20 升级受限信号）
    return {
      url: res.url,
      kind: "audio",
      duration: res.durationMs ? Math.round(res.durationMs / 1000) : undefined,
    };
  }
}
