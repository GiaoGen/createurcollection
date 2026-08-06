# CLAUDE.md — 项目上下文与工程规范

> 权威需求文档：`createyourcollection.md`（音乐精选集创作网站，三小时开发挑战）。
> 冲突时以 `createyourcollection.md` 为准；本文件沉淀日常开发必须遵守的上下文规范、代码规范与设计 token。

## 项目是什么

以**视觉设计与交互动效为核心**的音乐精选集（Compilation Album / Mix CD）创作网站。用户创建一张 CD 精选集，自定义正背面封面、盘面、侧标、曲目，实时查看 3D CD 盒预览并播放曲目。重点不是后台，而是：完成度高的前端视觉、丝滑克制的动效、真实可用的封面编辑器、有质感的 CD 展示。目标：完整可运行、可演示、可部署，**用户创建的精选集长期缓存本地**。

### 产品边界
- **做**：精选集信息编辑、正/背/盘面图片上传+裁剪+缩放+旋转+滤镜、4 种侧标、CD 盒 3D 展示、曲目增删改排序、极简播放器、**IndexedDB 长期持久化**、**本地多项目管理**、**PNG 导出 + JSON/ZIP 备份**、网易云**扫码登录 + 用户歌单/我喜欢的音乐/搜索添加 + 网页播放**。
- **不做**：任何自有后端（Route Handler/数据库/Supabase/代理/服务端存储）、注册登录、网易云账号登录（除**第三方 API 扫码登录**外的手机号/密码/短信方式）、自建账号系统、会员解灰、云数据库、评论点赞、作品广场、多用户协作、AI 生成封面、歌词同步、频谱分析、复杂 WebGL 后处理。**不做任何无法工作的假按钮。**

## 技术栈（已安装，勿降级）

| 类别 | 依赖 | 版本 |
|---|---|---|
| 框架 | next / react / react-dom | 16.3.0 / 19.2.8 |
| 语言 | typescript | 5.9.3 |
| 样式 | tailwindcss + @tailwindcss/postcss | 4.x |
| 状态 | zustand | 5.0.14 |
| DOM 动效 | motion | 12.x |
| 3D | three / @react-three/fiber / @react-three/drei | 0.185 / 9.x / 10.x |
| 图片裁剪 | react-easy-crop | 6.x |
| 导出 | html-to-image | 1.x |
| 存储（IndexedDB） | dexie | 4.x |
| 图标 | lucide-react | 1.x |
| 包管理 | pnpm | 11.x |

React 19 → R3F 9（勿混用 R3F 8）。Tailwind 4 用 CSS-first 配置，无 `tailwind.config.js`。

**Next.js 16 有破坏性变更**：写任何代码前先查 `node_modules/next/dist/docs/`（见 `AGENTS.md`），API/约定可能与训练数据不同。

## 运行命令

```bash
pnpm dev      # 本地开发
pnpm build    # 生产构建（验收前必须通过）
pnpm lint     # ESLint（验收前必须通过）
```

## 代码规范

