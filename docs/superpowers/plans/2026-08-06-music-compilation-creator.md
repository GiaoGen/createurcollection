# 音乐精选集创作网站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可运行的视觉/动效优先的音乐精选集（Mix CD）创作网站：编辑信息与封面、3D CD 盒实时展示、曲目播放、IndexedDB 长期持久化、多项目管理与备份、纯前端网易云公开内容接入，并部署 Vercel。**纯前端、无任何自有后端。**

**Architecture:** Next.js App Router 单页应用（**纯前端，无任何自有后端**）。桌面三段式（ProjectRail + CD Stage + Inspector）+ 底部 Player；移动端精简头部 + 全屏 Stage + Bottom Sheet。项目数据与图片 Blob 以 IndexedDB（Dexie）为主存储，localStorage 只存偏好（当前项目 ID/主题/上次编辑模式）；自动保存防抖 500–1000ms；`navigator.storage.persist()` 申请长期缓存。3D 用 R3F 单碟 CD 盒组件（参考已安装的 `cd-showcase-3d` skill 的交互/贴图/阻尼模式，不直接复用其单文件 HTML）。图片管线：上传→校验/压缩 WebP/JPEG→crop(react-easy-crop)→filter(12 艺术滤镜，Canvas 像素烘焙，预览降采样+防抖)→CanvasTexture，Blob 入 IndexedDB。音乐双源：`DemoMusicProvider`（合成 WAV data URI，离线可完整演示）+ `NeteaseProvider`（纯前端，浏览器直调第三方网易云 API，仅公开内容，T18-T20）。

**Tech Stack:** Next.js 16.3.0 (App Router) · React 19.2.8 · TypeScript 5.9.3 · Tailwind v4 · zustand 5 · motion 12 · three 0.185 / @react-three/fiber 9 / @react-three/drei 10 · react-easy-crop 6 · html-to-image · dexie 4 · lucide-react · pnpm 11

## Global Constraints

- 权威需求：`createyourcollection.md`；工程/设计/动效 token 见 `CLAUDE.md`，冲突时以 spec 为准。
- 视觉禁用：暖黄背景、紫蓝渐变球、玻璃卡片、多层圆角嵌套、每块内容套 Card、夸张阴影、胶囊按钮堆叠、SaaS Dashboard 风。
- 设计 token（写死进 `globals.css`）：浅色 `#f5f5f3/#ffffff/#0a0a0a/#737373`，深色 `#080808/#111111/#f4f4f4/#8a8a8a`，line 用 `rgba` 半透明。
- 动效曲线（Motion 中复用）：反馈 `{duration:0.18, ease:[0.2,0.8,0.2,1]}`；面板 `{duration:0.32, ease:[0.22,1,0.36,1]}`；物理 `{type:"spring",stiffness:260,damping:28,mass:0.8}`；CD 开合 `{type:"spring",stiffness:110,damping:22,mass:1.1}`。
- 3D：`<Canvas frameloop="demand" dpr={[1,1.5]}>`；静止停渲；高频角度走 ref/useFrame，禁止 pointermove→setState。
- 图片：上传校验类型/大小，压缩 WebP/JPEG（最长边 ≤1600–2048px）为 Blob 入 IndexedDB；Object URL 用后释放；纹理更新 `dispose` 旧纹理。
- 存储：项目数据（含图片 Blob）以 IndexedDB 为主存储（Dexie），`navigator.storage.persist()` 申请长期缓存；localStorage 只存偏好。自动保存防抖 500–1000ms；第三方 API 不可用不影响本地编辑/查看。
- 音乐：统一 `MusicProvider` 抽象；`DemoMusicProvider` 离线回退；`NeteaseProvider` 纯前端——浏览器直调第三方网易云 API（Base URL `NEXT_PUBLIC_NETEASE_API_BASE_URL`，统一 `lib/netease/` 客户端），仅公开内容：搜索/公开歌单导入/曲目信息/封面/`/song/url/v1` 网页播放。**无任何自有后端、无代理、无登录、不存 Cookie、不持久化播放 URL**；VIP/版权受限返回空 URL → 播放禁用并显示「受限」，不做绕过、不开解灰。
- 无障碍：必须支持 `@media (prefers-reduced-motion: reduce)`。
- 按钮必须真实可用；移动端不做桌面等比缩放。
- 验收（§十二）全部通过；`pnpm lint` 与 `pnpm build` 必须通过。

---

## File Structure

```
src/
├─ app/
│  ├─ layout.tsx              # 主题 data-theme 注入、字体变量（已由脚手架提供 Geist）
│  ├─ page.tsx                # 渲染 AppShell
│  └─ globals.css             # CSS 变量（明暗主题）+ 基础样式 + 动效降级
├─ components/
│  ├─ shell/
│  │  ├─ AppShell.tsx         # 三段式组合 + Player + 移动端切换 + 离线监听
│  │  ├─ ProjectRail.tsx      # 左侧 64-80px 图标栏 + Tooltip + 项目入口
│  │  ├─ MobileHeader.tsx     # 移动端顶部（项目名/主题/更多/项目入口）
│  │  └─ MobileEditorSheet.tsx# 移动端编辑 Bottom Sheet
│  ├─ stage/
│  │  ├─ CDStage.tsx          # Canvas 容器 + 灯光 + 交互封装 + StageFallback 切换
│  │  ├─ CDCase.tsx           # R3F 单碟 CD 盒（正/背/侧/开/碟滑出/旋转）
│  │  ├─ Disc.tsx             # 唱片模型（含播放旋转）
│  │  ├─ StageLights.tsx      # 环境/方向光（明暗联动）
│  │  └─ StageFallback.tsx    # CSS 3D 降级 CD 盒
│  ├─ editor/
│  │  ├─ Inspector.tsx        # 右侧面板容器 + 模式切换动画
│  │  ├─ InfoEditor.tsx       # 名称/副标题/创建者/年份/简介
│  │  ├─ ArtworkEditor.tsx    # 上传 + react-easy-crop + 缩放/旋转（压缩入 IndexedDB）
│  │  ├─ FilterSelector.tsx   # 滤镜网格
│  │  ├─ SpineEditor.tsx      # 侧标样式选择
│  │  ├─ TrackEditor.tsx      # 曲目增删改 + 拖动排序 + 网易云添加入口
│  │  └─ NeteasePicker.tsx    # 网易云添加 UI：公开歌单导入 + 搜索（T19）
│  ├─ player/
│  │  ├─ Player.tsx           # 底部播放条（引擎为模块级单例 use-player-engine）
│  │  ├─ Progress.tsx         # 可拖动进度条
│  │  └─ PlayingIndicator.tsx # 当前曲目波形
│  ├─ projects/
│  │  └─ ProjectManager.tsx   # 项目列表/新建/重命名/删除/备份入口（T16）
│  └─ export/
│     └─ ExportCard.tsx       # 2D 宣传图节点（导出目标）
├─ lib/
│  ├─ image/
│  │  ├─ resize.ts            # resizeImageToMax / fileToDataUrl
│  │  ├─ crop.ts              # cropImage(src, cropPixels, rotation)
│  │  ├─ blobs.ts             # 压缩 WebP/JPEG + Blob↔IndexedDB 工具（T15）
│  │  └─ art-filters.ts       # 12 艺术滤镜 + bakeFilteredUrl（预览 320 / 烘焙 1600）
│  ├─ music/
│  │  ├─ types.ts             # MusicProvider 接口 + Track/PlayableSource
│  │  ├─ synthesize.ts        # 合成演示 WAV data URI
│  │  ├─ provider.ts          # getMusicProvider() 单例（demo ↔ netease 切换）
│  │  ├─ demo-provider.ts     # DemoMusicProvider（离线回退）
│  │  └─ netease-provider.ts  # NeteaseProvider（T18-T20，接 NeteaseClient）
│  ├─ netease/                # 纯前端网易云客户端（T18）
│  │  ├─ config.ts            # 读 NEXT_PUBLIC_NETEASE_API_BASE_URL
│  │  ├─ client.ts            # NeteaseClient：fetch + 超时/错误归一 + 缓存
│  │  ├─ types.ts             # API 响应类型
│  │  ├─ normalize.ts         # API → 应用模型 归一
│  │  ├─ playlist.ts          # 公开歌单链接/ID 解析 + 拉取
│  │  └─ playback.ts          # 播放 URL 获取 + 内存短缓存 + 过期一次重试
│  ├─ backup.ts               # .album.json / ZIP 备份导出导入（T17）
│  ├─ export-image.ts         # toPng(ExportCard node)
│  └─ storage.ts              # createId / formatTime 等小工具
├─ store/
│  ├─ db.ts                   # Dexie 数据库（projects / storedImages 表，T15）
│  ├─ use-projects-store.ts   # 项目列表 store（T16）
│  └─ use-compilation-store.ts
├─ data/
│  └─ demo-project.ts
└─ types/
   └─ compilation.ts
```

---

## Task 1: 设计 Token 与全局样式（globals.css + 主题注入）

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/lib/storage.ts`

**Interfaces:**
- Consumes: 脚手架现有 `globals.css`（Tailwind v4 `@import "tailwindcss"`）、`layout.tsx`（Geist 字体变量）。
- Produces: CSS 变量 `--background/--surface/--foreground/--muted/--line/--strong-line`（明暗两套）；`html[data-theme="dark"]` 切换；reduced-motion 全局降级；`createId(prefix)` 工具。

- [ ] **Step 1: 重写 `src/app/globals.css`**

```css
@import "tailwindcss";

:root {
  --background: #f5f5f3;
  --surface: #ffffff;
  --foreground: #0a0a0a;
  --muted: #737373;
  --line: rgba(0, 0, 0, 0.12);
  --strong-line: rgba(0, 0, 0, 0.28);
  color-scheme: light;
}

html[data-theme="dark"] {
  --background: #080808;
  --surface: #111111;
  --foreground: #f4f4f4;
  --muted: #8a8a8a;
  --line: rgba(255, 255, 255, 0.14);
  --strong-line: rgba(255, 255, 255, 0.28);
  color-scheme: dark;
}

html, body { height: 100%; }
body {
  background: var(--background);
  color: var(--foreground);
  transition: background-color 0.32s cubic-bezier(0.22, 1, 0.36, 1),
              color 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  overflow: hidden; /* 单页编辑器：防双端滚动溢出 */
}

