// 第三方原始数据 → 应用模型（Task 18）。
// normalizeTrack 只落歌曲元数据与网易云歌曲 ID，绝不落任何音频 URL。

import type { CompilationTrack } from "@/types/compilation";
import type { NeteasePlaybackResponse, NeteaseSong, PlaybackResolution } from "./types";

/** 第三方歌曲 → 应用曲目（provider="netease"，externalUrl 指向网易云网页）。 */
export function normalizeTrack(raw: NeteaseSong): CompilationTrack {
  const artist = (raw.ar ?? [])
    .map((a) => a?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0)
    .join(" / ");

  return {
    id: `netease-${raw.id}`,
    provider: "netease",
    providerTrackId: raw.id,
    title: raw.name ?? "未知曲目",
    artist: artist || "未知歌手",
    album: raw.al?.name,
    artworkUrl: raw.al?.picUrl,
    durationMs: raw.dt ?? raw.duration,
    externalUrl: `https://music.163.com/song?id=${raw.id}`,
  };
}

/** /song/url(/v1) 响应 → 播放解析。url 为空一律不可播，绝不伪造可播地址。 */
export function normalizePlayback(raw: NeteasePlaybackResponse): PlaybackResolution {
  const item = Array.isArray(raw.data) ? raw.data[0] : undefined;

  if (item?.url) {
    return {
      availability: "playable",
      url: item.url,
      durationMs: typeof item.time === "number" && item.time > 0 ? item.time : undefined,
    };
  }

  // 未授权/受限：fee 0 免费 / 1 VIP / 4 付费 / 8 数字专辑（第三方实例略有差异）。
  const fee = item?.fee;
  if (fee === 1 || fee === 4 || fee === 8) {
    return { availability: "vip-required", reason: "VIP/付费歌曲，当前账号暂无播放权限" };
  }
  return { availability: "unavailable", reason: "暂无可播放地址（可能下架、地区限制或需要登录）" };
}
