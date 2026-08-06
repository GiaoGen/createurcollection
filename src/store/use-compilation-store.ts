"use client";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  CompilationProject,
  EditorMode,
  FaceTarget,
  ArtworkState,
  CompilationTrack,
  CropArea,
  FilterId,
  SpineStyle,
} from "@/types/compilation";
import { createDemoProject } from "@/data/demo-project";
import { createId } from "@/lib/storage";
import { saveProject, getProject, deleteProject } from "./db";
import { storeImage, dataUrlToBlob } from "@/lib/image/blobs";

/**
 * 播放器状态。loading/volume/error 供 Task 18-20（网易云播放 + 受限/离线状态）使用；
 * 本任务先落位字段，播放引擎与 UI 在后续任务接入。
 */
interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  loading: boolean;
  volume: number;
  error: string | null;
}

/** localStorage 偏好键：只存偏好（当前项目 ID / 主题 / 上次编辑模式），不含项目数据。 */
const PREFS_KEY = "cyc:prefs";
/** 旧版 zustand persist 的 localStorage 键（一次性迁移用）。 */
const LEGACY_KEY = "create-your-collection";
/** 自动保存防抖：项目变更 600ms 后写入 IndexedDB。 */
const AUTOSAVE_DELAY = 600;

interface Prefs {
  currentProjectId: string | null;
  theme: "light" | "dark";
  lastMode: EditorMode;
}
const DEFAULT_PREFS: Prefs = { currentProjectId: null, theme: "dark", lastMode: "info" };

function readPrefs(): Prefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
function writePrefs(prefs: Prefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage 不可用（隐私模式等）：偏好丢失不影响编辑，忽略。
  }
}

/** —— 旧版（localStorage persist）数据结构，仅供一次性迁移，不进类型中心 —— */
interface LegacyArtwork {
  sourceName: string | null;
  imageUrl: string | null; // 旧版为 dataURL，迁移时转 Blob 落库
  crop: CropArea;
  zoom: number;
  rotation: number;
  filter: FilterId;
}
interface LegacyTrack { id: string; title: string; artist: string; }
interface LegacyProject {
  id?: string;
  title: string;
  subtitle: string;
  curator: string;
  year: string;
  description: string;
  spineStyle: SpineStyle;
  theme: "light" | "dark";
  frontCover: LegacyArtwork;
  backCover: LegacyArtwork;
  discArtwork: LegacyArtwork;
  tracks: LegacyTrack[];
  activeTrackId: string | null;
}
interface LegacyPersisted { state?: { project?: LegacyProject }; project?: LegacyProject; }

/**
 * 一次性迁移旧版 localStorage 数据 → IndexedDB 项目。
 * 曲目的音频字段（旧 Track.duration/src）不再持久化（不存播放 URL）；图片 dataURL → StoredImage。
 * 仅在项目成功 `db.projects.put` 之后才删除旧键（先删键后落库会在写库失败时丢失旧数据）。
 * 返回迁移出的项目；无旧数据返回 null。
 */
async function migrateLegacy(): Promise<CompilationProject | null> {
  if (typeof window === "undefined") return null;
  let parsed: LegacyPersisted;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw) as LegacyPersisted;
  } catch {
    return null;
  }
  const legacy = parsed.state?.project ?? parsed.project;
  if (!legacy || !Array.isArray(legacy.tracks)) return null;
  const now = Date.now();

  const migrateArtwork = async (a: LegacyArtwork): Promise<ArtworkState> => {
    let imageId: string | null = null;
    if (a.imageUrl) {
      try {
        const blob = await dataUrlToBlob(a.imageUrl);
        imageId = (await storeImage(blob)).id;
      } catch {
        imageId = null; // 单张图片损坏不阻塞整体迁移
      }
    }
    return { sourceName: a.sourceName, imageId, crop: a.crop, zoom: a.zoom, rotation: a.rotation, filter: a.filter };
  };

  const [frontCover, backCover, discArtwork] = await Promise.all([
    migrateArtwork(legacy.frontCover),
    migrateArtwork(legacy.backCover),
    migrateArtwork(legacy.discArtwork),
  ]);

  const project: CompilationProject = {
    id: legacy.id ?? createId("proj"),
    title: legacy.title,
    subtitle: legacy.subtitle,
    curator: legacy.curator,
    year: legacy.year,
    description: legacy.description,
    spineStyle: legacy.spineStyle,
    theme: legacy.theme,
    frontCover,
    backCover,
    discArtwork,
    tracks: legacy.tracks.map((t) => ({
      id: t.id,
      provider: "demo" as const,
      providerTrackId: null,
      title: t.title,
      artist: t.artist,
    })),
    activeTrackId: legacy.activeTrackId,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await saveProject(project); // 先落库：持久化确认成功后才允许删除旧键
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // 落库失败（配额/隐私模式）：保留旧键，下次加载重试；内存中仍返回迁移结果供本次会话编辑。
  }
  return project;
}

interface CompilationStore {
  project: CompilationProject;
  /** IndexedDB 引导是否完成（客户端首帧为 false，AppShell 据此避免“demo 项目闪现”）。 */
  hydrated: boolean;
  mode: EditorMode;
  face: FaceTarget;
  mobileSheetOpen: boolean;
  player: PlayerState;

  setProjectField: <K extends keyof CompilationProject>(key: K, value: CompilationProject[K]) => void;
  setArtwork: (face: FaceTarget, patch: Partial<ArtworkState>) => void;
  setMode: (m: EditorMode) => void;
  setFace: (f: FaceTarget) => void;
  setMobileSheetOpen: (open: boolean) => void;
  setTheme: (t: "light" | "dark") => void;
  addTrack: (t: CompilationTrack) => void;
  updateTrack: (id: string, patch: Partial<CompilationTrack>) => void;
  removeTrack: (id: string) => void;
  reorderTracks: (from: number, to: number) => void;
  setActiveTrack: (id: string | null) => void;
  setIsPlaying: (v: boolean) => void;
  setProgress: (partial: Partial<PlayerState>) => void;
  resetProject: () => void;
}

