import type { CropArea } from "@/types/compilation";

export async function cropImage(src: string, crop: CropArea, zoom: number, rotation: number): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const MAX = 1200;
  const w = img.naturalWidth, h = img.naturalHeight;
  const scaleX = w / crop.width, scaleY = h / crop.height; // crop 为相对比例
  const outputW = Math.round(Math.min(MAX, crop.width * scaleX));
  const outputH = Math.round(Math.min(MAX, crop.height * scaleY));
  canvas.width = outputW; canvas.height = outputH;
  ctx.translate(outputW / 2, outputH / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(zoom, zoom);
  ctx.translate(-w / 2, -h / 2);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
