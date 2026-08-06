"use client";

import { useEffect, useRef, useState } from "react";
import type { StoredImage } from "@/types/compilation";
import { createId } from "@/lib/storage";
import { getStoredImage, saveStoredImage } from "@/store/db";

const MAX_EDGE = 2048;      // 压缩最长边（CLAUDE.md：1600–2048px）
const WEBP_QUALITY = 0.85;

/** 解码 Blob/File → HTMLImageElement；Object URL 在本函数内创建并释放。 */
function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image decode failed")); };
    img.src = url;
  });
}

function webpSupported(): boolean {
  try {
    const c = document.createElement("canvas");
    return c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas encode failed"))), type, quality);
  });
}

/**
 * 上传图片压缩：校验类型（image/*）→ 最长边 ≤2048 等比缩放 → WebP 0.85
 * （不支持 webp 回退 JPEG；JPEG 无透明通道，透明区先铺白）。返回压缩 Blob 与尺寸。
 */
export async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (!file.type.startsWith("image/")) throw new Error(`unsupported file type: ${file.type}`);
  const img = await loadImageFromBlob(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);

  const type = webpSupported() ? "image/webp" : "image/jpeg";
  if (type === "image/jpeg") {
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  const blob = await canvasToBlob(canvas, type, WEBP_QUALITY);
  return { blob, width: w, height: h };
}

/** dataURL → Blob（裁剪/滤镜输出的 dataURL 转落库 Blob）。 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const head = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mime = /^data:([^;]+);/i.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * 压缩/裁剪后的 Blob 落库 storedImages，返回 StoredImage。
 * 宽度/高度缺省时从 blob 解码读取；解码失败回退 0。
 */
export async function storeImage(
  blob: Blob,
  width?: number,
  height?: number
): Promise<StoredImage> {
  let w = width;
  let h = height;
  if (!w || !h) {
    try {
      const img = await loadImageFromBlob(blob);
      w = img.naturalWidth;
      h = img.naturalHeight;
    } catch {
      w = 0;
      h = 0;
    }
  }
  const stored: StoredImage = {
    id: createId("img"),
    blob,
    width: w,
    height: h,
    createdAt: Date.now(),
  };
  await saveStoredImage(stored);
  return stored;
}

/** 读 storedImages 取 Blob → Object URL；缺失/无 id 时优雅返回 null（不崩溃）。 */
export async function getImageUrl(imageId: string | null | undefined): Promise<string | null> {
  if (!imageId) return null;
  const stored = await getStoredImage(imageId);
  if (!stored) return null;
  return URL.createObjectURL(stored.blob);
}

/** 释放 Object URL（仅 blob:，幂等）。 */
export function revokeObjectUrl(url: string | null | undefined): void {
  if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
}

/**
 * imageId → Object URL 的 hook（仅客户端组件使用）。
 *
 * `hold`（默认 true）为真时：持有上一张图直到新图加载完成，避免换图/裁剪确认瞬间闪烁
 * （stage 纹理 / ArtworkEditor / CSS 降级用）。
 * `hold=false` 时：imageId 变化即清空为 null 再异步加载，杜绝把旧图 URL 烘焙进新 imageId
 * 的缓存 key（FilterSelector 缩略图用，防缓存污染）。
 *
 * Object URL 生命周期：替换/卸载时自动 revoke；imageId 缺失优雅返回 null。
 */
export function useObjectUrl(imageId: string | null | undefined, hold = true): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 非 hold 或空 id：异步清空当前 URL（避免同步 setState，触发 set-state-in-effect）
    if (!hold || !imageId) {
      queueMicrotask(() => {
        if (cancelled) return;
        if (urlRef.current) {
          revokeObjectUrl(urlRef.current);
          urlRef.current = null;
        }
        setUrl(null);
      });
    }

    if (!imageId) return () => { cancelled = true; };

    getImageUrl(imageId).then((u) => {
      if (cancelled) {
        if (u) revokeObjectUrl(u);
        return;
      }
      if (urlRef.current) revokeObjectUrl(urlRef.current);
      urlRef.current = u;
      setUrl(u);
    });

    return () => { cancelled = true; };
  }, [imageId, hold]);

  // 卸载时释放当前 URL
  useEffect(() => () => revokeObjectUrl(urlRef.current), []);

  return url;
}
