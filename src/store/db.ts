"use client";

import Dexie, { type Table } from "dexie";
import type { CompilationProject, StoredImage } from "@/types/compilation";

/**
 * 本地主存储（IndexedDB，Dexie）：项目数据与图片 Blob 长期缓存于此。
 * localStorage 只存偏好（当前项目 ID/主题/上次编辑模式，见 use-compilation-store）。
 * Dexie 构造函数在 SSR 下安全（不触碰 IndexedDB，仅注册 schema）；查询均在客户端触发。
 */
class CYCDatabase extends Dexie {
  projects!: Table<CompilationProject, string>;
  storedImages!: Table<StoredImage, string>;

  constructor() {
    super("cyc-db");
    this.version(1).stores({
      projects: "id, title, updatedAt",
      storedImages: "id",
    });
  }
}

export const db = new CYCDatabase();

/** 保存整个项目（ArtworkState 只带 imageId，无 base64）。 */
export async function saveProject(project: CompilationProject): Promise<void> {
  await db.projects.put(project);
}

export async function getProject(id: string): Promise<CompilationProject | undefined> {
  return db.projects.get(id);
}

/** 项目列表，updatedAt 倒序（T16 多项目管理使用）。 */
export async function listProjects(): Promise<CompilationProject[]> {
  return db.projects.orderBy("updatedAt").reverse().toArray();
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id);
}

export async function saveStoredImage(img: StoredImage): Promise<void> {
  await db.storedImages.put(img);
}

export async function getStoredImage(id: string): Promise<StoredImage | undefined> {
  return db.storedImages.get(id);
}
