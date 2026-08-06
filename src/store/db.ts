"use client";

import Dexie, { type Table } from "dexie";
import type { CompilationProject, StoredImage } from "@/types/compilation";
import type { StoredNeteaseSession } from "@/lib/netease/types";

/**
 * 本地主存储（IndexedDB，Dexie）：项目数据与图片 Blob 长期缓存于此。
 * localStorage 只存偏好（当前项目 ID/主题/上次编辑模式，见 use-compilation-store）。
 * Dexie 构造函数在 SSR 下安全（不触碰 IndexedDB，仅注册 schema）；查询均在客户端触发。
 */
class CYCDatabase extends Dexie {
  projects!: Table<CompilationProject, string>;
  storedImages!: Table<StoredImage, string>;
  /** 网易云「记住登录」会话（userId 主键；仅 remember=true 时写入）。 */
  sessions!: Table<StoredNeteaseSession, number>;

  constructor() {
    super("cyc-db");
    this.version(1).stores({
      projects: "id, title, updatedAt",
      storedImages: "id",
    });
    // v2 新增 sessions 表（网易云记住登录会话），空迁移即可，老数据兼容。
    this.version(2)
      .stores({
        sessions: "userId",
      })
      .upgrade(() => {
        // 空迁移：仅新增 sessions 表，不触碰既有 projects / storedImages 数据。
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

/** 删除 storedImages 中某条（导入时清理解码失败的孤儿图片，T17）。 */
export async function deleteStoredImage(id: string): Promise<void> {
  await db.storedImages.delete(id);
}

/** 保存网易云「记住登录」会话（仅 remember=true 时调用；Cookie 绝不写 localStorage）。 */
export async function saveNeteaseSession(session: StoredNeteaseSession): Promise<void> {
  await db.sessions.put(session);
}

/** 读取网易云记住登录会话（单用户，取首条；无则 undefined）。 */
export async function getNeteaseSession(): Promise<StoredNeteaseSession | undefined> {
  return db.sessions.toCollection().first();
}

/** 删除网易云记住登录会话（登出/清会话时调用）。 */
export async function deleteNeteaseSession(): Promise<void> {
  await db.sessions.clear();
}
