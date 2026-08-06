import type { CropArea } from "@/types/compilation";

const MAX = 1200; // 输出长边上限
const JPEG_QUALITY = 0.92;

/** 计算旋转后媒体包围盒（自然像素）。 */
function rotateSize(w: number, h: number, rotation: number): { width: number; height: number } {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return { width: w * cos + h * sin, height: w * sin + h * cos };
}

/**
 * 把用户选中的裁剪区域烘焙为最终图像。
 * crop 为 react-easy-crop 的 croppedAreaPixels（像素，相对旋转后媒体包围盒）：
 * onCropComplete 的第二参已含缩放（zoom）造成的区域变化，因此无需再按 zoom 缩放画布。
 *
 * 管线（react-easy-crop getCroppedImg 范式）：
 *  1. 在旋转后包围盒尺寸的画布上，以中心旋转（不缩放 zoom）绘制完整图像；
 *  2. 把像素裁剪矩形直接复制到输出画布（长边上限 1200，JPEG 0.92）——矩形不会溢出画布。
 */
export async function cropImage(src: string, crop: CropArea, rotation: number): Promise<string> {
  const img = await loadImage(src);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // 旋转后包围盒（自然像素）
  const bbox = rotateSize(w, h, rotation);
  const cw = Math.max(1, Math.round(bbox.width));
  const ch = Math.max(1, Math.round(bbox.height));

  // 1) 渲染完整图像：仅中心旋转，不缩放 zoom（croppedAreaPixels 已含 zoom）
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  const rad = (rotation * Math.PI) / 180;
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(rad);
  ctx.translate(-w / 2, -h / 2);
  ctx.drawImage(img, 0, 0);

  // 2) 直接把 croppedAreaPixels（相对旋转后包围盒的像素矩形）复制到输出画布
  const sx = crop.x;
  const sy = crop.y;
  const sw = crop.width;
  const sh = crop.height;

  // 输出长边上限 1200（保持纵横比）
  const scale = Math.min(1, MAX / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d")!;
  octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, outW, outH);

  return out.toDataURL("image/jpeg", JPEG_QUALITY);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