- **TypeScript**：`strict` 已开；禁止大面积 `any`；类型集中在 `src/types/compilation.ts`。
- **状态管理**：编辑器状态用 Zustand，`persist` 中间件写 `localStorage`。Store 拆分：Project / Editor / Player / 3D presentation 四个 slice。
- **音乐 Provider 抽象**：必须走 `lib/music/provider.ts` 的 `MusicProvider` 接口。`DemoMusicProvider` 离线回退（合成 WAV，无外部服务也能完整演示）；`NeteaseProvider` 为纯前端实现——浏览器直接调第三方网易云 API（Base URL 由 `NEXT_PUBLIC_NETEASE_API_BASE_URL` 配置，统一走 `lib/netease/` 客户端）：**第三方 API 扫码登录**（`/login/qr/*` 轮询拿 Cookie，仅存用户浏览器——默认 sessionStorage，勾选「记住登录」才写 IndexedDB，**绝不写入 localStorage/URL/Console/错误日志/导出文件**）、用户歌单/我喜欢的音乐/搜索、曲目信息/封面、`/song/url/v1` 网页播放。**无任何自有后端、无代理、不自建登录系统、不持久化播放 URL**；播放 URL 现取现播、过期一次重试；VIP/版权受限返回空 URL → 播放禁用并显示「受限」+ 自动切下一首，不做绕过、不开解灰；Cookie 失效 → 提示重新登录，**不删除已导入歌曲**。需求变更记录：`createyourcollection.md` §三。
- **图片资源生命周期**：上传图片校验类型、限制大小，压缩为 WebP/JPEG（最长边 ≤1600–2048px）后以 Blob 存入 IndexedDB；展示用 Object URL 并在卸载/更换时 revoke；纹理更新后 `dispose` 旧纹理。
- **存储**：项目数据（含图片 Blob）以 IndexedDB 为主存储（Dexie），申请 `navigator.storage.persist()` 长期缓存；localStorage 只存偏好（当前项目 ID/主题/上次编辑模式）。自动保存防抖 500–1000ms；第三方 API 不可用不影响本地编辑。
- **高频动画状态**：pointermove / 拖拽旋转等不用 React setState；用 Motion Value / ref / `useFrame`。
- **按钮必须真实可用**：不允许装饰性假按钮。

## 前端视觉规范（从 §五 提取）

关键词：Editorial、Gallery、Industrial、Minimal、Precise、Cold、High contrast。

**禁止**：暖黄色背景、米黄渐变、紫蓝发光渐变球、大面积玻璃卡片、多层圆角容器嵌套、每块内容都套 Card、夸张阴影、无意义装饰标签、大量胶囊按钮、SaaS Dashboard 风、通用 AI Landing 风。

### 设计 Token

```css
/* 浅色 */
--background: #f5f5f3;  --surface: #ffffff;
--foreground: #0a0a0a;  --muted: #737373;
--line: rgba(0,0,0,0.12);  --strong-line: rgba(0,0,0,0.28);

/* 深色 */
--background: #080808;  --surface: #111111;
--foreground: #f4f4f4;  --muted: #8a8a8a;
--line: rgba(255,255,255,0.14);  --strong-line: rgba(255,255,255,0.28);
```

- 浅色背景必须是中性/冷白，**不用奶油黄**。
- 深色主题不是"纯黑卡片叠纯黑背景"，用细线/透明度/字号层级/封面色彩建立层次。
- **圆角**：控件 8–12px；Bottom Sheet 顶部 20–24px；播放器允许胶囊；主编辑区不套大圆角 Card；3D 舞台无卡片边框。
- **边界**：优先 1px 分隔线 + 留白 + 字体层级 + 半透明覆盖层；不靠容器嵌套区分模块。
- **字体**：仅 Geist Sans（界面）+ Geist Mono（曲目编号/年份/目录编号），勿混用更多字体。

### 布局
- 桌面三段式：左 Project Rail（64–80px，仅图标+Tooltip）、中 CD Stage（视觉中心）、右 Inspector（320–380px，贴边+左边线分隔，不用悬浮 Card）、底部 Player（68–80px 单层）。
- 移动端：顶部精简、全屏 Stage、底部固定 Player，编辑入口开 Bottom Sheet；**不做桌面版等比缩小**，移动优先。

### 侧标（至少 4 种）
Catalog（窄字体等宽编号）、OBI Strip（日版侧标，白/黑/封面单色，不用默认黄）、Vertical Type（纵向排版）、Transparent Label（半透明贴纸）。

## 动效规范（从 §八 提取）

服务空间关系；不做：所有元素同时浮动、无限弹跳、过度鼠标跟随、逐字出现、大面积模糊入场、无意义加载动画。

### 统一曲线
```ts
// 普通反馈
{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }
// 面板切换
{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }
// 物理移动
{ type: "spring", stiffness: 260, damping: 28, mass: 0.8 }
// CD 盒开合
{ type: "spring", stiffness: 110, damping: 22, mass: 1.1 }
```