.font-mono-num { font-family: var(--font-geist-mono), ui-monospace, monospace; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: 主题注入到 `src/app/layout.tsx`**

`metadata.title` 改为 "Create Your Collection"。`<html>` 上加 `suppressHydrationWarning` 并设 `data-theme` 初始值（读取 localStorage，客户端首帧同步）。注意 Next.js 16 的 `LayoutProps<"/">` 签名。主题最终由 store 驱动（Task 3），此步只保证首帧默认浅色不闪烁。

```tsx
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="light">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: 创建 `src/lib/storage.ts`**

```ts
export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
```

- [ ] **Step 4: 验证**

Run: `pnpm dev`（后台），浏览器打开 `http://localhost:3000` 确认无样式报错、`data-theme="light"` 生效。Run: `pnpm lint && pnpm build` 通过。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: design tokens, theme shell, storage utils"
```

---

## Task 2: 核心类型 `src/types/compilation.ts`

**Files:**
- Create: `src/types/compilation.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `CompilationProject`、`ArtworkState`、`FilterId`、`SpineStyle`、`Track`、`EditorMode`、`FaceTarget`。后续所有模块以此为契约。

- [ ] **Step 1: 编写类型文件**

```ts
export type FilterId =
  | "original" | "mono" | "contrast" | "faded" | "cold"
  | "deepblack" | "duotone" | "grain" | "softblur" | "invert";

export type SpineStyle = "catalog" | "obi" | "vertical" | "transparent";

/** react-easy-crop 输出：百分比坐标 + 宽高 */
export interface CropArea { x: number; y: number; width: number; height: number; }

/** 三类素材（正面/背面/盘面）统一状态。imageUrl 为经 resize 后的可显示 URL（Blob URL 或 dataURL）。 */
export interface ArtworkState {
  sourceName: string | null;      // 原始文件名，占位与重置判断
  imageUrl: string | null;        // 处理后图像 URL（喂给纹理 / ExportCard）
  crop: CropArea;                 // 裁剪区域（未裁剪时 = 原图区域）
  zoom: number;                   // 1..4
  rotation: number;               // 度，-180..180
  filter: FilterId;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;               // 秒（合成音频的实际长度）
  src: string;                    // 音频 URL（demo = data URI）
}

export interface CompilationProject {
  id: string;
  title: string;
  subtitle: string;
  curator: string;
  year: string;
  description: string;
  spineStyle: SpineStyle;
  theme: "light" | "dark";
  frontCover: ArtworkState;
  backCover: ArtworkState;
  discArtwork: ArtworkState;
  tracks: Track[];
  activeTrackId: string | null;
}

export type EditorMode = "info" | "artwork" | "filters" | "spine" | "tracks";
export type FaceTarget = "front" | "back" | "disc";

export function blankArtwork(): ArtworkState {
  return { sourceName: null, imageUrl: null, crop: { x: 0, y: 0, width: 1, height: 1 }, zoom: 1, rotation: 0, filter: "original" };
}
```

- [ ] **Step 2: 验证**

Run: `pnpm exec tsc --noEmit`。Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/types && git commit -m "feat: core compilation types"
```

---

## Task 3: Zustand Store + localStorage 持久化

**Files:**
- Create: `src/store/use-compilation-store.ts`

**Interfaces:**
- Consumes: `src/types/compilation.ts`、`src/data/demo-project.ts`（Task 4 先建，或先以空项目 fallback）、`createId`。
- Produces: hooks `useProject()`、`useMode()`、`useFace()`、`usePlayer()` 及 actions：`setProjectField`、`setArtwork(face, patch)`、`setMode`、`setFace`、`setTheme`、`addTrack/updateTrack/removeTrack/reorderTrack`、`setActiveTrack`、`setIsPlaying`、`setProgress`、`resetProject`。

- [ ] **Step 1: 编写 store（先依赖 Task 4 的 demo 数据；若 Task 4 未完成可用最小占位）**

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CompilationProject, EditorMode, FaceTarget, ArtworkState, Track } from "@/types/compilation";
import { createDemoProject } from "@/data/demo-project";

interface PlayerState { isPlaying: boolean; currentTime: number; duration: number; }

interface CompilationStore {
  project: CompilationProject;
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
  addTrack: (t: Track) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  removeTrack: (id: string) => void;
  reorderTracks: (from: number, to: number) => void;
  setActiveTrack: (id: string | null) => void;
  setIsPlaying: (v: boolean) => void;
  setProgress: (partial: Partial<PlayerState>) => void;
  resetProject: () => void;
}

export const useCompilationStore = create<CompilationStore>()(
  persist(
    (set, get) => ({
      project: createDemoProject(),
      mode: "info",
      face: "front",
      mobileSheetOpen: false,
      player: { isPlaying: false, currentTime: 0, duration: 0 },

      setProjectField: (key, value) =>
        set((s) => ({ project: { ...s.project, [key]: value } })),

      setArtwork: (face, patch) =>
        set((s) => {
          const key = face === "front" ? "frontCover" : face === "back" ? "backCover" : "discArtwork";
          return { project: { ...s.project, [key]: { ...s.project[key], ...patch } } };
        }),

      setMode: (mode) => set({ mode }),
      setFace: (face) => set({ face }),
      setMobileSheetOpen: (mobileSheetOpen) => set({ mobileSheetOpen }),
      setTheme: (theme) => set((s) => ({ project: { ...s.project, theme } })),

      addTrack: (t) => set((s) => ({ project: { ...s.project, tracks: [...s.project.tracks, t] } })),
      updateTrack: (id, patch) =>
        set((s) => ({
          project: { ...s.project, tracks: s.project.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) },
        })),
      removeTrack: (id) =>
        set((s) => ({
          project: {
            ...s.project,
            tracks: s.project.tracks.filter((t) => t.id !== id),
            activeTrackId: s.project.activeTrackId === id ? null : s.project.activeTrackId,
          },
        })),
      reorderTracks: (from, to) =>
        set((s) => {
          const arr = [...s.project.tracks];
          const [moved] = arr.splice(from, 1);
          arr.splice(to, 0, moved);
          return { project: { ...s.project, tracks: arr } };
        }),

      setActiveTrack: (activeTrackId) => set((s) => ({ project: { ...s.project, activeTrackId } })),
      setIsPlaying: (isPlaying) => set((s) => ({ player: { ...s.player, isPlaying } })),
      setProgress: (partial) => set((s) => ({ player: { ...s.player, ...partial } })),

      resetProject: () => set({ project: createDemoProject(), player: { isPlaying: false, currentTime: 0, duration: 0 } }),
    }),
    {
      name: "create-your-collection",
      partialize: (s) => ({ project: s.project }), // 只持久化 project；mode/player 为会话态
    }
  )
);
```

- [ ] **Step 2: 验证**

Run: `pnpm exec tsc --noEmit`。浏览器 `pnpm dev` 打开，控制台确认无 persist 报错。

- [ ] **Step 3: Commit**

```bash
git add src/store && git commit -m "feat: zustand store with localStorage persist"
```

---

## Task 4: 演示数据 + 合成音频 + Demo Music Provider

**Files:**
- Create: `src/data/demo-project.ts`
- Create: `src/lib/music/types.ts`
- Create: `src/lib/music/synthesize.ts`
- Create: `src/lib/music/demo-provider.ts`
- Create: `src/lib/music/provider.ts`
- Create: `src/lib/music/netease-link-provider.ts`

**Interfaces:**
- Consumes: `src/types/compilation.ts`、`blankArtwork`、`createId`。
- Produces: `createDemoProject(): CompilationProject`（6 首 demo，`Track.src` 来自 `synthesizeDemoWav`）；`MusicProvider` 接口；`getMusicProvider(): MusicProvider`；`DemoMusicProvider`；`NeteaseLinkProvider`。

- [ ] **Step 1: `src/lib/music/types.ts`**

```ts
import type { Track } from "@/types/compilation";

export interface TrackSearchResult { id: string; title: string; artist: string; }
export interface TrackMetadata { id: string; title: string; artist: string; duration?: number; }
export interface PlayableSource { url: string; kind: "audio"; duration?: number; }

export interface MusicProvider {
  search(query: string): Promise<TrackSearchResult[]>;
  resolve(input: string): Promise<TrackMetadata | null>;
  getPlayableSource(track: Track): Promise<PlayableSource | null>;
}
```

- [ ] **Step 2: `src/lib/music/synthesize.ts`——合成一段温和小旋律的 WAV data URI（PCM16，44.1kHz，~12s）**

`OfflineAudioContext` 离线渲染 → 手写 WAV 头 → base64。无任何外部音频文件，双端可播。

```ts
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25]; // C 大调五声

function encodeWavDataUri(samples: Float32Array, sr: number): string {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);          // PCM
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);     // byteRate
  view.setUint16(32, 2, true);          // blockAlign
  view.setUint16(34, 16, true);         // bits
  writeStr(36, "data");
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export async function synthesizeDemoWav(seed: number, seconds = 12): Promise<{ src: string; duration: number }> {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(sr * seconds), sr);
  const pattern = (seed % 8) + 8;
  const noteDur = seconds / pattern;
  for (let i = 0; i < pattern; i++) {
    const f = SCALE[(seed + i * 2) % SCALE.length];
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    const t0 = i * noteDur;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.12, t0 + 0.02);          // attack
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + noteDur * 0.92); // decay（防爆音）
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + noteDur);
  }
  const rendered = await ctx.startRendering();
  return { src: encodeWavDataUri(rendered.getChannelData(0), sr), duration: seconds };
}
```

- [ ] **Step 3: `src/data/demo-project.ts`**

```ts
import { CompilationProject, blankArtwork } from "@/types/compilation";
import { createId } from "@/lib/storage";

const TITLES = ["LATE NIGHT DRIVE", "SUMMER ROOFTOP", "COLD CHROME", "LOW FIDELITY", "CITY LIGHTS", "MIDNIGHT RADIO"];

// 音频不在此同步合成（OfflineAudioContext 是异步的）：src 留空、duration 0，
// 由 DemoMusicProvider.getPlayableSource 在首次播放时合成并缓存（见 Task 4 Step 4）。
export function createDemoProject(): CompilationProject {
  return {
    id: createId("proj"),
    title: "LATE NIGHT COLLECTION",
    subtitle: "VOL. 01",
    curator: "SUN",
    year: "2026",
    description: "A mixtape for the small hours — analogue warmth, cold edges.",
    spineStyle: "catalog",
    theme: "dark",
    frontCover: blankArtwork(),
    backCover: blankArtwork(),
    discArtwork: blankArtwork(),
    tracks: TITLES.map((title) => ({
      id: createId("trk"), title, artist: "DEMO SELECTION", duration: 0, src: "",
    })),
    activeTrackId: null,
  };
}
```

- [ ] **Step 4: `src/lib/music/demo-provider.ts` 与 `provider.ts`**

```ts
import type { MusicProvider, PlayableSource, TrackMetadata, TrackSearchResult } from "./types";
import type { Track } from "@/types/compilation";
import { synthesizeDemoWav } from "./synthesize";

class DemoMusicProvider implements MusicProvider {
  private cache = new Map<string, { src: string; duration: number }>();

  async search(_query: string): Promise<TrackSearchResult[]> { return []; }
  async resolve(_input: string): Promise<TrackMetadata | null> { return null; }

  async getPlayableSource(track: Track): Promise<PlayableSource | null> {
    if (!this.cache.has(track.id)) {
      const seed = (track.title.length + track.id.length) % 13;
      this.cache.set(track.id, await synthesizeDemoWav(seed));
    }
    const hit = this.cache.get(track.id)!;
    return { url: hit.src, kind: "audio", duration: hit.duration };
  }
}

export const demoMusicProvider = new DemoMusicProvider();
```

`src/lib/music/provider.ts`：

```ts
import type { MusicProvider } from "./types";
import { demoMusicProvider } from "./demo-provider";

let singleton: MusicProvider = demoMusicProvider;
export function getMusicProvider(): MusicProvider { return singleton; }
export function setMusicProvider(p: MusicProvider) { singleton = p; } // 未来切换正式源
```

- [ ] **Step 5: `src/lib/music/netease-provider.ts`（壳；真实实现在 T18-T20 纯前端）**

```ts
import type { MusicProvider, PlayableSource, TrackMetadata, TrackSearchResult } from "./types";
import type { Track } from "@/types/compilation";

// 真实实现见 T18（纯前端 NeteaseClient）、T19（添加 UI）、T20（播放/受限/离线）。
// 壳：接口齐全、方法返回空/受限，保证编译与离线回退可运行。
export class NeteaseProvider implements MusicProvider {
  async search(_q: string): Promise<TrackSearchResult[]> { return []; }
  async resolve(_i: string): Promise<TrackMetadata | null> { return null; }
  async getPlayableSource(_t: Track): Promise<PlayableSource | null> { return null; }
}
```

- [ ] **Step 6: 验证**

Run: `pnpm exec tsc --noEmit`。浏览器控制台执行 `synthesizeDemoWav(0)` 能得到 data URI 且可播放（后续 Task 11 联调）。

- [ ] **Step 7: Commit**

```bash
git add src/data src/lib/music && git commit -m "feat: demo project, synthesized audio, music providers"
```

---

## Task 5: 页面骨架——AppShell / ProjectRail / 桌面三段式 + 移动端头部

**Files:**
- Create: `src/components/shell/AppShell.tsx`
- Create: `src/components/shell/ProjectRail.tsx`
- Create: `src/components/shell/MobileHeader.tsx`
- Modify: `src/app/page.tsx`（替换脚手架 demo 页）
- Create: `src/components/stage/CDStage.tsx`（Task 7 再填充；此步先放占位导出真实 Stage，若未实现则渲染 StageFallback）

**Interfaces:**
- Consumes: store（`useMode/useFace/setMode/setFace/setTheme/project`）；`Inspector`（Task 6）；`Player`（Task 11，此步先占位）。
- Produces: `AppShell` 组合桌面/移动布局，切换 `mode`；`ProjectRail` 的 actions 回调。

- [ ] **Step 1: `src/app/page.tsx`**

```tsx
import { AppShell } from "@/components/shell/AppShell";

export default function Home() {
  return <AppShell />;
}
```

- [ ] **Step 2: `src/components/shell/AppShell.tsx`——桌面三段式 + 移动端布局**

```tsx
"use client";
import { ProjectRail } from "./ProjectRail";
import { CDStage } from "@/components/stage/CDStage";
import { Inspector } from "@/components/editor/Inspector";
import { Player } from "@/components/player/Player";
import { MobileHeader } from "./MobileHeader";
import { MobileEditorSheet } from "./MobileEditorSheet";

export function AppShell() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* 桌面：左 rail */}
      <ProjectRail className="hidden md:flex w-16 shrink-0 border-r border-[var(--line)]" />
      {/* 主区：Stage + 移动端头 */}
      <div className="relative flex-1 flex flex-col min-w-0">
        <MobileHeader className="md:hidden" />
        <main className="flex-1 min-h-0 relative">
          <CDStage />
        </main>
        <Player className="md:hidden" />
      </div>
      {/* 桌面：右 Inspector（贴边 + 左边线，不用悬浮卡片） */}
      <Inspector className="hidden md:flex w-[340px] shrink-0 border-l border-[var(--line)]" />
      <Player className="hidden md:flex h-[72px] shrink-0 border-t border-[var(--line)]" />
      <MobileEditorSheet />
    </div>
  );
}
```

说明：Player 需同时出现在桌面底部（横跨主区+Inspector）与移动端底部——实现上 `Player` 内部自适应；若布局复杂化，改为桌面在 `main` 底部渲染 Player、移动端固定底部，二者复用同一组件实例的 engine（见 Task 11 的 ref 挂载约定）。

- [ ] **Step 3: `src/components/shell/ProjectRail.tsx`——图标栏 + Tooltip + 主题切换**

```tsx
"use client";
import { Plus, SlidersHorizontal, ListMusic, Sun, Moon, Download } from "lucide-react";
import { useCompilationStore } from "@/store/use-compilation-store";

const tools = [
  { mode: "info", icon: SlidersHorizontal, label: "信息" },
  { mode: "tracks", icon: ListMusic, label: "曲目" },
] as const;

export function ProjectRail({ className = "" }: { className?: string }) {
  const mode = useCompilationStore((s) => s.mode);
  const setMode = useCompilationStore((s) => s.setMode);
  const theme = useCompilationStore((s) => s.project.theme);
  const setTheme = useCompilationStore((s) => s.setTheme);
  const resetProject = useCompilationStore((s) => s.resetProject);
  return (
    <nav className={`${className} flex-col items-center py-3 gap-1 bg-[var(--surface)]`}>
      <div className="font-mono-num text-xs tracking-widest mb-4">CYC</div>
      <IconBtn title="新建" onClick={resetProject}><Plus size={18} /></IconBtn>
      {tools.map((t) => (
        <IconBtn key={t.mode} title={t.label} active={mode === t.mode}
          onClick={() => setMode(t.mode)}>{<t.icon size={18} />}</IconBtn>
      ))}
      <div className="flex-1" />
      <IconBtn title="导出" onClick={() => window.dispatchEvent(new CustomEvent("cyc:export"))}><Download size={18} /></IconBtn>
      <IconBtn title="主题" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </IconBtn>
    </nav>
  );
}

function IconBtn({ title, onClick, active, children }: {
  title: string; onClick: () => void; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button title={title} onClick={onClick} aria-label={title}
      className={`group relative p-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-200
        ${active ? "text-[var(--foreground)] bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]" : ""}`}>
      {children}
      <span className="pointer-events-none absolute left-full ml-2 px-2 py-0.5 text-xs whitespace-nowrap rounded-md
        bg-[var(--surface)] border border-[var(--line)] opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
        {title}
      </span>
    </button>
  );
}
```

注意：主题切换需同步 `<html data-theme>`——在 `AppShell` 用 `useEffect` 监听 `project.theme` 写 `document.documentElement.dataset.theme`。`cyc:export` 自定义事件由 Export（Task 12）监听。

- [ ] **Step 4: `src/components/shell/MobileHeader.tsx`**

移动端顶部：左项目名（截断）、右主题按钮 + “编辑”按钮（打开 sheet：`setMobileSheetOpen(true)`）。简洁，仅图标+项目名。

- [ ] **Step 5: 验证**

Run: `pnpm dev`，桌面与移动（390px 宽）双端检查：三段式骨架、rail 图标 hover tooltip、主题切换改 `data-theme`。此时 Inspector/Player 可为空壳，但必须有可见结构（禁止空白占位）。

- [ ] **Step 6: Commit**

```bash
git add src/components/shell src/app/page.tsx && git commit -m "feat: app shell, project rail, mobile header"
```

---

## Task 6: Inspector + InfoEditor + SpineEditor + 模式切换动画

**Files:**
- Create: `src/components/editor/Inspector.tsx`
- Create: `src/components/editor/InfoEditor.tsx`
- Create: `src/components/editor/SpineEditor.tsx`
- Create: `src/components/editor/FilterSelector.tsx`（Task 9 填充，此步占位/最小可用）
- Create: `src/components/editor/TrackEditor.tsx`（Task 10 填充）

**Interfaces:**
- Consumes: store `mode/setMode/face/setFace/project`。
- Produces: `Inspector` 按 `mode` 渲染子面板；模式切换时**旧面板淡出与新面板淡入交叉**（motion `AnimatePresence mode="popLayout"`，动效曲线用面板切换值）。

- [ ] **Step 1: `src/components/editor/Inspector.tsx`**

```tsx
"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCompilationStore } from "@/store/use-compilation-store";
import { InfoEditor } from "./InfoEditor";
import { SpineEditor } from "./SpineEditor";
import { FilterSelector } from "./FilterSelector";
import { TrackEditor } from "./TrackEditor";
import { EditorMode } from "@/types/compilation";

const PANELS: Record<EditorMode, React.FC> = {
  info: InfoEditor,
  artwork: FilterSelector,   // Task 9 换为 ArtworkEditor 组合
  filters: FilterSelector,
  spine: SpineEditor,
  tracks: TrackEditor,
};

export function Inspector({ className = "" }: { className?: string }) {
  const mode = useCompilationStore((s) => s.mode);
  const face = useCompilationStore((s) => s.face);
  const Panel = PANELS[mode];
  return (
    <aside className={`${className} flex-col overflow-y-auto bg-[var(--surface)]`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={mode} className="p-4 flex-1 min-h-0"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } }}>
          <Panel />
        </motion.div>
      </AnimatePresence>
      {/* 模式 Tab（顶部分隔线，非悬浮） */}
      <div className="shrink-0 border-t border-[var(--line)] p-1 flex gap-1">
        {(["info", "artwork", "spine", "tracks"] as EditorMode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-2 py-1 text-xs rounded-md transition-colors ${mode === m ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
            {m}
          </button>
        ))}
      </div>
      <div className="shrink-0 border-t border-[var(--line)] p-2 flex gap-1 text-xs text-[var(--muted)]">
        {(["front", "back", "disc"] as const).map((f) => (
          <button key={f} onClick={() => setFace(f)}
            className={`px-2 py-1 rounded-md border border-transparent ${face === f ? "border-[var(--strong-line)] text-[var(--foreground)]" : ""}`}>
            {f}
          </button>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: `src/components/editor/InfoEditor.tsx`**

受控输入绑定 `project` 字段：标题/副标题/创建者/年份/简介。每次 onChange → `setProjectField(key, value)`。样式：字段标签 `text-[11px] uppercase tracking-wider text-[var(--muted)]`，输入框 `bg-transparent border-b border-[var(--line)] focus:border-[var(--strong-line)] outline-none py-1.5 text-sm`。简介用 `<textarea>`。

- [ ] **Step 3: `src/components/editor/SpineEditor.tsx`**

渲染 4 种侧标（catalog/obi/vertical/transparent）的小缩略预览 + 单选。`setProjectField("spineStyle", s)`。缩略图用简单 DOM 表示（窄条 + 文字），激活态用 `border-[var(--strong-line)]`。

- [ ] **Step 4: 验证**

Run: `pnpm dev`。桌面 Inspector 切换四个模式 Tab 无跳变、退出动画存在；编辑标题实时反映到 store（控制台/后续 Stage）。构建检查 `pnpm lint && pnpm build`。

- [ ] **Step 5: Commit**

```bash
git add src/components/editor && git commit -m "feat: inspector with mode switching animation, info & spine editors"
```

---

## Task 7: CD Stage——R3F 单碟 CD 盒（核心）

**Files:**
- Create: `src/components/stage/CDStage.tsx`
- Create: `src/components/stage/CDCase.tsx`
- Create: `src/components/stage/Disc.tsx`
- Create: `src/components/stage/StageLights.tsx`
- Create: `src/components/stage/StageFallback.tsx`

**Interfaces:**
- Consumes: store `project`（frontCover/backCover/discArtwork/spineStyle/theme/tracks/activeTrackId/player.isPlaying）；`filters.ts` 的 CSS/SVG filter（Task 9，此步先只映射 original）。
- Produces: `CDStage` 渲染 `<Canvas frameloop="demand" dpr={[1,1.5]}>`；内部维护展示角度 ref；暴露 `setView(face)` 供 face 按钮触发旋转。

**遵循 cd-showcase-3d skill 的参数（2026-08-06 用户确认，来源 `.claude/skills/cd-showcase-3d/assets/template.html`）：**
- **手势统一 Pointer Events**（鼠标 + 触屏一码）：拖拽旋转整盒 `dragRot.y` 钳制 ±0.7rad、`dragRot.x` ±0.35rad，`DRAG_SPEED=0.0045`；松手惯性：速度 `*exp(-dt*6)` 衰减、角度回中 `lerp(_,0,1-exp(-dt*3))`；移动端单指拖拽即旋转，点击=选中/开盒，完全无 hover 依赖。
- **鼠标视差**：`PARALLAX_X 0.05 / PARALLAX_Y 0.07`，平滑 `1-exp(-dt*4)`。
- **阻尼统一** `1-exp(-dt*k)`（帧率无关）；**不用 setState**，高频角度走 ref + useFrame。
- **点击交互**：点盒子 → 转正面 + 开盖（盖缝 ~12°，弹簧 stiffness 110/damping 22/mass 1.1）+ 唱片滑出约 2/3；再点 → 收回关闭（开与合同速）。
- **播放**：唱片 `rotation.z -= dt*2.8`；暂停/停止 → 速度指数衰减非骤停。
- **贴图工厂**（CanvasTexture，SRGBColorSpace，anisotropy 8）：封面=居中裁方+径向暗角（外缘 `rgba(0,0,0,0.30)`）；脊部=封面均色压暗 `rgba(0,0,0,0.42)` + 竖排等宽标题（`rotate(-PI/2)`+`scale(1,-1)` 防镜像）+ 边高光；托盘=黑 `#101010` + 凹槽 + 轴座 + 4 螺丝；碟=黑胶满幅 `#0a0a0a`（不留透明环）+ 圆形照片 + 中心标签 + 轴孔。
- **三态 face**：front=0°、back=π、disc=侧视（可略倾以观察抽碟）。

- [ ] **Step 1: `src/components/stage/CDStage.tsx`——Canvas 外壳 + 交互状态**

```tsx
"use client";
import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import { useCompilationStore } from "@/store/use-compilation-store";
import { CDCase } from "./CDCase";
import { StageLights } from "./StageLights";
import { StageFallback } from "./StageFallback";
import { isWebGLAvailable } from "./lib";

export function CDStage() {
  const theme = useCompilationStore((s) => s.project.theme);
  const face = useCompilationStore((s) => s.face);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasGL = useMemo(isWebGLAvailable, []);
  const viewAngle = useRef<{ x: number; y: number }>({ x: 0.2, y: 0.6 });

  if (!hasGL) return <StageFallback />;
  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-[var(--background)]">
      {/* 极轻网格/噪点背景（CSS） */}
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 0.4, 6.5], fov: 42 }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <Suspense fallback={null}>
          <StageLights theme={theme} />
          <CDCase viewAngleRef={viewAngle} face={face} />
        </Suspense>
      </Canvas>
      {/* 左上角当前编辑对象标识 */}
      <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 text-[11px] tracking-[0.3em] uppercase text-[var(--muted)]">
        {face === "front" ? "Front Cover" : face === "back" ? "Back Cover" : "Disc"}
      </div>
    </div>
  );
}
```

`isWebGLAvailable`（同文件 `lib.ts` 或内联）：`try { canvas.getContext("webgl2") || canvas.getContext("webgl") } catch { false }`。仅当不可用时降级。

- [ ] **Step 2: `src/components/stage/StageLights.tsx`**

```tsx
import { useFrame } from "@react-three/fiber";

export function StageLights({ theme }: { theme: "light" | "dark" }) {
  const key = theme; // 主题变化时整组重挂以过渡光色
  return (
    <group key={key}>
      <ambientLight intensity={theme === "dark" ? 0.5 : 0.9} />
      <directionalLight position={[4, 6, 5]} intensity={theme === "dark" ? 1.0 : 1.6} />
      <directionalLight position={[-4, -2, 3]} intensity={theme === "dark" ? 0.4 : 0.6} color="#b8c4d8" />
      <hemisphereLight args={[theme === "dark" ? "#1a1f2a" : "#ffffff", "#000000", theme === "dark" ? 0.25 : 0.4]} />
    </group>
  );
}
```

（若需平滑过渡，可用 `useFrame` lerp 光强——此步先做瞬间切换，Task 14 平滑化。）

- [ ] **Step 3: `src/components/stage/CDCase.tsx`——单碟 CD 盒模型**

核心几何（单位：盒高 2、宽 2.6、厚 0.18，等比于 skill 模板 `T.CASE_S/THICK`）：

```tsx
"use client";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useCompilationStore } from "@/store/use-compilation-store";
import { Disc } from "./Disc";

const CASE_W = 2.6, CASE_H = 2.0, THICK = 0.18;

export function CDCase({ face }: { face: "front" | "back" | "disc" }) {
  const groupRef = useRef<THREE.Group>(null);
  const lidRef = useRef<THREE.Group>(null);
  const caseGroup = useRef<THREE.Group>(null);
  const discGroup = useRef<THREE.Group>(null);
  const project = useCompilationStore((s) => s.project);
  const isPlaying = useCompilationStore((s) => s.player.isPlaying);
  const activeTrackId = useCompilationStore((s) => s.project.activeTrackId);

  const frontTex = useArtworkTexture(project.frontCover.imageUrl, project.frontCover.filter);
  const backTex = useArtworkTexture(project.backCover.imageUrl, project.backCover.filter);
  const discTex = useArtworkTexture(project.discArtwork.imageUrl, project.discArtwork.filter);

  const targetY = useMemo(() => {
    switch (face) {
      case "front": return 0;          // 正对
      case "back": return Math.PI;     // 背对（转到 180°）
      case "disc": return Math.PI / 2; // 侧视（方便观察抽碟）
    }
  }, [face]);

  useFrame((state, dt) => {
    const g = groupRef.current; if (!g) return;
    const k = 1 - Math.exp(-dt * 6); // 指数阻尼朝向 target
    g.rotation.y += (targetY - g.rotation.y) * k;
    if (Math.abs(targetY - g.rotation.y) < 0.001) g.rotation.y = targetY; // 到位硬停
  });
  // 拖拽：pointerdown/move/up 累加 groupRef.rotation.y（ref 直写，不走 setState），松开后保持
  // 开合：lidRef.rotation.x 在 open 状态趋近 ~0.22 rad；碟滑出 discGroup.position.x 趋近 ~0.6

  return (
    <group>
      {/* 底座 + 侧标 */}
      <group ref={caseGroup}>
        <RoundedBox args={[CASE_W, CASE_H, THICK]} radius={0.04} smoothness={4}>
          <meshStandardMaterial color={project.theme === "dark" ? "#151515" : "#f0f0ee"} />
        </RoundedBox>
        {/* spine 贴图：CASE_H×THICK 面，竖排文字/样式按 spineStyle —— 用 CanvasTexture 绘制 */}
      </group>
      {/* 盖子 */}
      <group ref={lidRef} position={[0, 0, THICK / 2]}>
        <RoundedBox args={[CASE_W, CASE_H, 0.03]} radius={0.02} smoothness={4}>
          <meshStandardMaterial map={frontTex} />
        </RoundedBox>
      </group>
      {/* 唱片（盖下，z≈THICK/2 内） */}
      <Disc texture={discTex} isPlaying={isPlaying && !!activeTrackId} />
    </group>
  );
}
```

`useArtworkTexture(url, filter)` 自定义 hook：`useMemo` 里从 URL 创建 `THREE.CanvasTexture`，先画到 canvas 再应用滤镜（`filters.ts` 的 `drawFiltered`）；`useEffect` cleanup 里 `tex.dispose()`；URL 变化即重建。**不用 `useLoader`**（URL 会高频变、需 dispose）。依赖说明：`filters.ts` 在 Task 9 建立；若 Task 7 先于 Task 9 完成，`useArtworkTexture` 先内联最小映射（`filter==="original" ? "none" : "grayscale(1)"` 之类），Task 9 完成后切到 `FILTERS`/`drawFiltered`，纹理语义不变（`imageUrl` 是唯一驱动）。

- [ ] **Step 4: `src/components/stage/Disc.tsx`——唱片模型**

唱片：圆柱（半径 0.78、高 0.025）+ 中心标签；顶面贴 `discTex`。播放时 `useFrame` 里 `rotation.z -= dt * 2.8`（从 skill 模板取值）；暂停时**指数阻尼减速**而非骤停：

```tsx
const speed = useRef(0);
useFrame((_, dt) => {
  const target = isPlaying ? 2.8 : 0;
  speed.current += (target - speed.current) * (1 - Math.exp(-dt * (isPlaying ? 8 : 1.2)));
  discRef.current.rotation.z -= speed.current * dt;
});
```

- [ ] **Step 5: `src/components/stage/StageFallback.tsx`——CSS 3D 降级**

纯 CSS `perspective` 实现一个简易 CD 盒（三面：front/back/spine + 一张唱片圆盘），同样响应 face 旋转（CSS `rotateY` 过渡）、图片背景与滤镜。触发条件：WebGL 不可用 或 接入超时（计划书 §十一 00:45–01:25 兜底）。此步实现基础版，Task 14 不覆盖更多动效。

- [ ] **Step 6: 验证**

Run: `pnpm dev`。检查：正面默认显示；face 切换旋转到位；封面/背面/盘面图片更新实时反映（上传在 Task 8 后联调）；拖拽可旋转；无图时显示材质占位（中性灰 `#3a3a3a` + “NO COVER” 小字，可用 CanvasTexture 画）。性能：静止时 `requestAnimationFrame` 不持续（frameloop=demand）。

- [ ] **Step 7: Commit**

```bash
git add src/components/stage && git commit -m "feat: R3F CD case with textures, drag, open/close, spinning disc"
```

---

## Task 8: 图片上传 + 裁剪编辑（ArtworkEditor + resize/crop）

**Files:**
- Create: `src/components/editor/ArtworkEditor.tsx`
- Create: `src/lib/image/resize.ts`
- Create: `src/lib/image/crop.ts`
- Modify: `src/components/editor/Inspector.tsx`（mode==="artwork" 挂 ArtworkEditor）

**Interfaces:**
- Consumes: store `face/setArtwork`；`react-easy-crop`。
- Produces: `fileToDataUrl(file)`、`resizeImageToMax(dataUrl, max=1600): Promise<dataUrl>`、`cropImage(src, crop, zoom, rotation): Promise<dataUrl>`；`ArtworkEditor` 内嵌 `Cropper`，onCropComplete 存 `crop`，onChange 存 `zoom/rotation`。

- [ ] **Step 1: `src/lib/image/resize.ts`**

```ts
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export async function resizeImageToMax(src: string, maxEdge = 1600): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.9);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
```

- [ ] **Step 2: `src/lib/image/crop.ts`——从 react-easy-crop 的 crop/zoom/rotation 生成最终图**

```ts
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
```

（若 crop 为像素坐标，则用 react-easy-crop 官方 `getCroppedImg` 等价实现；此处 crop 以相对比例 `x/y/width/height` ∈ [0,1] 存储。）

- [ ] **Step 3: `src/components/editor/ArtworkEditor.tsx`**

```tsx
"use client";
import { useCallback, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Point } from "react-easy-crop";
import { useCompilationStore } from "@/store/use-compilation-store";
import { fileToDataUrl, resizeImageToMax } from "@/lib/image/resize";
import { cropImage } from "@/lib/image/crop";

export function ArtworkEditor() {
  const face = useCompilationStore((s) => s.face);
  const art = useCompilationStore((s) => s.project[face === "front" ? "frontCover" : face === "back" ? "backCover" : "discArtwork"]);
  const setArtwork = useCompilationStore((s) => s.setArtwork);
  const [src, setSrc] = useState<string | null>(art.imageUrl);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    const resized = await resizeImageToMax(dataUrl);
    setSrc(resized);              // 预览源（未裁剪）
    setArtwork(face, { sourceName: f.name }); // 先标记，裁剪确认后写 imageUrl
  }, [face, setArtwork]);

  const onCropComplete = useCallback((crop: CropArea) => {
    setArtwork(face, { crop });
  }, [face, setArtwork]);

  const applyCrop = useCallback(async () => {
    if (!src) return;
    const out = await cropImage(src, art.crop, art.zoom, art.rotation);
    const old = art.imageUrl;
    setArtwork(face, { imageUrl: out });
    if (old && old.startsWith("blob:")) URL.revokeObjectURL(old); // 释放旧 URL
  }, [src, art, face, setArtwork]);

  const reset = useCallback(() => {
    setSrc(null);
    setArtwork(face, { sourceName: null, imageUrl: null, crop: { x: 0, y: 0, width: 1, height: 1 }, zoom: 1, rotation: 0 });
  }, [face, setArtwork]);

  return (
    <div className="space-y-4">
      <div className="relative h-56 rounded-xl overflow-hidden border border-[var(--line)]">
        {src ? (
          <Cropper
            image={src}
            crop={art.crop}
            zoom={art.zoom}
            rotation={art.rotation}
            aspect={1}
            onCropChange={(pos: Point) => setArtwork(face, { crop: { ...art.crop, x: pos.x, y: pos.y } })} // 保留 width/height
            onZoomChange={(z: number) => setArtwork(face, { zoom: z })}
            onRotationChange={(r: number) => setArtwork(face, { rotation: r })}
            onCropComplete={onCropComplete}
          />
        ) : (
          <button onClick={() => fileRef.current?.click()} className="w-full h-full grid place-items-center text-sm text-[var(--muted)]">
            点击上传{face === "front" ? "正面封面" : face === "back" ? "背面封面" : "盘面图"}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      <div className="flex gap-2">
        <button onClick={applyCrop} className="flex-1 py-2 text-sm border border-[var(--strong-line)] rounded-lg">应用裁剪</button>
        <button onClick={reset} className="flex-1 py-2 text-sm text-[var(--muted)]">恢复默认</button>
      </div>
      {/* 缩放/旋转滑块：range 输入，value 绑定 art.zoom / art.rotation */}
    </div>
  );
}
```

要点：缩放/旋转用滑块实时写 store（`art.zoom/rotation`），纹理更新由 CDCase 的 `useArtworkTexture` 响应 `imageUrl` 变化（**裁剪确认后才更新 imageUrl**，避免拖动裁剪时高频重建纹理）。上传后占位淡出、新图轻微 scale 进入（motion，见 §八）。

- [ ] **Step 4: Inspector 挂载**

`PANELS.artwork = ArtworkEditor`（Task 6 中替换占位）。

- [ ] **Step 5: 验证**

Run: `pnpm dev`。上传 → 拖拽/缩放/旋转 → 应用裁剪 → Stage 封面实时更新；刷新页面图片保留（persist）；换图/恢复默认正常；控制台无泄漏（重传多次不报）。

- [ ] **Step 6: Commit**

```bash
git add src/lib/image src/components/editor/ArtworkEditor.tsx && git commit -m "feat: artwork upload, crop, resize, texture update"
```

---

## Task 9: 艺术滤镜（FilterSelector + art-filters.ts 像素管线）

> 需求变更（2026-08-06）：**12 个艺术型滤镜**替代原 10 个简单 CSS 滤镜，Canvas 2D 逐像素处理。方案已确认：预览降采样(~320px)+150ms 防抖，纹理/导出全量烘焙。

**Files:**
- Modify: `src/types/compilation.ts`（`FilterId` 改为 13 项：original + 12 艺术滤镜）
- Create: `src/lib/image/art-filters.ts`（注册表 + 纯像素算法）
- Create: `src/components/editor/FilterSelector.tsx`（真实实现，替换 Task 6 存根）
- Modify: `src/components/stage/lib.ts`（`useArtworkTexture` 改用 art-filters 烘焙）

**Interfaces:**
- Consumes: store `face/setArtwork`、`art.filter`；`CropArea`。
- Produces: `ART_FILTERS: { id: FilterId; label: string }[]`；`applyArtFilter(ctx, id, seed?)`（逐像素，O(n)）；`bakeFilteredUrl(src, filter, maxEdge?, seed?)`（预览 maxEdge=320 / 全量 maxEdge=1600）。

- [ ] **Step 1: `FilterId` 类型改为 13 项（`src/types/compilation.ts`）**

```ts
export type FilterId =
  | "original" | "ascii" | "halftone" | "pixel" | "oilpainting"
  | "dither" | "comic" | "risograph" | "vhs" | "glitch"
  | "sketch" | "collage" | "filmnegative";
```

- [ ] **Step 2: `src/lib/image/art-filters.ts`——注册表 + 纯像素函数**

```ts
import type { FilterId } from "@/types/compilation";

export interface ArtFilterDef { id: FilterId; label: string; }
export const ART_FILTERS: ArtFilterDef[] = [
  { id: "original", label: "Original" },
  { id: "ascii", label: "ASCII" },
  { id: "halftone", label: "Halftone" },
  { id: "pixel", label: "Pixel" },
  { id: "oilpainting", label: "Oil Painting" },
  { id: "dither", label: "Dither" },
  { id: "comic", label: "Comic" },
  { id: "risograph", label: "Risograph" },
  { id: "vhs", label: "VHS" },
  { id: "glitch", label: "Glitch" },
  { id: "sketch", label: "Sketch" },
  { id: "collage", label: "Collage" },
  { id: "filmnegative", label: "Film Negative" },
];

// 每个滤镜 = 纯函数 (data: Uint8ClampedArray, w, h, seed) => void，原地改像素（RGBA）
export function applyArtFilter(ctx: CanvasRenderingContext2D, id: FilterId, seed = 0): void { /* 见算法 */ }
```

每个滤镜核心算法（`ctx.getImageData` 后逐像素，`putImageData` 写回）：
- **ascii**：先降采样到格子（如宽 96 格），亮度 → `" .:-=+*#%@"` 字符（暗→密），用 `fillText` 铺字符纹理。
- **halftone**：分格（~8px）亮度 → 格内黑圆点半径（格越大越暗），白底。
- **pixel**：块均色（块 12px）→ 最近邻放大（方块化）。
- **oilpainting**：邻域(半径 4)像素按亮度分 8 桶，取最频桶平均色（油画笔触）。
- **dither**：Bayer 4×4 阈值矩阵（`[0,8,2,10;12,4,14,6;3,11,1,9;15,7,13,5]`/16）黑白抖动。
- **comic**：posterize 4 级 + 亮度网点 + 简单 Sobel 边缘勾黑线。
- **risograph**：亮度二值化 → 双色（暗 `#1a2238` + 冷强调 `#5b7a9d`，**不用黄**）半色调错开 45° 网点。
- **vhs**：水平扫描线（每 3px 暗一行）+ RGB 通道水平错位 1-2px + 噪点 + 行亮度轻微抖动。
- **glitch**：RGB 通道错位（R/B 平移 ±6px）+ 按行切片位移（seed 伪随机，位移 -12..12px，色相轻微偏移）。
- **sketch**：Sobel 边缘幅值 → 白底 `255-lum` 深线稿（阈值化）。
- **collage**：错位纸片矩形（4-6 块，seed 驱动位置/旋转/透明度 0.85）+ 轻微边界加深。
- **filmnegative**：RGB 通道反相 + 轻微对比增强。

**确定性**：重滤镜（oilpainting/vhs/glitch/collage）用 `seed = hash(face+id)` 保证预览与烘焙一致。**性能**：预览 `bakeFilteredUrl(src, filter, 320)` 防抖 150ms；重滤镜在 320px 下 O(320²) 可接受。

- [ ] **Step 3: `FilterSelector`——真实实现（替换 Task 6 存根）**

13 格缩略网格（4-5 列）：小方块内渲染当前 face `imageUrl` 应用 `bakeFilteredUrl(..., maxEdge≈96)`（无图灰色底+标签）。异步加载 + 按 `face:filter:imageUrl` 缓存 Map。点击 → `setArtwork(face, { filter: id })`。选中态 `border-[var(--strong-line)]`。

- [ ] **Step 4: 纹理接入（`src/components/stage/lib.ts`）**

`useArtworkTexture(imageUrl, filter)` 改为：`bakeFilteredUrl(imageUrl, filter, 1600)` 得到烘焙 URL → 新建 `CanvasTexture`（SRGB, anisotropy 8）；`imageUrl`/`filter` 变化时 dispose 重建。

- [ ] **Step 5: 验证**

`pnpm build` 通过。浏览器：13 格缩略均出效果；切滤镜后 3D 纹理同步；重滤镜（oil/glitch/vhs）预览流畅（320px 防抖）；无图灰色+NO COVER；预览与导出（Task 12）烘焙一致。

- [ ] **Step 6: Commit**

```bash
git add src/types/compilation.ts src/lib/image/art-filters.ts src/components/editor/FilterSelector.tsx src/components/stage/lib.ts && git commit -m "feat: art filters pipeline with 12 pixel filters"
```

---

## Task 10: 曲目编辑器（TrackEditor + 拖动排序）

**Files:**
- Create: `src/components/editor/TrackEditor.tsx`
- Create: `src/lib/image/filters.ts`（已建，不改）

**Interfaces:**
- Consumes: store `project.tracks/activeTrackId/addTrack/updateTrack/removeTrack/reorderTracks/setActiveTrack`。
- Produces: 可增删改排的曲目列表；行内编辑标题/艺术家；拖动排序（原生 DnD 或简化上下移按钮——**优先原生 DnD，避免引库**；若超时用上下移按钮）。

- [ ] **Step 1: `src/components/editor/TrackEditor.tsx`**

```tsx
"use client";
import { Plus, GripVertical, Trash2 } from "lucide-react";
import { useCompilationStore } from "@/store/use-compilation-store";
import { createId } from "@/lib/storage";

export function TrackEditor() {
  const tracks = useCompilationStore((s) => s.project.tracks);
  const activeTrackId = useCompilationStore((s) => s.project.activeTrackId);
  const { updateTrack, removeTrack, addTrack, setActiveTrack, reorderTracks } = useCompilationStore.getState();

  const add = () => {
    const t = { id: createId("trk"), title: "未命名曲目", artist: "—", duration: 0, src: "" };
    addTrack(t);
  };

  return (
    <div className="space-y-1">
      <ul>
        {tracks.map((t, i) => (
          <li key={t.id} draggable
            onDragStart={(e) => e.dataTransfer.setData("text/index", String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const from = Number(e.dataTransfer.getData("text/index"));
              if (from !== i) reorderTracks(from, i);
            }}
            className={`group flex items-center gap-2 px-2 py-2 rounded-lg border-b border-[var(--line)] cursor-pointer ${t.id === activeTrackId ? "bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]" : ""}`}
            onClick={() => setActiveTrack(t.id)}>
            <GripVertical size={14} className="text-[var(--muted)] cursor-grab" />
            <span className="font-mono-num text-xs text-[var(--muted)] w-6">{String(i + 1).padStart(2, "0")}</span>
            <div className="flex-1 min-w-0">
              <input value={t.title} onChange={(e) => updateTrack(t.id, { title: e.target.value })}
                className="w-full bg-transparent text-sm outline-none" />
              <input value={t.artist} onChange={(e) => updateTrack(t.id, { artist: e.target.value })}
                className="w-full bg-transparent text-xs text-[var(--muted)] outline-none" />
            </div>
            <span className="font-mono-num text-xs text-[var(--muted)]">{formatTime(t.duration)}</span>
            <button onClick={() => removeTrack(t.id)} className="opacity-0 group-hover:opacity-100 text-[var(--muted)]"><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>
      <button onClick={add} className="w-full py-2 text-sm text-[var(--muted)] border border-dashed border-[var(--strong-line)] rounded-lg flex items-center justify-center gap-1">
        <Plus size={14} /> 添加曲目
      </button>
    </div>
  );
}
```

拖动排序用 HTML5 DnD（`dragstart` 存 index，`drop` 调 `reorderTracks`）。播放中行显示 `PlayingIndicator`（Task 11）。

- [ ] **Step 2: 验证**

Run: `pnpm dev`。增删改、拖动排序、点行切 activeTrack 均生效并持久化。

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/TrackEditor.tsx && git commit -m "feat: track editor with drag sorting"
```

---

## Task 11: 播放器（Player + Progress + 播放引擎 + 唱片联动）

**Files:**
- Create: `src/components/player/Player.tsx`
- Create: `src/components/player/Progress.tsx`
- Create: `src/components/player/PlayingIndicator.tsx`
- Create: `src/hooks/use-player-engine.ts`（音频引擎：`<audio>` 或 Web Audio 包装）

**Interfaces:**
- Consumes: store `project.tracks/activeTrackId/player/setIsPlaying/setProgress/setActiveTrack`；`getMusicProvider().getPlayableSource`。
- Produces: 播放/暂停、上一首/下一首、进度（可拖动）、时长；引擎单例（桌面/移动 Player 共享）；`audio` 元素 ref 暴露给 CDStage 判断播放态（实际上以 store `player.isPlaying` + `activeTrackId` 为准，CDCase 读 store 即可）。

- [ ] **Step 1: `src/hooks/use-player-engine.ts`**

```ts
"use client";
import { useEffect, useRef } from "react";
import { useCompilationStore } from "@/store/use-compilation-store";
import { getMusicProvider } from "@/lib/music/provider";

export function usePlayerEngine() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const store = useCompilationStore;
  const activeTrack = useCompilationStore((s) => s.project.tracks.find((t) => t.id === s.project.activeTrackId) ?? null);

  const play = async (id: string) => {
    const { project, setActiveTrack, setIsPlaying, setProgress } = store.getState();
    const track = project.tracks.find((t) => t.id === id);
    const audio = audioRef.current;
    if (!audio || !track) return;
    const source = await getMusicProvider().getPlayableSource(track); // 走 Provider，首次会合成
    if (!source) { setIsPlaying(false); return; } // 无源：不播，避免假按钮
    if (audio.src !== source.url) {
      audio.src = source.url;
      audio.load();
    }
    setActiveTrack(track.id);
    setProgress({ duration: source.duration ?? track.duration });
    await audio.play().catch(() => setIsPlaying(false));
    setIsPlaying(true);
  };

  const toggle = () => {
    const { player } = store.getState();
    const audio = audioRef.current;
    if (player.isPlaying) { audio?.pause(); store.getState().setIsPlaying(false); }
    else if (activeTrack) play(activeTrack.id);
  };
  const next = () => { /* activeTrackId index+1 -> play */ };
  const prev = () => { /* index-1（>3s 则归零重播） */ };
  const seek = (t: number) => { if (audioRef.current) { audioRef.current.currentTime = t; setProgress({ currentTime: t }); } };

  // <audio> 事件 -> store
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setProgress({ currentTime: a.currentTime });
    const onEnd = () => { /* 自动下一首 */ };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => { a.removeEventListener("timeupdate", onTime); a.removeEventListener("ended", onEnd); a.removeEventListener("play", onPlay); a.removeEventListener("pause", onPause); };
  }, []);

  return { audioRef, play, toggle, next, prev, seek, activeTrack };
}
```

播放器**不自动播放**：仅用户点击触发（浏览器策略）。`track.src` 为空或非 data URI 时静默跳过，不假装可播。

- [ ] **Step 2: `src/components/player/Player.tsx`**

底部单层 68–80px：曲名/艺术家（当前 activeTrack）+ 控制按钮（上一首/播放暂停/下一首，lucide）+ `Progress` + 时长 `mm:ss`。`<audio ref>` 挂在此组件（桌面/移动仅一个实例渲染，若双实例则用模块级单例 audio 元素）。

- [ ] **Step 3: `src/components/player/Progress.tsx`**

可拖动进度条：`input type=range` 或 pointer 事件，value=`player.currentTime`，max=`player.duration`，onChange→`seek`。样式细线 + 圆点，播放中描边。

- [ ] **Step 4: `src/components/player/PlayingIndicator.tsx`**

当前曲目编号旁的细小动态波形：3 条 `<span>`，播放时 CSS 动画高度（`transform-origin` bottom，`@keyframes`），暂停时静态。**仅 transform 动画**。可挂在 TrackEditor 行内。

- [ ] **Step 5: 验证**

Run: `pnpm dev`。点播放 → 有声音（合成旋律）、唱片缓慢旋转、进度走动、切曲正常；暂停 → 唱片逐渐减速非骤停；刷新后 `player` 会话态重置但 activeTrackId 持久（persist project）。双端布局正常。

- [ ] **Step 6: Commit**

```bash
git add src/hooks src/components/player && git commit -m "feat: player engine, progress, playing indicator, disc sync"
```

---

## Task 12: PNG 宣传图导出（ExportCard + html-to-image）

**Files:**
- Create: `src/components/export/ExportCard.tsx`
- Create: `src/lib/export-image.ts`
- Modify: `src/components/shell/AppShell.tsx`（挂 ExportCard 隐藏节点 + 监听 `cyc:export`）

**Interfaces:**
- Consumes: store `project`；`art-filters.ts`（`bakeFilteredUrl`）。
- Produces: 2D 宣传图节点（正面封面 + 标题/副标题 + spine 样式 + 滤镜烘焙），`toPng(node, { pixelRatio: 2 })` 下载。

- [ ] **Step 1: `src/lib/export-image.ts`**

```ts
import { toPng } from "html-to-image";

