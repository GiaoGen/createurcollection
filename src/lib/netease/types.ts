// 网易云 API 原始响应骨架类型 + 应用模型（Task 18）。
// 只定义本任务用到的字段，够用即可；不穷举全部响应字段。

/** 客户端统一错误类别。cors 与 network 在 fetch 层难以精确区分（TypeError: Failed to fetch），
 *  统一归一为 network，cors 保留给需要精细处理的调用方识别。 */
export type NeteaseErrorKind = "timeout" | "network" | "cors" | "api" | "http";

export class NeteaseError extends Error {
  readonly kind: NeteaseErrorKind;
  readonly status?: number;
  readonly code?: number;

  constructor(kind: NeteaseErrorKind, message: string, details?: { status?: number; code?: number }) {
    super(message);
    this.name = "NeteaseError";
    this.kind = kind;
    this.status = details?.status;
    this.code = details?.code;
  }
}

/** 播放受限语义：playable 可播；vip-required 需会员/付费；unavailable 其它不可播。 */
export type PlaybackAvailability = "playable" | "vip-required" | "unavailable";

export interface PlaybackResolution {
  availability: PlaybackAvailability;
  /** availability === "playable" 时非空；否则为空（不落任何持久存储，仅内存）。 */
  url?: string;
  durationMs?: number;
  /** 非 playable 的原因（如「需要登录」「VIP 或版权受限」）。 */
  reason?: string;
}

/** 网易云「记住登录」会话：仅用户主动开启 remember 时才写入 IndexedDB（sessions 表）。 */
export interface StoredNeteaseSession {
  cookie: string;
  nickname: string;
  avatarUrl?: string;
  userId: number;
  loggedInAt: number;
}

// ---------------------------------------------------------------------------
// 第三方 API 响应骨架（第三方实例各异，字段尽量兼容）
// ---------------------------------------------------------------------------

/** 统一响应骨架：大多数实例返回 { code, message?, msg?, data? }。 */
export interface NeteaseApiResponse {
  code?: number;
  message?: string;
  msg?: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface NeteaseQrKeyResponse extends NeteaseApiResponse {
  data?: { unikey?: string };
  unikey?: string;
}

export interface NeteaseQrCreateResponse extends NeteaseApiResponse {
  data?: { qrimg?: string; qrurl?: string };
  qrimg?: string;
  qrurl?: string;
}

export interface NeteaseQrCheckResponse extends NeteaseApiResponse {
  cookie?: string;
  data?: { code?: number; cookie?: string };
}

export interface NeteaseProfile {
  nickname: string;
  avatarUrl?: string;
  userId: number;
}

export interface NeteaseLoginStatusResponse extends NeteaseApiResponse {
  data?: { profile?: NeteaseProfile };
  profile?: NeteaseProfile;
}

export interface NeteaseUserDetailResponse extends NeteaseApiResponse {
  profile?: NeteaseProfile;
}

/** 第三方歌曲（/search、/playlist/detail 的 tracks、song/detail 等）。 */
export interface NeteaseSong {
  id: number;
  name?: string;
  ar?: Array<{ id?: number; name?: string }>;
  al?: { id?: number; name?: string; picUrl?: string };
  /** 时长（毫秒）。 */
  dt?: number;
  duration?: number;
  /** 0 免费 / 1 VIP / 4 付费 / 8 数字专辑（不同实例略有差异）。 */
  fee?: number;
}

export interface NeteaseSearchResponse extends NeteaseApiResponse {
  result?: { songs?: NeteaseSong[]; songCount?: number };
}

/** /user/playlist 返回的歌单项（字段可选，playlist.ts 负责归一化）。 */
export interface NeteasePlaylistItem {
  id: number;
  name?: string;
  coverImgUrl?: string;
  trackCount?: number;
}

export interface NeteaseUserPlaylistResponse extends NeteaseApiResponse {
  playlist?: NeteasePlaylistItem[];
}

export interface NeteaseLikelistResponse extends NeteaseApiResponse {
  ids?: number[];
}

export interface NeteasePlaylistDetailResponse extends NeteaseApiResponse {
  playlist?: {
    id?: number;
    name?: string;
    coverImgUrl?: string;
    trackCount?: number;
    tracks?: NeteaseSong[];
  };
}

/** /song/detail 批量取歌曲详情（我喜欢的音乐用）。 */
export interface NeteaseSongDetailResponse extends NeteaseApiResponse {
  songs?: NeteaseSong[];
}

/** /song/url/v1 与 /song/url 的单条数据项。 */
export interface NeteasePlaybackItem {
  id?: number;
  url?: string;
  br?: number;
  size?: number;
  /** 时长（毫秒）。 */
  time?: number;
  fee?: number;
  level?: string;
  type?: string;
}

export interface NeteasePlaybackResponse extends NeteaseApiResponse {
  data?: NeteasePlaybackItem[];
}
