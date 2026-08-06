"use client";
import { useRef, useState } from "react";
import { Download, Package, Upload } from "lucide-react";
import { exportAlbumJson, exportZip, importAlbum } from "@/lib/backup";
import { revokeObjectUrl } from "@/lib/image/blobs";
import { saveProject } from "@/store/db";
import { useCompilationStore } from "@/store/use-compilation-store";
import { useProjectsStore } from "@/store/use-projects-store";

/**
 * 备份与恢复（T17）：导出 JSON / 导出 ZIP / 导入三按钮组。
 * 纯浏览器文件下载/解析，不弹 Toast；失败用内联细线小字（复用 T16 的 border-l-2 红样式）。
 * 导入固定以「新 project id」重建项目（不覆盖库中已有项目），图片经 storeImage 重存。
 */
export function BackupActions() {
  // 组件自身持有错误状态，不依赖 store；下一次动作开始即清空。
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** 触发 <a download> 下载；blob URL 用后 revoke（延迟一拍，确保浏览器已开始下载）。 */
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => revokeObjectUrl(url), 1000);
  };

  const handleExportJson = async () => {
    setError(null);
    try {
      const { blob, filename } = await exportAlbumJson(useCompilationStore.getState().project);
      triggerDownload(blob, filename);
    } catch {
      setError("导出 JSON 失败，请重试");
    }
  };

  const handleExportZip = async () => {
    setError(null);
    try {
      const { blob, filename } = await exportZip(useCompilationStore.getState().project);
      triggerDownload(blob, filename);
    } catch {
      setError("导出 ZIP 失败，请重试");
    }
  };

  const handleImportFile = async (file: File) => {
    setError(null);
    try {
      const { project } = await importAlbum(file, file.name);
      await saveProject(project); // 落库
      const store = useProjectsStore.getState();
      await store.refresh(); // 列表对齐库中真实状态
      await store.open(project.id); // 载入编辑器 + 写偏好
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败，请重试");
    } finally {
      if (inputRef.current) inputRef.current.value = ""; // 清空 input，允许重复选择同一文件
    }
  };

  // 按钮样式同 ProjectManager「新建精选集」按钮族：细线小字。
  const btnCls =
    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--strong-line)] py-2 text-sm text-[var(--foreground)] transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)]";

  return (
    <div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void handleExportJson()} className={btnCls}>
          <Download size={14} /> 导出 JSON
        </button>
        <button type="button" onClick={() => void handleExportZip()} className={btnCls}>
          <Package size={14} /> 导出 ZIP
        </button>
        <button type="button" onClick={() => inputRef.current?.click()} className={btnCls}>
          <Upload size={14} /> 导入
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.zip,.album.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportFile(f);
        }}
      />
      {error && (
        <div className="mt-2 border-l-2 border-[#dc2626]/60 px-2 py-1 text-xs leading-snug text-[#dc2626]/90">
          {error}
        </div>
      )}
    </div>
  );
}