export async function exportCardPng(node: HTMLElement): Promise<string> {
  return toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: "#f5f5f3" });
}
```

- [ ] **Step 2: `src/components/export/ExportCard.tsx`**

固定尺寸（如 1200×900 等比例）、`position: fixed; left: -9999px` 隐藏但可渲染。内容：CD 封面（前景）叠在纸盒（含 spine）上，标题/副标题/创建者/年份，滤镜经 `bakeFilter` 烘焙进封面 `<img>`。用真实 DOM + img，保证 html-to-image 可抓取。

- [ ] **Step 3: AppShell 接线**

```tsx
useEffect(() => {
  const onExport = () => {
    const node = document.getElementById("cyc-export-card");
    if (!node) return;
    exportCardPng(node).then((url) => {
      const a = document.createElement("a");
      a.href = url; a.download = `${project.title || "collection"}.png`;
      a.click();
      URL.revokeObjectURL(url); // toPng 返回 dataURL 时无需 revoke；若返回 blob 则释放
    });
  };
  window.addEventListener("cyc:export", onExport);
  return () => window.removeEventListener("cyc:export", onExport);
}, [project]);
```

`<ExportCard id="cyc-export-card" />` 常驻（或仅在导出瞬间挂载）。

- [ ] **Step 4: 验证**

Run: `pnpm dev`。点 Rail 导出按钮 → 下载 PNG，内容含封面/标题/滤镜；导出不依赖 3D Canvas（spec §八 兜底方案）。

- [ ] **Step 5: Commit**

```bash
git add src/components/export src/lib/export-image.ts && git commit -m "feat: 2D export card with html-to-image"
```

---

## Task 13: 移动端 Bottom Sheet

**Files:**
- Create: `src/components/shell/MobileEditorSheet.tsx`

**Interfaces:**
- Consumes: store `mobileSheetOpen/setMobileSheetOpen/mode/setMode/face/setFace`。
- Produces: 底部滑入面板（顶部圆角 20–24px），5 个 Tab 复用 `Inspector` 的子面板；拖动关闭跟手；打开时 Stage 轻微上移缩小。

- [ ] **Step 1: `src/components/shell/MobileEditorSheet.tsx`**

```tsx
"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCompilationStore } from "@/store/use-compilation-store";
import { InfoEditor } from "@/components/editor/InfoEditor";
// ... 复用 Inspector 的 PANELS 映射（抽到共享文件避免重复）

