"use client";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { useCompilationStore } from "@/store/use-compilation-store";
import { fileToDataUrl, resizeImageToMax } from "@/lib/image/resize";
import { cropImage } from "@/lib/image/crop";

export function ArtworkEditor() {
  const face = useCompilationStore((s) => s.face);
  const art = useCompilationStore((s) => s.project[face === "front" ? "frontCover" : face === "back" ? "backCover" : "discArtwork"]);
  const setArtwork = useCompilationStore((s) => s.setArtwork);
  const [src, setSrc] = useState<string | null>(art.imageUrl);
  // Cropper 的实时状态：crop（px Point）与 zoom 只存本地，避免与 store 中已提交的
  // croppedAreaPixels（px，相对媒体包围盒）混用导致显示漂移。zoom/rotation 仍持久化到 store。
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(art.zoom);
  const fileRef = useRef<HTMLInputElement>(null);

  // 切换面（正面/背面/盘面）时同步预览源；src 保持未裁剪图，imageUrl 仅在应用裁剪后更新
  const prevFace = useRef(face);
  useEffect(() => {
    if (prevFace.current !== face) {
      prevFace.current = face;
      setSrc(art.imageUrl);
      // 新的编辑会话：crop 从原点开始（已应用并持久化的 imageUrl 不受影响），zoom 采用该面的已存值
      setCrop({ x: 0, y: 0 });
      setZoom(art.zoom);
    }
  }, [face, art.imageUrl, art.zoom]);

  // 追踪当前面，供异步操作（上传/裁剪）完成后校验：期间切换了面则丢弃结果，避免写入错误的面
  const currentFaceRef = useRef(face);
  useEffect(() => { currentFaceRef.current = face; }, [face]);

  const onFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const targetFace = face;
    const dataUrl = await fileToDataUrl(f);
    const resized = await resizeImageToMax(dataUrl);
    if (currentFaceRef.current !== targetFace) return; // 上传期间切换了面：丢弃本次结果
    setSrc(resized);              // 预览源（未裁剪）
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    // 新图重置裁剪参数；crop 为占位（尚未提交，onCropComplete 会写入 croppedAreaPixels），裁剪确认后写 imageUrl
    setArtwork(targetFace, { sourceName: f.name, crop: { x: 0, y: 0, width: 0, height: 0 }, zoom: 1, rotation: 0 });
  }, [face, setArtwork]);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setArtwork(face, { crop: croppedAreaPixels }); // 提交像素级裁剪区域（已含 zoom）
  }, [face, setArtwork]);

  const applyCrop = useCallback(async () => {
    if (!src) return;
    const targetFace = face;
    const out = await cropImage(src, art.crop, art.rotation); // art.crop 为 croppedAreaPixels（px）
    if (currentFaceRef.current !== targetFace) return; // 处理期间切换了面：不写入错误的面
    const old = art.imageUrl;
    setArtwork(targetFace, { imageUrl: out });
    if (old && old.startsWith("blob:")) URL.revokeObjectURL(old); // 释放旧 URL
  }, [src, art, face, setArtwork]);

  const reset = useCallback(() => {
    setSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArtwork(face, { sourceName: null, imageUrl: null, crop: { x: 0, y: 0, width: 0, height: 0 }, zoom: 1, rotation: 0 });
  }, [face, setArtwork]);

  return (
    <div className="space-y-4">
      <div className="relative h-56 rounded-xl overflow-hidden border border-[var(--line)]">
        <AnimatePresence mode="wait" initial={false}>
          {src ? (
            <motion.div
              key="cropper"
              className="absolute inset-0"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } }}
            >
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                rotation={art.rotation}
                aspect={1}
                onCropChange={(pos: Point) => setCrop(pos)} // 仅更新本地实时位置
                onZoomChange={(z: number) => { setZoom(z); setArtwork(face, { zoom: z }); }}
                onRotationChange={(r: number) => setArtwork(face, { rotation: r })}
                onCropComplete={onCropComplete}
              />
            </motion.div>
          ) : (
            <motion.div
              key="placeholder"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } }}
            >
              <button onClick={() => fileRef.current?.click()} className="w-full h-full grid place-items-center text-sm text-[var(--muted)]">
                点击上传{face === "front" ? "正面封面" : face === "back" ? "背面封面" : "盘面图"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      {src && (
        <>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">缩放</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => { const z = Number(e.target.value); setZoom(z); setArtwork(face, { zoom: z }); }}
                className="w-full"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">旋转</span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={art.rotation}
                onChange={(e) => setArtwork(face, { rotation: Number(e.target.value) })}
                className="w-full"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={applyCrop} className="flex-1 py-2 text-sm border border-[var(--strong-line)] rounded-lg">应用裁剪</button>
            <button onClick={reset} className="flex-1 py-2 text-sm text-[var(--muted)]">恢复默认</button>
          </div>
        </>
      )}
    </div>
  );
}
