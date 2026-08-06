"use client";
import { create } from "zustand";
import type { CompilationProject } from "@/types/compilation";
import { createDemoProject } from "@/data/demo-project";
import { createId } from "@/lib/storage";
import { getProject, listProjects, saveProject, deleteProject } from "./db";
import { useCompilationStore } from "./use-compilation-store";
import { stopPlayback } from "@/hooks/use-player-engine";

/**
 * 项目列表 store（T16 多项目管理）。
 * 列表从 IndexedDB 查询（db.listProjects，updatedAt 倒序），本地内存仅做展示缓存；
 * 每次动作（create/rename/remove/open）后重新 `refresh()` 对齐库中真实状态。
 * 封面缩略：取 frontCover.imageId（有则列表显示小方块，经 useObjectUrl 异步加载）。
 */
export interface ProjectListItem {
  id: string;
  title: string;
  updatedAt: number;
  coverImageId: string | null;
}

interface ProjectsStore {
  list: ProjectListItem[];
  loading: boolean;
  refresh: () => Promise<void>;
  /** 新建精选集（demo 模板，新 id + 「未命名精选集」）→ 载入编辑器。 */
  create: () => Promise<void>;
  /** 重命名；改的是当前项目时同步内存 project（即时反映到 Header/Stage）。 */
  rename: (id: string, title: string) => Promise<void>;
  /** 删除（面板侧二次确认后调用）；删的是当前项目则切到最近编辑的另一个，无则新建。 */
  remove: (id: string) => Promise<void>;
  /** 打开项目 → loadProject + 写偏好。已是当前项目则仅刷新列表。 */
  open: (id: string) => Promise<void>;
}

/** 载入项目到编辑器的统一入口：先停旧项目音频，再 loadProject（内含 saveTimer 清理/pref/重置 player/flush）。 */
async function loadIntoEditor(project: CompilationProject): Promise<void> {
  stopPlayback();
  useCompilationStore.getState().loadProject(project);
}

export const useProjectsStore = create<ProjectsStore>()((set, get) => ({
  list: [],
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const projects = await listProjects();
      set({
        list: projects.map((p) => ({
          id: p.id,
          title: p.title,
          updatedAt: p.updatedAt,
          coverImageId: p.frontCover.imageId,
        })),
        loading: false,
      });
    } catch {
      // IndexedDB 读取失败（隐私模式等）：保留旧列表，标记加载结束，不崩溃。
      set({ loading: false });
    }
  },

  create: async () => {
    // 新建：以 demo 模板为底（含可播 demo 曲目），覆盖 id/标题/时间戳；不删除当前项目。
    const project: CompilationProject = {
      ...createDemoProject(),
      id: createId("proj"),
      title: "未命名精选集",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveProject(project);
    await loadIntoEditor(project);
    await get().refresh();
  },

  rename: async (id, title) => {
    const existing = await getProject(id);
    const trimmed = title.trim();
    if (!existing || !trimmed) return;
    await saveProject({ ...existing, title: trimmed, updatedAt: Date.now() });
    // 重命名的是当前项目：同步内存 project（setProjectField 会 bump updatedAt 并触发自动保存）。
    if (useCompilationStore.getState().project.id === id) {
      useCompilationStore.getState().setProjectField("title", trimmed);
    }
    await get().refresh();
  },

  remove: async (id) => {
    await deleteProject(id);
    // 删除的是当前项目：切到最近编辑的另一个项目；已无项目则新建一个。
    if (useCompilationStore.getState().project.id === id) {
      const remaining = await listProjects();
      if (remaining.length > 0) {
        await loadIntoEditor(remaining[0]);
      } else {
        await get().create();
      }
    }
    await get().refresh();
  },

  open: async (id) => {
    const project = await getProject(id);
    if (!project) return;
    if (useCompilationStore.getState().project.id === id) {
      await get().refresh(); // 已是当前项目：仅刷新列表
      return;
    }
    await loadIntoEditor(project);
    await get().refresh();
  },
}));