export function MobileEditorSheet() {
  const open = useCompilationStore((s) => s.mobileSheetOpen);
  const setOpen = useCompilationStore((s) => s.setMobileSheetOpen);
  const mode = useCompilationStore((s) => s.mode);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="absolute inset-0 z-40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/20" onClick={() => setOpen(false)} />
          <motion.div
            className="absolute inset-x-0 bottom-0 h-[70dvh] rounded-t-[20px] bg-[var(--surface)]"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.8 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 120) setOpen(false); }}>
            <div className="h-1 w-8 mx-auto my-2 rounded-full bg-[var(--line)]" />
            {/* 子面板 + Tab */}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

Stage 上移缩小：在 AppShell 中当 sheet 打开时给 Stage 容器加 `motion` 的 `scale 0.96 + y -8`（读 store）。面板内容与桌面共享同一批 `*Editor` 组件（DRY）。

- [ ] **Step 2: 验证**

Run: `pnpm dev`（390px）。打开/关闭动画跟手；拖动 120px 关闭；背景少量暗化；Stage 轻微缩小；编辑生效。

- [ ] **Step 3: Commit**

```bash
git add src/components/shell/MobileEditorSheet.tsx && git commit -m "feat: mobile bottom sheet editor"
```

---

## Task 14: 核心动效收尾 + 主题平滑 + reduced-motion