### 关键动效要点
- **模式切换**（Front/Back/Disc）：模型旋转与 Inspector 淡出淡入交叉进行，不串行等待。
- **播放/暂停**：唱片旋转与减速要平滑，不突然启停；当前曲目编号有细小波形；封面仅轻微呼吸。
- **主题切换**：CSS Variables 过渡，3D 灯光颜色/环境强度一起变，不用整页白闪。
- **移动端 Sheet**：底部进入，舞台轻微上移缩小，背景少量暗化，拖动关闭跟手。

## 性能要求

- 3D Canvas：`frameloop="demand"`，静止即停；`dpr={[1, 1.5]}`。
- 移动端降级：关实时阴影/高采样反射/后处理/高分辨率 env map。
- DOM 动画只动 `transform`/`opacity`，避免高频改 width/height/blur/box-shadow。
- 必须支持 `@media (prefers-reduced-motion: reduce)`：关闭自动旋转/视差/弹簧/惯性。

## 目录结构（§十 约定）

```
src/
├─ app/                  # layout.tsx / page.tsx / globals.css
├─ components/
│  ├─ shell/             # AppShell / ProjectRail / MobileHeader / MobileEditorSheet
│  ├─ stage/             # CDStage / CDCase / Disc / StageLights / StageFallback
│  ├─ editor/            # Inspector / InfoEditor / ArtworkEditor / FilterSelector / SpineEditor / TrackEditor / NeteasePicker
│  ├─ player/            # Player / Progress / PlayingIndicator
│  ├─ projects/          # ProjectManager（列表/新建/重命名/删除/备份）
│  └─ export/            # ExportCard
├─ lib/
│  ├─ image/             # crop / filters / resize / blobs
│  ├─ music/             # types / provider / demo-provider / netease-provider
│  ├─ netease/           # client / auth / types / normalize / playlist / playback
│  ├─ backup.ts          # .album.json / ZIP 备份导出导入
│  ├─ export-image.ts
│  └─ storage.ts
├─ store/
│  ├─ db.ts              # Dexie 数据库定义
│  ├─ use-projects-store.ts
│  └─ use-compilation-store.ts
├─ data/demo-project.ts
└─ types/compilation.ts
```

3D 展示：`.claude/skills/cd-showcase-3d/`（从 RedSkill 安装 v1.0.0）可作为**参考蓝本**——提取其三段点击交互（转正面→居中停靠→开盖抽碟）、贴图工厂、弹簧+边界钳制、9 条踩坑记录。注意两点现实：其 SKILL.md 步骤 0 要求 MiniMax 环境（本项目在 Claude Code 中执行，忽略该门槛）；其产物是单文件 HTML+CDN Three.js（10 碟 CD 墙），与 Next.js + R3F 架构不匹配，需改编为 R3F 单碟 CD 盒。若 20 分钟内无法接入，立即用 CSS 3D 制作降级 CD 盒，不让 Three.js 阻塞整个项目。

## 验收标准（§十二 摘要）

功能：信息编辑、三类图片上传+裁剪+滤镜、3D 实时显示、曲目增删改排序、至少 1 首 demo 可播、刷新恢复、双主题、双端无横向溢出。视觉：无暖黄/紫蓝光球/多层 Card/胶囊堆叠，CD 舞台是视觉中心，深浅色非简单反转，≥4 种侧标。动效：模式切换无跳变、面板退出有动画、CD 开合自然、唱片不突然启停、移动端拖拽不严重冲突滚动、低性能设备有降级。工程：无大面积 `any`、Provider 抽象、图片 Blob 入 IndexedDB + Object URL 正确释放、无任何自有后端/服务端代理/自建登录系统、网易云 Cookie 仅存浏览器 sessionStorage（勾选记住登录才写 IndexedDB）且不写 localStorage/URL/错误日志/导出文件、不持久化播放 URL、无假按钮、build 与 lint 通过、无持续 Console Error。

## 视觉优先级（冲突时）

1. 交互可用 → 2. 动效连贯 → 3. 性能 → 4. 响应式 → 5. 视觉装饰
