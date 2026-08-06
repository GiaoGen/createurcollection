export type FilterId =
  | "original" | "mono" | "contrast" | "faded" | "cold"
  | "deepblack" | "duotone" | "grain" | "softblur" | "invert";

export type SpineStyle = "catalog" | "obi" | "vertical" | "transparent";

/**
 * react-easy-crop 的 croppedAreaPixels：像素坐标（相对旋转后媒体包围盒）。
 * 由 onCropComplete 的第二参提交；x/y/width/height 均为像素，已含缩放（zoom）造成的区域变化。
 */
export interface CropArea { x: number; y: number; width: number; height: number; }

/** 三类素材（正面/背面/盘面）统一状态。imageUrl 为经 resize 后的可显示 URL（Blob URL 或 dataURL）。 */
export interface ArtworkState {
  sourceName: string | null;      // 原始文件名，占位与重置判断
  imageUrl: string | null;        // 处理后图像 URL（喂给纹理 / ExportCard）
  crop: CropArea;                 // 裁剪区域（croppedAreaPixels，像素，已含 zoom）
  zoom: number;                   // 1..3（与 react-easy-crop 默认 maxZoom=3 一致）
  rotation: number;               // 度，-180..180
  filter: FilterId;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;               // 秒（合成音频的实际长度）
  src: string;                    // 音频 URL（demo = data URI）
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
  tracks: Track[];
  activeTrackId: string | null;
}

export type EditorMode = "info" | "artwork" | "filters" | "spine" | "tracks";
export type FaceTarget = "front" | "back" | "disc";

export function blankArtwork(): ArtworkState {
  return { sourceName: null, imageUrl: null, crop: { x: 0, y: 0, width: 0, height: 0 }, zoom: 1, rotation: 0, filter: "original" };
}
