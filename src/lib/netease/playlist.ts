// 歌单相关（Task 18）：用户歌单 / 红心歌曲 / 歌单曲目 / 公开歌单链接解析。
// 全部带 cookie（显式传递），结果进 TTL 缓存（歌单 6h）。

import { neteaseClient } from "./client";
import { normalizeTrack } from "./normalize";
import type {
  NeteaseLikelistResponse,
  NeteasePlaylistDetailResponse,
  NeteaseSongDetailResponse,
  NeteaseUserPlaylistResponse,
} from "./types";
import type { CompilationTrack } from "@/types/compilation";

export interface NeteasePlaylistSummary {
  id: number;
  name: string;
  coverImgUrl?: string;
  trackCount: number;
}

/** 当前用户歌单（含创建与收藏），limit 上限 100。 */
export async function getUserPlaylists(uid: number, cookie: string): Promise<NeteasePlaylistSummary[]> {
  const body = await neteaseClient.request<NeteaseUserPlaylistResponse>("/user/playlist", {
    params: { uid, limit: 100 },
    cookie,
  });
  const list = Array.isArray(body.playlist) ? body.playlist : [];
  return list
    .filter((p) => typeof p?.id === "number")
    .map((p) => ({
      id: p.id,
      name: p.name ?? "未命名歌单",
      coverImgUrl: p.coverImgUrl,
      trackCount: p.trackCount ?? 0,
    }));
}

/** 「我喜欢的音乐」歌曲 ID 列表。 */
export async function getLikedTrackIds(uid: number, cookie: string): Promise<number[]> {
  const body = await neteaseClient.request<NeteaseLikelistResponse>("/likelist", {
    params: { uid },
    cookie,
  });
  return Array.isArray(body.ids)
    ? body.ids.filter((n): n is number => typeof n === "number")
    : [];
}

/** 歌单全部曲目（归一化为应用 CompilationTrack）。 */
export async function getPlaylistTracks(
  playlistId: number,
  cookie: string,
): Promise<CompilationTrack[]> {
  const body = await neteaseClient.request<NeteasePlaylistDetailResponse>("/playlist/detail", {
    params: { id: playlistId },
    cookie,
  });
  const tracks = body.playlist?.tracks;
  return Array.isArray(tracks) ? tracks.map(normalizeTrack) : [];
}

/** /song/detail 批量取详情（「我喜欢的音乐」用）；按 50 分块。带 cookie。缺失 id 跳过。 */
export async function getSongsByIds(ids: number[], cookie: string): Promise<CompilationTrack[]> {
  if (ids.length === 0) return [];
  const CHUNK = 50;
  const out: CompilationTrack[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const body = await neteaseClient.request<NeteaseSongDetailResponse>("/song/detail", {
      params: { ids: chunk.join(",") },
      cookie,
    });
    if (Array.isArray(body.songs)) {
      for (const s of body.songs) {
        if (typeof s?.id === "number") out.push(normalizeTrack(s));
      }
    }
  }
  return out;
}

/**
 * 解析「网易云歌单链接」或裸 id。
 * 支持：纯数字 id、/playlist?id=123、?id=123、/playlist/123、music.163.com 分享短链中的 id。
 */
export function parsePlaylistInput(input: string): { kind: "id" | "link"; id: number } | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const id = Number(s);
    return Number.isSafeInteger(id) ? { kind: "id", id } : null;
  }
  const idMatch = s.match(/[?&]id=(\d+)/);
  if (idMatch) return { kind: "link", id: Number(idMatch[1]) };
  const pathMatch = s.match(/playlist[/#](\d+)/);
  if (pathMatch) return { kind: "link", id: Number(pathMatch[1]) };
  return null;
}