**Files:**
- Modify: `src/components/shell/AppShell.tsx`（主题 data-theme 同步 useEffect）
- Modify: `src/components/stage/CDCase.tsx`（开合弹簧：`{ type:"spring", stiffness:110, damping:22, mass:1.1 }`；模式切换 70% 交叉已在 Task 6 Inspector）
- Modify: `src/components/stage/StageLights.tsx`（明暗 lerp）
- Modify: `src/components/editor/ArtworkEditor.tsx`（上传占位淡出 + 新图 scale 进入）
- Modify: `src/components/player/Progress.tsx`（拖动跟手）
- Modify: `src/components/player/Player.tsx`（移动端实例补顶部分隔线 —— Task 11 遗留 minor）

**Interfaces:**
- Consumes: 前述全部组件；`prefers-reduced-motion` 通过 `useReducedMotion()`（motion）或 CSS 全局降级。
- Produces: 计划书 §八 关键动效清单全部落地。

- [ ] **Step 1: 主题 data-theme 同步**

AppShell `useEffect(() => { document.documentElement.dataset.theme = project.theme; }, [project.theme])`。浅深色切换时 3D 灯光由 StageLights 的 key 重挂 + `useFrame` lerp 光强（0.5s）。

- [ ] **Step 2: 开合与碟滑出动画**

