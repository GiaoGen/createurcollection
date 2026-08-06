# Create Your Collection

以**视觉设计与交互动效为核心**的音乐精选集（Compilation Album / Mix CD）创作网站。

用户可以创建一张属于自己的 CD 精选集：自定义正背面封面、盘面、侧标、曲目列表，实时查看 3D CD 盒预览，并直接在页面内播放曲目。所有创作数据（含图片 Blob）长期缓存于本机浏览器（IndexedDB），无需注册、无需后端。

## 功能一览

- **精选集信息编辑**：名称、副标题、创作者、年份、简介、侧标类型。
- **三类图片素材**：正面封面 / 背面封面 / CD 盘面，支持上传 → 裁剪 → 缩放 → 旋转 → 12 种像素滤镜。
- **3D CD 盒预览**：实时反映封面与曲目状态，支持正面 / 背面 / 盘面模式切换，CD 开合与唱片旋转动效。
- **曲目列表**：增删改、拖拽排序；Demo 曲目开箱即播（合成旋律）。
- **极简播放器**：单例 `<audio>` 引擎，进度 / 上一首 / 播放暂停 / 下一首，当前曲目波形指示。
- **网易云接入**（可选）：扫码登录 → 导入用户歌单 / 我喜欢的音乐 / 搜索添加 → 网页播放。
- **本地持久化**：IndexedDB 长期缓存 + `navigator.storage.persist()` 申请持久存储；页面刷新后项目完整恢复。
- **本地多项目管理**：创建 / 列表 / 打开 / 重命名 / 删除，自动保存防抖。
- **备份与导出**：`.album.json` / ZIP 备份导出与导入恢复；PNG 2D 宣传图导出。
- **双主题**：浅色（中性冷白）与深色（细线分层），CSS Variables 过渡。
- **双端适配**：桌面三段式布局 + 移动端全屏 Stage + 底部 Sheet 编辑。

## 技术栈

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
| 压缩 / 备份 | jszip | 3.x |
| 二维码 | qrcode | 1.x |
| 图标 | lucide-react | 1.x |
| 包管理 | pnpm | 11.x |

React 19 → R3F 9（勿混用 R3F 8）；Tailwind 4 使用 CSS-first 配置，无 `tailwind.config.js`。

## 本地运行

```bash
pnpm install
pnpm dev      # 开发服务器 → http://localhost:3000
pnpm build    # 生产构建（验收前必须通过）
pnpm lint     # ESLint（验收前必须通过）
```

不配置任何环境变量即可完整运行：网易云入口自动隐藏，音乐播放回退为 Demo 合成旋律。

## 网易云音乐接入（可选）

本功能为**纯前端**接入：浏览器直接调用第三方网易云 API，项目**无自有后端、无服务端代理、不自建登录系统**。

### 配置 API 地址

复制仓库根目录的 `.env.example` 为 `.env.local`（或直接在部署平台配置环境变量），并填入公共实例地址：

```env
NEXT_PUBLIC_NETEASE_API_BASE_URL=https://example-api.com
```

该地址需指向一个**公开可用且开启 CORS** 的第三方网易云 API 实例。配置后保存设置，网易云入口才会在「从网易云添加」中显示。

### 安全说明

> **本功能通过第三方网易云音乐接口实现。登录凭证仅保存在当前浏览器中。请仅在你信任的 API 服务上使用扫码登录。**

- 使用第三方 API 的**扫码登录**，**并非网易云官方授权登录**。
- 登录 Cookie 默认存于当前标签页 `sessionStorage`；仅当你主动勾选「记住登录」时才写入 IndexedDB。
- **绝不写入** localStorage / URL / Console / 错误日志 / 导出文件。
- 播放地址（`/song/url/v1`，失败回退 `/song/url`）现取现播，仅在内存中短缓存（≤5 分钟），**不持久化**。
- VIP / 版权受限歌曲：保留在曲目列表并标记「受限」，自动切下一首，提供「在网易云打开」，不做绕过、不开解灰。
- Cookie 失效会提示重新登录，**不会删除已导入的歌曲**。

## 已知限制

- 网易云部分公开接口行为依赖第三方实例，播放地址有时效，不持久化；受网络 / 第三方实例可用性影响。
- Demo 音频为**合成旋律**（离线生成的 WAV），非真实版权音乐。
- PNG 导出为**2D 宣传图**，非真实 3D 模型或实物照片。
- 数据存于**本机 IndexedDB**；跨设备迁移请使用备份导出 / 导入（`.album.json` / ZIP）。
- 无注册、无云存储、无云同步、无社区功能。

## 部署（Vercel）

1. 将仓库推送到 Git 平台（GitHub / GitLab 等），在 [Vercel](https://vercel.com) 中导入该项目。
2. 框架预设自动识别为 Next.js（`pnpm install` / `pnpm build` 由 Vercel 自动执行）。
3. 在 Vercel 项目 **Settings → Environment Variables** 中配置 `NEXT_PUBLIC_NETEASE_API_BASE_URL`（指向公开 CORS 网易云 API 实例）。
4. 部署后访问线上地址；如需扫码登录，请确保线上 API 实例可用且支持跨域。

> 部署需要你的授权与账号操作，本仓库不包含任何部署产物或平台绑定配置。

## 目录结构（核心）

```
src/
├─ app/                  # layout.tsx / page.tsx / globals.css（主题 token）
├─ components/
│  ├─ shell/             # AppShell / ProjectRail / MobileHeader / MobileEditorSheet
│  ├─ stage/             # CDStage / CDCase / Disc / StageLights / StageFallback（R3F 3D 舞台）
│  ├─ editor/            # Inspector / InfoEditor / ArtworkEditor / FilterSelector / SpineEditor / TrackEditor / NeteasePicker
│  ├─ player/            # Player / Progress / PlayingIndicator
│  ├─ projects/          # ProjectManager（本地多项目）
│  └─ export/            # ExportCard / BackupActions
├─ lib/
│  ├─ image/             # crop / filters / resize / blobs（图片生命周期）
│  ├─ music/             # provider 抽象 / demo-provider / netease-provider / synthesize
│  ├─ netease/           # client / auth / types / normalize / playlist / playback（纯前端客户端）
│  ├─ backup.ts          # .album.json / ZIP 备份
│  ├─ export-image.ts / export-bake.ts
│  └─ storage.ts
├─ store/                # Dexie db / use-projects-store / use-compilation-store / use-netease-store
├─ data/demo-project.ts  # 默认演示精选集
└─ types/compilation.ts  # 类型中心
```

## License

Private project for the "Create Your Collection" development challenge.