const initialPlayer: PlayerState = { isPlaying: false, currentTime: 0, duration: 0, loading: false, volume: 0.8, error: null };

// —— 自动保存管线 ——
let booted = false; // boot 完成前不写库，避免初始 demo 覆盖已有项目
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** 项目变更后：写偏好（当前项目 ID/主题）+ 防抖写入 IndexedDB。 */
function onProjectChanged(project: CompilationProject): void {
  if (!booted) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writePrefs({ ...readPrefs(), currentProjectId: project.id, theme: project.theme });
    void saveProject(project).catch(() => {
      // IndexedDB 写入失败（配额/隐私模式）：静默，本地内存仍可继续编辑。
    });
  }, AUTOSAVE_DELAY);
}

/** 立即落库（boot / reset 等不应依赖防抖的场景）。 */
function flushSave(project: CompilationProject): void {
  if (!booted) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  writePrefs({ ...readPrefs(), currentProjectId: project.id, theme: project.theme });
  void saveProject(project).catch(() => {});
}

/**
 * 客户端引导：请求长期缓存 → 按偏好加载项目（迁移旧数据 / 全新 demo）→ 置 hydrated。
 * SSR/服务端不执行（typeof window 守卫）。AppShell 在 hydrated 前渲染占位，避免 demo 闪现。
 */
async function boot(): Promise<void> {
  if (typeof window === "undefined" || booted) return;
  booted = true;
  try {
    if (navigator.storage) {
      // 申请长期缓存，尽力而为；2s 超时，避免 persist 永不 settle 卡住 hydrated。
      await Promise.race([
        navigator.storage.persist(),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    }
  } catch {
    // 浏览器不支持/拒绝：不影响编辑。
  }
  const prefs = readPrefs();
  let project: CompilationProject | null = null;
  try {
    if (prefs.currentProjectId) {
      project = (await getProject(prefs.currentProjectId)) ?? null;
    }
    if (!project) {
      project = await migrateLegacy();
    }
  } catch {
    project = null;
  }
  if (!project) {
    project = createDemoProject();
    project.theme = prefs.theme; // 全新 demo 应用主题偏好
  }
  useCompilationStore.setState({
    project,
    hydrated: true,
    mode: prefs.lastMode,
  });
  flushSave(project); // 迁移结果 / 全新 demo 立即落库
}

export const useCompilationStore = create<CompilationStore>()(
  subscribeWithSelector((set, get) => {
    /** 所有项目变更统一更新 updatedAt（供 T16 项目列表按最近编辑排序）。 */
    const bump = (p: CompilationProject): CompilationProject => ({ ...p, updatedAt: Date.now() });

    return {
      project: createDemoProject(),
      hydrated: false,
      mode: "info",
      face: "front",
      mobileSheetOpen: false,
      player: initialPlayer,

      setProjectField: (key, value) =>
        set((s) => ({ project: bump({ ...s.project, [key]: value }) })),

      setArtwork: (face, patch) =>
        set((s) => {
          const key = face === "front" ? "frontCover" : face === "back" ? "backCover" : "discArtwork";
          return { project: bump({ ...s.project, [key]: { ...s.project[key], ...patch } }) };
        }),

      setMode: (mode) => {
        writePrefs({ ...readPrefs(), lastMode: mode }); // 编辑模式偏好，立即写，避免防抖丢
        set({ mode });
      },
      setFace: (face) => set({ face }),
      setMobileSheetOpen: (mobileSheetOpen) => set({ mobileSheetOpen }),
      setTheme: (theme) => set((s) => ({ project: bump({ ...s.project, theme }) })),

      addTrack: (t) => set((s) => ({ project: bump({ ...s.project, tracks: [...s.project.tracks, t] }) })),
      updateTrack: (id, patch) =>
        set((s) => ({
          project: bump({
            ...s.project,
            tracks: s.project.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
          }),
        })),
      removeTrack: (id) =>
        set((s) => ({
          project: bump({
            ...s.project,
            tracks: s.project.tracks.filter((t) => t.id !== id),
            activeTrackId: s.project.activeTrackId === id ? null : s.project.activeTrackId,
          }),
        })),
      reorderTracks: (from, to) =>
        set((s) => {
          const arr = [...s.project.tracks];
          const [moved] = arr.splice(from, 1);
          arr.splice(to, 0, moved);
          return { project: bump({ ...s.project, tracks: arr }) };
        }),

      setActiveTrack: (activeTrackId) => set((s) => ({ project: bump({ ...s.project, activeTrackId }) })),
      setIsPlaying: (isPlaying) => set((s) => ({ player: { ...s.player, isPlaying } })),
      setProgress: (partial) => set((s) => ({ player: { ...s.player, ...partial } })),

      resetProject: () => {
        const old = get().project;
        const fresh = createDemoProject();
        fresh.theme = readPrefs().theme;
        set({ project: fresh, player: initialPlayer });
        // 旧项目从库中删除（重置 = 全新 demo），新 demo 立即落库并指向新 ID。
        void deleteProject(old.id).catch(() => {});
        flushSave(fresh);
      },
    };
  })
);

// —— 项目订阅：任何 project 变更触发自动保存 ——
useCompilationStore.subscribe((s) => s.project, (project) => onProjectChanged(project));

// 模块级启动引导（SSR 由 typeof window 守卫短路）。
void boot();