CDCase：open 状态用 motion-like 指数阻尼或自定义 spring（纯 R3F 用 `useFrame` 逼近 `1-Math.exp(-dt*k)` 等效物理弹簧）驱动 `lidRef.rotation.x` 与 `discGroup.position.x`，开与合同速、到位硬停（参考 skill 模板第 9 条踩坑）。

- [ ] **Step 3: 上传动效**

ArtworkEditor：旧占位 `AnimatePresence` 淡出；新图 `initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}`（时长 0.32 面板曲线）。**不弹 Toast**。

- [ ] **Step 4: reduced-motion**

全局 CSS 已降级（Task 1）。组件内：`const reduced = useReducedMotion()`；为 true 时 `autoRotate=false`、拖拽惯性关闭、CD 开合直接跳变、无 par变。验证：系统开启 reduce 后动画近乎瞬态。

- [ ] **Step 5: 验证**

逐项过 §八：模式切换无跳变（模型先转、面板交叉）、面板退出动画、CD 开合连续、唱片不突然启停、移动端拖拽不严重冲突滚动、低性能设备降级。`pnpm lint && pnpm build` 通过。

- [ ] **Step 6: Commit**

```bash
git add src && git commit -m "feat: core motion polish, theme smoothing, reduced-motion support"
```

---

