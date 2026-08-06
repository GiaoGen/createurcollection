"use client";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { useCompilationStore } from "@/store/use-compilation-store";
import { MAX_FILE_BYTES, compressImage, dataUrlToBlob, storeImage, revokeObjectUrl, getImageUrl } from "@/lib/image/blobs";
import { cropImage } from "@/lib/image/crop";

export function ArtworkEditor() {
  const face = useCompilationStore((s) => s.face);
  const art = useCompilationStore((s) => s.project[face === "front" ? "frontCover" : face === "back" ? "backCover" : "discArtwork"]);
  const setArtwork = useCompilationStore((s) => s.setArtwork);
  // 尚未提交的本地上传预览（压缩后 Object URL）；applyCrop 提交后仍保留，供继续再裁。
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const pendingUrlRef = useRef<string | null>(null);
  // 会话裁剪源：当前面已提交图的 Object URL，进入该面时加载。
  // 关键：applyCrop 提交新 imageId 时【不】替换此源——无新上传时二次应用裁剪仍从本会话的
  // 原始源派生（与旧版一致），不会裁剪复合叠加，也不在确认瞬间闪占位。
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const sessionUrlRef = useRef<string | null>(null);
  // Cropper 的实时状态：crop（px Point）与 zoom 只存本地，避免与 store 中已提交的
  // croppedAreaPixels（px，相对媒体包围盒）混用导致显示漂移。zoom/rotation 仍持久化到 store。
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(art.zoom);
  const fileRef = useRef<HTMLInputElement>(null);
  // 上传失败的轻量内联提示（如 >20MB 超限）；保持到下次上传/换面，不弹 Toast。
  const [fileError, setFileError] = useState<string | null>(null);

  // 裁剪源：优先本地未提交预览；否则回落到当前面的会话源（已提交图）。
  const src = pendingUrl ?? sessionUrl;

  // 进入某面（含挂载）时：丢弃旧面的未提交预览与会话源，重置 crop/zoom，
  // 并异步加载该面已提交图为会话源。仅以 face 为依赖：applyCrop 提交新 imageId
  // 不算切面，不会重载会话源（保证二次应用裁剪仍从原始源派生）。
  useEffect(() => {
    const targetFace = face;
    const committed = useCompilationStore.getState().project[
      targetFace === "front" ? "frontCover" : targetFace === "back" ? "backCover" : "discArtwork"
    ];
    const id = committed.imageId;
    let cancelled = false;
    // 清空/重置走微任务（下一次绘制前生效），避开 react-hooks/set-state-in-effect。
    queueMicrotask(() => {
      if (cancelled) return;
      if (pendingUrlRef.current) {
        revokeObjectUrl(pendingUrlRef.current);
        pendingUrlRef.current = null;
        setPendingUrl(null);
      }
      if (sessionUrlRef.current) {
        revokeObjectUrl(sessionUrlRef.current);
        sessionUrlRef.current = null;
        setSessionUrl(null);
      }
      setCrop({ x: 0, y: 0 });
      setZoom(committed.zoom);
      setFileError(null); // 换面时清掉上一面的上传错误提示
    });
    if (!id) return () => { cancelled = true; };
    getImageUrl(id).then((url) => {
      if (cancelled) {
        if (url) revokeObjectUrl(url);
        return;
      }
      // 竞态守卫：resolve 时校验该面已提交的 imageId 仍等于请求的 id——reset 会将其置 null、
      // 期间若已提交新图则换成新 id，两种情况都丢弃迟到的旧图 URL（revoke），
      // 避免占位被已删旧图复活。applyCrop 不换面、不重跑本 effect，不受影响。
      const currentId = useCompilationStore.getState().project[
        targetFace === "front" ? "frontCover" : targetFace === "back" ? "backCover" : "discArtwork"
      ].imageId;
      if (currentId !== id) {
        if (url) revokeObjectUrl(url);
        return;
      }
      if (sessionUrlRef.current) revokeObjectUrl(sessionUrlRef.current);
      sessionUrlRef.current = url;
      setSessionUrl(url);
    });
    return () => { cancelled = true; };
  }, [face]);

  // 卸载时释放本地预览与会话源 URL。
  useEffect(() => () => {
    if (pendingUrlRef.current) revokeObjectUrl(pendingUrlRef.current);
    if (sessionUrlRef.current) revokeObjectUrl(sessionUrlRef.current);
  }, []);

  // 追踪当前面，供异步操作（上传/裁剪）完成后校验：期间切换了面则丢弃结果，避免写入错误的面
  const currentFaceRef = useRef(face);
  useEffect(() => { currentFaceRef.current = face; }, [face]);

  const onFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const targetFace = face;
    setFileError(null); // 清理上次的错误提示
    // 超限文件直接提示，不再走解码/压缩（compressImage 内同样校验，双保险）。
    if (f.size > MAX_FILE_BYTES) {
      setFileError("文件过大（>20MB），请压缩后重试");
      e.target.value = ""; // 重置 input，允许再次选择同一文件
      return;
    }
    try {
      const { blob } = await compressImage(f); // 校验类型 + 压缩（最长边 ≤2048）
      if (currentFaceRef.current !== targetFace) return; // 上传期间切换了面：丢弃本次结果
      if (pendingUrlRef.current) revokeObjectUrl(pendingUrlRef.current);
      const url = URL.createObjectURL(blob);
      pendingUrlRef.current = url;
      setPendingUrl(url);      // 预览源（未裁剪）
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      // 新图重置裁剪参数；crop 为占位（尚未提交，onCropComplete 会写入 croppedAreaPixels），裁剪确认后写 imageId
      setArtwork(targetFace, { sourceName: f.name, crop: { x: 0, y: 0, width: 0, height: 0 }, zoom: 1, rotation: 0 });
    } catch {
      // 非图片/解码失败：不进入预览，保持现状（不抛错打断编辑）。
    } finally {
      e.target.value = ""; // 重置 input，保证再次选择同一文件也能触发 onChange
    }
  }, [face, setArtwork]);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setArtwork(face, { crop: croppedAreaPixels }); // 提交像素级裁剪区域（已含 zoom）
  }, [face, setArtwork]);

  const applyCrop = useCallback(async () => {
    if (!src) return;
    const targetFace = face;
    const out = await cropImage(src, art.crop, art.rotation); // art.crop 为 croppedAreaPixels（px）
    if (currentFaceRef.current !== targetFace) return; // 处理期间切换了面：不写入错误的面
    const blob = await dataUrlToBlob(out);
    const stored = await storeImage(blob);
    if (currentFaceRef.current !== targetFace) return; // 落库期间又切面：丢弃
    setArtwork(targetFace, { imageId: stored.id });
    // 不替换 src：会话源（pendingUrl 或 sessionUrl）保持裁剪前的原始源，供继续再裁（二次应用不叠加）。
  }, [src, art.crop, art.rotation, face, setArtwork]);

  const reset = useCallback(() => {
    if (pendingUrlRef.current) {
      revokeObjectUrl(pendingUrlRef.current);
      pendingUrlRef.current = null;
      setPendingUrl(null);
    }
    if (sessionUrlRef.current) {
      revokeObjectUrl(sessionUrlRef.current);
      sessionUrlRef.current = null;
      setSessionUrl(null);
    }
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setFileError(null);
    setArtwork(face, { sourceName: null, imageId: null, crop: { x: 0, y: 0, width: 0, height: 0 }, zoom: 1, rotation: 0 });
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
      <AnimatePresence>
        {fileError && (
          <motion.p
            key="file-error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } }}
            className="text-xs text-[var(--muted)]"
          >
            {fileError}
          </motion.p>
        )}
      </AnimatePresence>
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
