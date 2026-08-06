import type { CompilationTrack } from "@/types/compilation";

export interface TrackSearchResult { id: string; title: string; artist: string; }
export interface TrackMetadata { id: string; title: string; artist: string; duration?: number; }
export interface PlayableSource { url: string; kind: "audio"; duration?: number; }

/** 无法获得可播地址的原因。kind 供引擎/UI 分流。 */
export type PlaybackRefusal =
  | { kind: "auth-required"; reason: string }  // 未登录 / 登录失效
  | { kind: "restricted"; reason: string }     // VIP/付费/版权受限
  | { kind: "unavailable"; reason: string };   // 下架/地区限制/无 url/API 未启用

export interface MusicProvider {
  search(query: string): Promise<TrackSearchResult[]>;
  resolve(input: string): Promise<TrackMetadata | null>;
  getPlayableSource(track: CompilationTrack): Promise<PlayableSource | PlaybackRefusal | null>;
}