## Task 15: IndexedDB 存储迁移 + Track→CompilationTrack 类型迁移（Dexie + StoredImage + 自动保存）

> 需求变更（2026-08-06）：项目数据与图片 Blob 以 IndexedDB 为主存储（Dexie），localStorage 只存偏好；图片不再以 base64 存 JSON，改存 `imageId` 引用 StoredImage Blob。用户创建的精选集长期缓存（`navigator.storage.persist()`）。

**Files:**
- Modify: `src/types/compilation.ts`（`CompilationProject` 加 `createdAt/updatedAt`；`ArtworkState.imageUrl` → `imageId`；`Track` → `CompilationTrack`：`provider`/`providerTrackId`/`title`/`artist`/`album?`/`artworkUrl?`/`durationMs?`，去 `src`）
- Create: `src/store/db.ts`（Dexie：`cyc-db`，表 `projects`、`storedImages`）
- Create: `src/lib/image/blobs.ts`（`compressImage(file): Promise<Blob>` WebP/JPEG ≤2048px；`storeImage(blob): Promise<StoredImage>`；`getImageUrl(imageId): Promise<string>` Object URL）
- Modify: `src/store/use-compilation-store.ts`（持久化切到自动保存 IndexedDB；localStorage 只留偏好）
- Modify: `src/components/editor/ArtworkEditor.tsx`、`src/components/stage/*`、`src/components/export/ExportCard.tsx`、`src/components/editor/TrackEditor.tsx`、`src/hooks/use-player-engine.ts`（消费方按新字段名迁移）

**Interfaces:**
- Consumes: `src/types/compilation.ts` 新结构；`src/data/demo-project.ts`（首启导入 IndexedDB）。
- Produces: `db.ts`（`saveProject/getProject/listProjects/deleteProject/saveStoredImage/getStoredImage`）；`useCompilationStore` 自动保存（防抖 500–1000ms）；`navigator.storage.persist()` 申请。

- [ ] **Step 1: 类型迁移**（`compilation.ts`）

```ts
export type TrackProvider = "demo" | "netease";
export interface CompilationTrack {
  id: string;
  provider: TrackProvider;
  providerTrackId: string | null;   // netease 歌曲 id；demo 为 null
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;              // 网易云封面（网络 URL，不落库为 blob）
  durationMs?: number;
}
export interface ArtworkState {
  sourceName: string | null;
  imageId: string | null;           // → storedImages 表主键；运行时经 getImageUrl 拿 Object URL
  crop: CropArea;
  zoom: number;
  rotation: number;
  filter: FilterId;
}
export interface CompilationProject {
  id: string;
  title: string; subtitle: string; curator: string; year: string; description: string;
  spineStyle: SpineStyle; theme: "light" | "dark";
  frontCover: ArtworkState; backCover: ArtworkState; discArtwork: ArtworkState;
  tracks: CompilationTrack[];
  createdAt: number; updatedAt: number;
}
export interface StoredImage { id: string; blob: Blob; width: number; height: number; createdAt: number; }
```

- [ ] **Step 2: `src/store/db.ts`（Dexie）**

`new Dexie("cyc-db")`，`version(1).stores({ projects: "id, title, updatedAt", storedImages: "id" })`。项目记录含整个 `CompilationProject`（ArtworkState 只带 `imageId`，无 base64）。

- [ ] **Step 3: `src/lib/image/blobs.ts`**

