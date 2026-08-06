export type FilterId =
  | "original" | "ascii" | "halftone" | "pixel" | "oilpainting"
  | "dither" | "comic" | "risograph" | "vhs" | "glitch"
  | "sketch" | "collage" | "filmnegative";

export type SpineStyle = "catalog" | "obi" | "vertical" | "transparent";

/**
 * react-easy-crop 的 croppedAreaPixels：像素坐标（相对旋转后媒体包围盒）。
 * 由 onCropComplete 的第二参提交；x/y/width/height 均为像素，已含缩放（zoom）造成的区域变化。
 */
export interface CropArea { x: number; y: number; width: number; height: number; }

/** 音乐来源：demo（合成音频，离线回退）| netease（第三方网易云 API，纯前端）。 */
export type TrackProvider = "demo" | "netease";

/** 曲目记录。不再存音频 URL（不持久化播放 URL）；音频由 MusicProvider 现取现播。 */
export interface CompilationTrack {
  id: string;
  provider: TrackProvider;
  providerTrackId?: number | null;  // 网易云歌曲 id；demo 为 null
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;              // 网易云封面（网络 URL，不落库为 blob）
  durationMs?: number;
  sourcePlaylistId?: number;        // 来源歌单 ID
  externalUrl?: string;             // 「在网易云打开」链接
}

/** 三类素材（正面/背面/盘面）统一状态。imageId 为 storedImages 表主键，运行时经 getImageUrl 取 Object URL。 */
export interface ArtworkState {
  sourceName: string | null;      // 原始文件名，占位与重置判断
  imageId: string | null;         // → storedImages 表主键；运行时经 getImageUrl 拿 Object URL
  crop: CropArea;                 // 裁剪区域（croppedAreaPixels，像素，已含 zoom）
  zoom: number;                   // 1..3（与 react-easy-crop 默认 maxZoom=3 一致）
  rotation: number;               // 度，-180..180
  filter: FilterId;
}

/** 落库图片：Blob 存 IndexedDB（storedImages 表）；项目记录只带 imageId 引用，无 base64。 */
export interface StoredImage {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  createdAt: number;
}

export interface CompilationProject {
  id: string;
  title: string;
  subtitle: string;
  curator: string;
  year: string;
  description: string;
  spineStyle: SpineStyle;
  theme: "light" | "dark";
  frontCover: ArtworkState;
  backCover: ArtworkState;
  discArtwork: ArtworkState;
  tracks: CompilationTrack[];
  activeTrackId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type EditorMode = "info" | "artwork" | "filters" | "spine" | "tracks";
export type FaceTarget = "front" | "back" | "disc";

export function blankArtwork(): ArtworkState {
  return { sourceName: null, imageId: null, crop: { x: 0, y: 0, width: 0, height: 0 }, zoom: 1, rotation: 0, filter: "original" };
}
