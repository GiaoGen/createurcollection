"use client";

import JSZip from "jszip";
import type {
  ArtworkState,
  CompilationProject,
  CompilationTrack,
  FilterId,
  SpineStyle,
} from "@/types/compilation";
import { getStoredImage } from "@/store/db";
import { storeImage } from "@/lib/image/blobs";
import { createId } from "@/lib/storage";

/**
 * 项目备份导出/导入（T17，纯浏览器，无任何后端）：
 * - 导出 JSON（.album.json）：project 元数据 + 三面图片内嵌 base64；
 * - 导出 ZIP（.album.zip）：project.json + images/front|back|disc.<ext>（原 blob 不重新编码）；
 * - 导入：按文件名后缀/MIME 分支解析，校验结构，一律以「新 project id」重建，
 *   图片经 storeImage 重存并回写新 imageId（防止覆盖库中已有项目、防止失效引用）。
 * 导出内容只含项目元数据（曲目 artworkUrl 是网易云封面网络 URL，属元数据可保留），不含任何 Cookie/登录态。
 */

/** 备份文件识别失败/结构不符时抛出的统一文案（由 BackupActions 内联展示，不弹 Toast）。 */
const UNRECOGNIZED = "无法识别的备份文件";

/** 三类素材 key（对应 CompilationProject 的三个 ArtworkState 字段）。 */
type FaceKey = "front" | "back" | "disc";

/** JSON 内嵌图片段。 */
interface BackupImage {
  name: string;
  mime: string;
  data: string; // base64
}

/** .album.json 顶层结构。 */
interface AlbumJson {
  kind: "cyc-album";
  version: 1;
  exportedAt: number;
  project: CompilationProject;
  images: Partial<Record<FaceKey, BackupImage>>;
}

const FACE_KEYS: { face: FaceKey; key: "frontCover" | "backCover" | "discArtwork" }[] = [
  { face: "front", key: "frontCover" },
  { face: "back", key: "backCover" },
  { face: "disc", key: "discArtwork" },
];

const VALID_SPINE: SpineStyle[] = ["catalog", "obi", "vertical", "transparent"];
const VALID_FILTERS: FilterId[] = [
  "original", "ascii", "halftone", "pixel", "oilpainting",
  "dither", "comic", "risograph", "vhs", "glitch", "sketch", "collage", "filmnegative",
];