`compressImage(file)`：校验类型（image/*）、`createImageBitmap` 或 `loadImage` 后最长边 ≤2048 等比缩放，`canvas.toBlob("image/webp", 0.85)`（不支持 webp 回落 jpeg）。`storeImage`/`getImageUrl` 封装 DB 读写 + Object URL 生命周期（`revokeObjectUrl` 工具）。

- [ ] **Step 4: store 自动保存**

`useCompilationStore` 去掉 `persist` 的 localStorage 全量持久化；改为订阅 `project` 变更 → 防抖 500–1000ms → `db.saveProject`。App 首启：读 localStorage 偏好 `currentProjectId` → `db.getProject` → 载入；无则 `createDemoProject()` 导入。`navigator.storage.persist()` 启动时调用（幂等）。theme/上次编辑模式等偏好单独小 store 存 localStorage。

- [ ] **Step 5: 消费方迁移**

ArtworkEditor 上传后 `compressImage` → `storeImage` → `setArtwork(face,{imageId})`；预览用 `getImageUrl(imageId)` 的 Object URL（换图/卸载 revoke）。Stage/Export 读 Object URL 渲染纹理/导出。Player 引擎 `durationMs` → 秒换算；demo 曲目 `provider:"demo"`、`providerTrackId:null`。TrackEditor 增删改按新字段。

- [ ] **Step 6: 验证**

`pnpm lint && pnpm build` 通过。浏览器：上传图片 → 刷新保留（IndexedDB 而非 localStorage，DevTools Application 面板确认 storedImages 有 Blob）；`navigator.storage.persist()` resolved true（或 Note 被拒绝仍可用）；重载无 console 错误；旧 localStorage 数据忽略（一次性迁移或丢弃，取 spec 决定）。

- [ ] **Step 7: Commit**

```bash
pnpm add dexie
git add src/types src/store/db.ts src/lib/image/blobs.ts src/components src/hooks && git commit -m "feat: indexeddB storage migration with StoredImage blobs and autosave"
```

---

## Task 16: 本地项目管理（多项目）

> 需求变更（2026-08-06）：用户可创建多个精选集，创建/列表/打开/重命名/删除，自动保存。UI 为纯功能面板（非动效重点）。

**Files:**
- Create: `src/store/use-projects-store.ts`（项目列表：id/title/updatedAt/封面缩略；actions: create/rename/delete/open）
- Create: `src/components/projects/ProjectManager.tsx`（列表 + 新建 + 重命名 + 删除 + 打开）
- Modify: `src/components/shell/ProjectRail.tsx`（项目入口，桌面）
- Modify: `src/components/shell/MobileHeader.tsx`（项目入口，移动端）
- Modify: `src/components/shell/AppShell.tsx`（挂载 ProjectManager 弹层/面板）

**Interfaces:**
- Consumes: `db.ts`（listProjects/saveProject/deleteProject）；`useCompilationStore`（loadProject/saveCurrent）。
- Produces: 项目切换；新建（默认模板）与删除（确认）；打开即载入 compilation store 并写 `currentProjectId` 偏好。

- [ ] **Step 1: `use-projects-store.ts`**

列表订阅 DB（`db.listProjects()` 排序 updatedAt desc），actions 更新后重查。删除需二次确认（用内联确认态）。

- [ ] **Step 2: `ProjectManager.tsx`**

列表每项：标题 + 更新时间（相对）+ 操作（重命名/删除）。顶部「新建精选集」。点击打开 → `loadProject`。桌面从 ProjectRail 图标进（抽屉或覆盖层，贴边非悬浮 Card），移动端从 MobileHeader 进 Bottom Sheet 复用同一组件。

- [ ] **Step 3: 验证**

`pnpm lint && pnpm build`。浏览器：新建→编辑→列表出现；切项目内容正确载入；重命名/删除生效；刷新后列表与当前项目保持。

- [ ] **Step 4: Commit**

```bash
git add src/store/use-projects-store.ts src/components/projects src/components/shell && git commit -m "feat: multi-project management with db-backed list"
```

---

## Task 17: 项目备份导出/导入（.album.json + 可选 ZIP）

> 需求变更（2026-08-06）：备份导出 `.album.json`（metadata + tracks + 图片设置 + 必要图片数据）；可选 ZIP（project.json + images/front.webp|back.webp|disc.webp）。导入恢复为项目。

**Files:**
- Create: `src/lib/backup.ts`（exportAlbumJson / importAlbumJson / exportZip / importZip）
- Create: `src/components/export/BackupActions.tsx`（导出/导入按钮组；或并入 ProjectManager）
- Modify: `src/store/db.ts`（导入后 saveProject + 图片 Blob 入 storedImages）
- Modify: `src/components/projects/ProjectManager.tsx`（备份/恢复入口）

**Interfaces:**
- Consumes: `db.ts`、`blobs.ts`、`export-image.ts`。
- Produces: `.album.json`（`version`/`meta`/`tracks`/`artwork: { front/back/disc: { 图片 base64, crop, zoom, rotation, filter } }`）；ZIP（**优先 JSZip**，避免手写 ZIP）；导入侧按 ID 去重建项目。

- [ ] **Step 1: `src/lib/backup.ts`**

导出：读当前项目 → 收集三图 Blob → base64 内嵌（json 版）或独立 webp 文件（zip 版）→ 触发下载。导入：`<input type=file accept=".json,.zip,.album.json">` → 解析 → 校验 version → 还原图片到 IndexedDB（新 imageId）→ saveProject。

- [ ] **Step 2: `BackupActions.tsx`**

导出（json / 可选 zip 双按钮）+ 导入（file picker）。样式沿用编辑器控件 token（细线/小字），不弹 Toast。

- [ ] **Step 3: 验证**

导出 json 与 zip 均可下载；删除项目后导入恢复完整（含封面/盘面/曲目）；损坏文件导入报错不崩溃。

- [ ] **Step 4: Commit**

```bash
pnpm add jszip
git add src/lib/backup.ts src/components/export/BackupActions.tsx && git commit -m "feat: project backup export/import as json and zip"
```

---

## Task 18: NeteaseClient 纯前端库

> 需求变更（2026-08-06）：**纯前端**，浏览器直调第三方网易云 API（无后端代理、无登录、无 Cookie）。Base URL 由 `NEXT_PUBLIC_NETEASE_API_BASE_URL` 提供（需 CORS-enabled 的公共实例）。这是纯数据/逻辑库，**无 UI，不需设计确认**。

**Files:**
- Create: `src/lib/netease/config.ts`（读 `NEXT_PUBLIC_NETEASE_API_BASE_URL`；为空则 netease 能力禁用、回退 demo）
- Create: `src/lib/netease/types.ts`（API 响应类型：搜索/歌单/歌曲详情/播放 URL）
- Create: `src/lib/netease/client.ts`（`NeteaseClient`：`searchTracks(q)` / `getPlaylist(id)` / `getPlaylistTracks(id)` / `getTrackDetail(id)` / `getPlaybackUrl(id)`；统一 fetch + 超时（~8s）+ 错误归一 + 缓存）
- Create: `src/lib/netease/normalize.ts`（API 响应 → 应用模型 `CompilationTrack`/`NeteaseTrackMeta`）
- Create: `src/lib/netease/playlist.ts`（公开歌单链接/ID 解析：`https://music.163.com/playlist?id=X`、`#/playlist?id=X`、纯数字 ID）
- Create: `src/lib/netease/playback.ts`（`getPlaybackUrl` 内存短缓存；过期允许一次重试）
- Modify: `src/lib/music/netease-provider.ts`（真实实现，接 NeteaseClient；无 `providerTrackId` 返回 null）
- Create: `.env.example`（`NEXT_PUBLIC_NETEASE_API_BASE_URL=...`，注释说明需公共 CORS 实例）

**Interfaces:**
- Consumes: `src/types/compilation.ts`（`CompilationTrack`）；`MusicProvider` 接口。
- Produces: `NeteaseClient`；真实 `NeteaseProvider`（`search`/`resolve`/`getPlayableSource`）。缓存策略：搜索 10–30min、歌单 1–6h、曲目详情 24h（内存/IndexedDB 均可）；播放 URL **仅内存短缓存，绝不持久化**（有时效）。

- [ ] **Step 1: `config.ts` + `types.ts`**

`NEXT_PUBLIC_NETEASE_API_BASE_URL` 为空 → `isNeteaseAvailable()` 返回 false，`NeteaseProvider` 退化为空实现（不报错）。类型对齐所选 API 的真实响应字段（`result.songs[]`、`playlist.tracks[]`、`data[0].url` 等）。

- [ ] **Step 2: `client.ts`——统一请求层**

`request<T>(path, params)`：`fetch(base + path + qs)`；`AbortController` 超时；非 2xx / 网络错误 / CORS 错误统一归一为 `NeteaseError { kind: "timeout"|"network"|"api"|"http" , message }`；按 `(path+params)` 查缓存、写入缓存（带 TTL）。

- [ ] **Step 3: `normalize.ts` + `playlist.ts` + `playback.ts`**

`normalizeTrack(raw)` → `{ providerTrackId, title, artist, album, artworkUrl, durationMs }`。`parsePlaylistInput(input)` 从链接/`#/`/裸 ID 提取数字 id。`getPlaybackUrl(id)`：调 `/song/url/v1?id=`；`data[0].url` 空/`null` → 受限返回 null；URL 过期（播放器 404）时允许重取一次。

- [ ] **Step 4: `netease-provider.ts` 真实实现**

`search(q)` → `client.searchTracks(q)` → 归一列表；`resolve(input)` → 解析为歌单或曲目元数据（歌单链接 → 歌单名 + 曲目列表，供批量添加）；`getPlayableSource(track)` → 有 `providerTrackId` 才 `getPlaybackUrl`，无则 null。

- [ ] **Step 5: 验证**

`pnpm lint && pnpm build`。`NEXT_PUBLIC_NETEASE_API_BASE_URL` 配置有效实例时：搜索/歌单拉取/播放 URL 正常返回；未配置时应用照常运行（demo 回退）；网络断开时错误归一正确、不抛未捕获异常。

- [ ] **Step 6: Commit**

```bash
git add src/lib/netease src/lib/music/netease-provider.ts .env.example && git commit -m "feat: pure-frontend netease client library"
```

---

## Task 19: 网易云添加 UI（NeteasePicker：公开歌单导入 + 搜索）

> 前端 UI 设计**必须先经用户确认**再实现。

**Files:**
- Create: `src/components/editor/NeteasePicker.tsx`（公开歌单导入 Tab + 搜索 Tab，多选 → 添加）
- Modify: `src/components/editor/TrackEditor.tsx`（「从网易云添加」入口按钮）
- Modify: `src/components/shell/MobileEditorSheet.tsx`（移动端复用同一 picker，无需重写）

**Interfaces:**
- Consumes: `NeteaseClient`（T18）；store `addTrack`。
- Produces: 输入公开歌单链接/ID → 预览歌单（封面/名称/曲目列表）；搜索关键词 → 结果列表（封面/歌名/艺术家/时长）；多选 → `addTrack` 批量添加（去重：已存在同 `providerTrackId` 的行标记「已添加」）；受限/加载/空/API 错误状态展示。

- [ ] **Step 1: 交互与状态设计确认**（先向用户展示 ASCII 布局 + 交互流，确认后再实现）
- [ ] **Step 2: `NeteasePicker.tsx` 实现**

两个入口：① 歌单导入——输入框 + 「解析」→ `parsePlaylistInput` → `getPlaylist`/`getPlaylistTracks` → 列表；② 搜索——关键词 → `searchTracks`。列表行：封面缩略 + 歌名/艺术家 + 时长 + 勾选；底部「添加所选」按钮（禁用当无勾选）。`NeteaseClient` 不可用（未配置 base URL）时显示说明文字而非报错。
- [ ] **Step 3: TrackEditor 入口**

TrackEditor 加「从网易云添加」按钮 → 打开 NeteasePicker（桌面 Inspector 内联展开或弹层；移动端在 Bottom Sheet 内）。
- [ ] **Step 4: 验证**

`pnpm lint && pnpm build`。配置 API 后：歌单链接导入成功、搜索命中、批量添加去重、刷新保留（持久化 `providerTrackId`/元数据）；API 不可用时优雅降级。
- [ ] **Step 5: Commit**

```bash
git add src/components/editor/NeteasePicker.tsx src/components/editor/TrackEditor.tsx && git commit -m "feat: netease add UI with playlist import and search"
```

---

## Task 20: 网易云播放 + 受限/离线状态

**Files:**
- Modify: `src/hooks/use-player-engine.ts`（NetEase 播放：点击 → 读 `providerTrackId` → 请求最新播放 URL → 设 src → play；URL 过期一次重试；受限 → 禁用 + 提示）
- Modify: `src/components/player/Player.tsx`、`src/components/editor/TrackEditor.tsx`（受限/加载/离线状态显示；「在网易云打开」fallback）
- Modify: `src/components/shell/AppShell.tsx`（`online`/`offline` 监听 → 离线态显示）

**Interfaces:**
- Consumes: `NeteaseProvider`/`getPlaybackUrl`（T18）、播放引擎（T11）、store。
- Produces: 网易云曲目可真实播放；VIP/版权/区域受限显示「暂时无法播放/受限」；错误处理不崩溃、不无限重试、不 toast 轰炸；离线显示提示。

- [ ] **Step 1: 引擎受限与重试**

`play()`：`getPlayableSource` 返回 null → 显示受限（`player.limitedTrackId` 或 per-track 状态）并 `setIsPlaying(false)`；`<audio>` error 事件 → 若是网易云 URL 且未重试过 → 重取一次播放 URL；仍失败 → 停止 + 提示。**不自动连播受限曲目**。

- [ ] **Step 2: 错误与状态 UI**

播放器当前曲目：受限 → 「受限 · 在网易云打开」（`https://music.163.com/song?id=<id>` 新窗口）；TrackEditor 受限行右侧小字「受限」。离线（`navigator.onLine=false`）：网易云行显示「离线」，本地 demo/已缓存仍可播。

- [ ] **Step 3: 验证**

`pnpm lint && pnpm build`。配置 API 后：公开曲目可播（进度/唱片联动）；受限曲目播放禁用 + 提示；断网时网易云曲目不可播但 demo 正常；连点不崩、无重复 toast。
- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-player-engine.ts src/components/player src/components/editor/TrackEditor.tsx src/components/shell && git commit -m "feat: netease playback with restricted and offline states"
```

---

## Task 21: 验收检查 + 部署准备

**Files:**
- 不新增代码；全量检查 + `README.md` 更新。

**Interfaces:**
- Consumes: 全部。

- [ ] **Step 1: 全量验收（spec §十二 + 新需求）**

`pnpm dev` 下逐项：1440×900 与 390×844 双端、浅/深主题、上传裁剪滤镜、刷新恢复（IndexedDB 图片 + 项目）、多项目创建/切换/重命名/删除、备份导出（json/zip）→ 删除 → 导入恢复、离线编辑/查看、音频播放（demo + 网易云公开曲目）、受限提示、CD 拖动、无图占位、`prefers-reduced-motion`、Console 无持续报错、双端无横向溢出、4 种侧标、正/背/盘面实时映射。

- [ ] **Step 2: 构建与 lint**

Run: `pnpm lint`（Expected: 通过）与 `pnpm build`（Expected: 成功，无 TS 错误）。

- [ ] **Step 3: 已知限制记录**

写 `README.md`：网易云为纯前端公开内容接入（`NEXT_PUBLIC_NETEASE_API_BASE_URL` 需公共 CORS 实例；无登录/私人歌单/红心；播放 URL 有时效不持久化）；Demo 音频为合成旋律（非真实版权音乐）；导出为 2D 宣传图；数据存本机 IndexedDB（跨设备靠备份导出/导入）；无注册/云存储/云同步。

- [ ] **Step 4: 部署（可选，需用户授权）**

`npx vercel` 关联并部署；或先 `git init` + push 到远程后由 Vercel 拉取。部署需用户交互授权，放到最后与用户确认。部署环境需配置 `NEXT_PUBLIC_NETEASE_API_BASE_URL`。

- [ ] **Step 5: 收尾汇报**

完成功能、主要文件、依赖、网易云处理、已知限制、测试结果。

---

## Self-Review 备注

- **执行顺序（2026-08-06 重新划分）**：T12-T14 = 批 A 前段（导出/移动端/动效收尾）；T15-T17 = 存储与数据层（IndexedDB 迁移 → 多项目 → 备份），承接 `createyourcollection.md` §二.7/§二.8/§四 新结构；T18-T20 = 纯前端网易云（库 → 添加 UI → 播放/受限/离线）；T21 = 验收 + 部署。
- **纯前端边界**：无任何 Route Handler / Server Actions / 数据库 / 代理 / 登录 / Cookie；网易云 cookie 绝不存在于前端；播放 URL 仅内存短缓存、不持久化。VIP/版权受限返回空 URL → 禁用播放并显示「受限」，不开解灰。
- **设计确认要求（用户硬性）**：T19（网易云添加 UI）必须先向用户展示 ASCII 设计并确认再实现；其余纯功能/数据层任务（T15-T18）不需要。
- cd-showcase-3d skill 不直接复用其单文件 HTML/MiniMax 环境，仅提炼交互模式与踩坑清单（§十一 兜底条款）。
- `frameloop="demand"`、`dpr={[1,1.5]}`、Object URL 释放、纹理 dispose、高频角度走 ref——已在 Task 7/8 落实 §九。
- 播放不自动播放、无源即静默跳过/受限提示（无假按钮）——Task 11/20。