/** blob → base64（chunk 拼接，避免 String.fromCharCode 传参超栈溢出，写法同 synthesize.ts）。 */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** base64 → Blob（导入 JSON 内嵌图用，与 blobToBase64 互逆）。 */
function base64ToBlob(data: string, mime: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** blob.type → 扩展名（webp→webp、jpeg→jpg、png→png；未知回落 img）。 */
function extFromMime(mime: string): string {
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  return "img";
}

/** 扩展名 → mime（ZIP 不存 mime，导入时按文件名反推，保证落库 blob 类型正确）。 */
function mimeFromExt(ext: string): string {
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return "application/octet-stream";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 导出文件名：标题（非法路径字符替换为 -）或回落 collection + .album.json/.album.zip。 */
function albumFilename(project: CompilationProject, ext: "json" | "zip"): string {
  const base = project.title.trim().replace(/[\\/:*?"<>|]/g, "-") || "collection";
  return `${base}.album.${ext}`;
}

/** 把任意未知数据规范化为 ArtworkState：缺字段回默认，保证导入后编辑器不崩。 */
function normalizeArtwork(raw: unknown): ArtworkState {
  const a = isRecord(raw) ? raw : {};
  const crop = isRecord(a.crop) ? a.crop : {};
  return {
    sourceName: typeof a.sourceName === "string" ? a.sourceName : null,
    imageId: typeof a.imageId === "string" ? a.imageId : null,
    crop: {
      x: typeof crop.x === "number" ? crop.x : 0,
      y: typeof crop.y === "number" ? crop.y : 0,
      width: typeof crop.width === "number" ? crop.width : 0,
      height: typeof crop.height === "number" ? crop.height : 0,
    },
    zoom: typeof a.zoom === "number" ? a.zoom : 1,
    rotation: typeof a.rotation === "number" ? a.rotation : 0,
    filter:
      typeof a.filter === "string" && (VALID_FILTERS as string[]).includes(a.filter)
        ? (a.filter as FilterId)
        : "original",
  };
}

/**
 * 把备份里的 project 段规范化为 CompilationProject：
 * 校验最小结构（title / tracks 数组 / 三 face），缺字段补默认；tracks 逐条保字段并确保有 id。
 * 一律重建 id 与时间戳（导入即新建项目，防止覆盖库中已有同名项目）。
 */
function normalizeProject(raw: unknown): CompilationProject {
  if (
    !isRecord(raw) ||
    typeof raw.title !== "string" ||
    !Array.isArray(raw.tracks) ||
    !isRecord(raw.frontCover) ||
    !isRecord(raw.backCover) ||
    !isRecord(raw.discArtwork)
  ) {
    throw new Error(UNRECOGNIZED);
  }
  // 逐条保字段，仅确保有 id（无 id 的旧备份补一个），防止列表 key 为 undefined。
  const tracks: CompilationTrack[] = (raw.tracks as unknown[])
    .filter(isRecord)
    .map((t) => {
      const id = typeof t.id === "string" && t.id ? t.id : createId("trk");
      return { ...t, id } as unknown as CompilationTrack;
    });
  return {
    id: createId("proj"),
    title: raw.title,
    subtitle: typeof raw.subtitle === "string" ? raw.subtitle : "",
    curator: typeof raw.curator === "string" ? raw.curator : "",
    year: typeof raw.year === "string" ? raw.year : "",
    description: typeof raw.description === "string" ? raw.description : "",
    spineStyle:
      typeof raw.spineStyle === "string" && (VALID_SPINE as string[]).includes(raw.spineStyle)
        ? (raw.spineStyle as SpineStyle)
        : "catalog",
    theme: raw.theme === "dark" ? "dark" : "light",
    frontCover: normalizeArtwork(raw.frontCover),
    backCover: normalizeArtwork(raw.backCover),
    discArtwork: normalizeArtwork(raw.discArtwork),
    tracks,
    activeTrackId: typeof raw.activeTrackId === "string" ? raw.activeTrackId : null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function artworkRef(project: CompilationProject, face: FaceKey): ArtworkState {
  return face === "front" ? project.frontCover : face === "back" ? project.backCover : project.discArtwork;
}

/** 导出 JSON（.album.json）：project 元数据 + 三面内嵌 base64 图（无图该项省略）。 */
export async function exportAlbumJson(
  project: CompilationProject
): Promise<{ blob: Blob; filename: string }> {
  const images: Partial<Record<FaceKey, BackupImage>> = {};
  await Promise.all(
    FACE_KEYS.map(async ({ face, key }) => {
      const imageId = project[key].imageId;
      if (!imageId) return;
      const stored = await getStoredImage(imageId);
      if (!stored) return;
      const mime = stored.blob.type || "image/jpeg";
      const name = project[key].sourceName || `${face}.${extFromMime(mime)}`;
      images[face] = { name, mime, data: await blobToBase64(stored.blob) };
    })
  );
  const payload: AlbumJson = { kind: "cyc-album", version: 1, exportedAt: Date.now(), project, images };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  return { blob, filename: albumFilename(project, "json") };
}

/** 导出 ZIP：project.json + images/front|back|disc.<ext>（原 blob，不重新编码）。 */
export async function exportZip(
  project: CompilationProject
): Promise<{ blob: Blob; filename: string }> {
  const zip = new JSZip();
  zip.file("project.json", JSON.stringify(project, null, 2));
  await Promise.all(
    FACE_KEYS.map(async ({ face, key }) => {
      const imageId = project[key].imageId;
      if (!imageId) return;
      const stored = await getStoredImage(imageId);
      if (!stored) return;
      const ext = extFromMime(stored.blob.type || "image/jpeg");
      zip.file(`images/${face}.${ext}`, stored.blob);
    })
  );
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/zip" });
  return { blob, filename: albumFilename(project, "zip") };
}

/** JSON 导入：解析 .album.json / .json，校验 kind/version，重建项目并重存图片。 */
async function importJson(blob: Blob): Promise<CompilationProject> {
  let text: string;
  try {
    text = await blob.text();
  } catch {
    throw new Error(UNRECOGNIZED);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(UNRECOGNIZED);
  }
  if (!isRecord(data) || data.kind !== "cyc-album" || data.version !== 1 || !isRecord(data.project)) {
    throw new Error(UNRECOGNIZED);
  }
  const project = normalizeProject(data.project);
  const images = isRecord(data.images) ? data.images : {};
  for (const face of ["front", "back", "disc"] as FaceKey[]) {
    const img = isRecord(images[face]) ? images[face] : null;
    if (img && typeof img.data === "string") {
      try {
        const mime = typeof img.mime === "string" && img.mime ? img.mime : "image/jpeg";
        const stored = await storeImage(base64ToBlob(img.data, mime));
        artworkRef(project, face).imageId = stored.id;
      } catch {
        artworkRef(project, face).imageId = null; // 单张图损坏不阻塞整体导入
      }
    } else {
      artworkRef(project, face).imageId = null; // 备份无此面图片 → 置空，不留指向旧库的失效 imageId
    }
  }
  return project;
}

/** ZIP 导入：解包 → project.json → 重建项目；images/front|back|disc.* 重存。 */
async function importZip(blob: Blob): Promise<CompilationProject> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(blob);
  } catch {
    throw new Error(UNRECOGNIZED);
  }
  const entry = zip.file("project.json");
  if (!entry) throw new Error(UNRECOGNIZED);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await entry.async("string"));
  } catch {
    throw new Error(UNRECOGNIZED);
  }
  const project = normalizeProject(parsed);
  for (const face of ["front", "back", "disc"] as FaceKey[]) {
    const imgEntry = findZipImage(zip, face);
    if (imgEntry) {
      try {
        const data = await imgEntry.async("arraybuffer");
        const dot = imgEntry.name.lastIndexOf(".");
        const ext = dot >= 0 ? imgEntry.name.slice(dot + 1).toLowerCase() : "";
        const stored = await storeImage(new Blob([data], { type: mimeFromExt(ext) }));
        artworkRef(project, face).imageId = stored.id;
      } catch {
        artworkRef(project, face).imageId = null;
      }
    } else {
      artworkRef(project, face).imageId = null;
    }
  }
  return project;
}

/** 在 ZIP 里找 images/<face>.*（任意扩展名；目录项跳过）。 */
function findZipImage(zip: JSZip, face: FaceKey): JSZip.JSZipObject | null {
  const prefix = `images/${face}.`;
  for (const name of Object.keys(zip.files)) {
    if (name.startsWith(prefix)) {
      const f = zip.files[name];
      if (!f.dir) return f;
    }
  }
  return null;
}

/** 统一入口：按文件名后缀 / MIME 分支到 JSON 或 ZIP 导入，返回重建后的新项目。 */
export async function importAlbum(
  blob: Blob,
  filename: string
): Promise<{ project: CompilationProject }> {
  const lower = filename.toLowerCase();
  const isZip =
    lower.endsWith(".zip") ||
    blob.type === "application/zip" ||
    blob.type === "application/x-zip-compressed";
  return { project: isZip ? await importZip(blob) : await importJson(blob) };
}
