# HANDOVER — 交接文档（给下一个 Claude Code 窗口）

> 生成：2026-08-07 · 项目：Create Your Collection（音乐精选集创作网站）
> 用途：新会话接手时先读本文件恢复上下文。顶部「开场 prompt」可直接粘贴为新会话的第一条消息。

---

## 开场 prompt（可直接粘贴到新会话）

```
接续「Create Your Collection」（音乐精选集创作网站）项目。工作目录 D:\Create your collection，
分支 main（已合并完成，HEAD 4d01fc2，工作树干净），远程 origin = https://github.com/GiaoGen/createurcollection。
项目是纯前端 Next.js 16 应用：封面编辑 + 3D CD 盒 + 曲目播放 + IndexedDB 持久化 + 网易云纯前端接入。
全部 21 个开发任务已完成并通过 SDD 逐任务评审，PR #1 已合并（41 个功能提交保留在 main 历史中）。

先读以下文件再动手：
1. HANDOVER.md（本文件——状态/待办/坑）
2. README.md（功能、运行、网易云接入与安全说明）
3. CLAUDE.md（工程规范、设计 token、安全约束——不可违反）
4. .superpowers/sdd/progress.md（21 任务台账 + 终审 + 合并记录）

未完成、需人工裁量的事项：
- 部署 Vercel（需用户授权登录 + 配置 NEXT_PUBLIC_NETEASE_API_BASE_URL；README「部署」一节已写步骤）
- B 轨人工目检 12 项（.superpowers/sdd/task-21-report.md 每项有操作指引；含真机网易云扫码全流程）
- 若干 deferred minor（见本文件「七、待办」）

安全约束必须逐字遵守（本文件「六、安全」），尤其：Cookie 只存 sessionStorage（勾选「记住登录」才写
IndexedDB），绝不写 localStorage/URL/Console/日志/导出文件；播放 URL 现取现播不持久化；VIP/版权受限
自动切下一首、不做绕过；无任何自有后端/代理/自建登录系统。改动代码后用 pnpm lint && pnpm build 验证。
```

---

## 一、项目是什么

以**视觉设计与交互动效为核心**的音乐精选集（Mix CD）创作网站。用户创建一张 CD 精选集：自定义正背面封面、盘面、侧标、曲目，实时查看 3D CD 盒预览并播放曲目。无自有后端、无注册登录，数据长期缓存本机 IndexedDB。

**产品边界（做 / 不做）**：做 = 信息编辑、三图上传+裁剪+缩放+旋转+12 滤镜、4 种侧标、3D CD 盒、曲目增删改排序、极简播放器、IndexedDB 持久化、本地多项目、PNG 导出 + JSON/ZIP 备份、网易云扫码登录+歌单/红心/搜索添加+网页播放。不做 = 任何自有后端、自建账号、会员解灰、云同步、AI 封面、歌词、任何无法工作的假按钮。

## 二、仓库与分支状态

- **HEAD**：`main` @ `4d01fc2`（`Merge pull request #1 from GiaoGen/feature/music-collection`）
- **历史**：PR #1 用 `--merge` 合入，**41 个功能提交完整保留**（未 squash），parent = `6b798ba` + `ea8966f`
- **远程**：`origin` = https://github.com/GiaoGen/createurcollection；PR #1 已合并，远程 feature 分支已删
- **本地**：仅 `main`；feature 分支随合并删除（历史在 main 中，无损失）
- **验证门禁**：无 test 套件；`pnpm lint`（0 error，5 条既有 warning）+ `pnpm build`（通过，TS 干净，2 静态路由 `/` + `/_not-found`）

## 三、技术栈（package.json 实装，勿降级）

| 类别 | 依赖 | 版本 |
|---|---|---|
| 框架 | next / react / react-dom | 16.3.0 / 19.2.8 |
| 语言 | typescript | 5.9.3 |
| 样式 | tailwindcss + @tailwindcss/postcss | 4.x（CSS-first，无 config 文件） |
| 状态 | zustand | 5.0.14 |
| DOM 动效 | motion | 12.x |
| 3D | three / @react-three/fiber / @react-three/drei | 0.185 / 9.x / 10.x |
| 图片裁剪 | react-easy-crop | 6.x |
| 导出 | html-to-image | 1.x |
| 存储（IndexedDB） | dexie | 4.x |
| 压缩/备份/二维码 | jszip / qrcode / lucide-react | 3.x / 1.x / 1.x |
| 包管理 | pnpm | 11.x |

React 19 → R3F 9（勿混用 R3F 8）。**Next.js 16 有破坏性变更**：写任何代码前先查 `node_modules/next/dist/docs/`。

## 四、架构地图（关键文件）

```
src/
├─ app/                  # layout.tsx / page.tsx（唯一路由 /）/ globals.css（双主题 token + reduced-motion）
├─ components/
│  ├─ shell/             # AppShell（在线/离线监听）/ ProjectRail / MobileHeader / MobileEditorSheet
│  ├─ stage/             # CDStage（frameloop=demand, dpr[1,1.5]）/ CDCase / Disc / StageLights / StageFallback / lib.ts
│  ├─ editor/            # Inspector / InfoEditor / ArtworkEditor / FilterSelector / SpineEditor / TrackEditor / NeteasePicker(989行) / panels.tsx
│  ├─ player/            # Player / Progress / PlayingIndicator
│  ├─ projects/          # ProjectManager（列表/新建/重命名/删除/备份按钮）
│  └─ export/            # ExportCard / BackupActions
├─ hooks/use-player-engine.ts   # 单例 <audio> 引擎 + playToken 竞态守卫 + 受限/离线/重试
├─ lib/
│  ├─ image/             # crop / art-filters(12滤镜) / blobs（压缩 WebP/JPEG + Blob↔IndexedDB + Object URL 生命周期）
│  ├─ music/             # provider.ts（dispatcher 按 track.provider 路由）/ demo-provider / netease-provider / synthesize / types.ts
│  ├─ netease/           # client / auth（cookie 安全）/ types / normalize / playlist / playback（内存≤5min 缓存）
│  ├─ backup.ts / export-image.ts / export-bake.ts / storage.ts / use-is-desktop.ts
├─ store/                # db.ts（Dexie cyc-db v3：projects/storedImages/sessions）/ use-compilation-store / use-projects-store / use-netease-store
├─ data/demo-project.ts  # 默认演示精选集
└─ types/compilation.ts  # 类型中心
```

## 五、核心机制（改前必读）

- **MusicProvider 抽象**：引擎唯一入口 `getMusicProvider()`。`provider.ts` 的 dispatcher 按 `track.provider === "netease"` 路由到 `NeteaseProvider`，否则 `DemoMusicProvider`（合成 WAV，离线可用）。任何新音乐源必须走此接口，禁止组件直连第三方 API。
- **PlaybackRefusal 判别联合**（`lib/music/types.ts`）：`{ kind: "auth-required" | "restricted" | "unavailable", reason }`。引擎对 restricted/unavailable **自动切下一首**并设行级 `denied`；auth-required/离线 **不切歌**只提示。判别用 `source.kind === "audio"`。
- **playToken 竞态守卫**（use-player-engine.ts）：每次 play 递增 token，每个 await 后复查，stopPlayback 也 bump token——**这是 T11/T16 多次修复的核心，绝不可移除**。
- **单例 `<audio>`**：模块级单例，加载中事件（loadstart/waiting/stalled→loading；canplay/playing→clear）；URL 过期重试**一次**（`retriedForId` 模块变量，新 play 重置；`clearPlaybackCache` 用于清播放缓存）。
- **IndexedDB**：`cyc-db` v3，表 projects（项目含图片 imageId 引用）、storedImages（Blob）、sessions（网易云记住登录的会话）。`navigator.storage.persist()` 申请长期缓存。localStorage **只存偏好**（当前项目/主题/上次编辑模式 + 网易云「记住登录」布尔），绝不存凭证。
- **自动保存**：防抖 500–1000ms 写 IndexedDB；`loadProject` 重置 player 为 initialPlayer（denied 清空）；顶层 `offline` 跨项目存活。
- **图片生命周期**：上传校验+压缩 WebP/JPEG（最长边 ≤1600–2048px）→ Blob 入 IndexedDB；Object URL 创建/释放成对；纹理更新后 dispose 旧纹理。

## 六、安全约束（逐字，不可违反）

> 安全横幅（README + NeteasePicker 固定展示）：**「本功能通过第三方网易云音乐接口实现。登录凭证仅保存在当前浏览器中。请仅在你信任的 API 服务上使用扫码登录。」**

1. **不保存**手机号/密码/短信验证码/二维码 Key/完整 API 请求日志。
2. **Cookie 绝不写入** localStorage / URL / Console / 错误日志 / 导出的精选集文件。
3. Cookie 只存浏览器：默认 `sessionStorage`；勾选「记住登录」才写 IndexedDB（`sessions` 表 / StoredNeteaseSession）。
4. **不实现**会员绕过、破解、解灰功能。
5. **不声称**这是网易云官方授权登录。
6. **不持久化播放 URL**：现取现播，内存缓存 ≤5min，过期重试一次。
7. VIP/版权受限 → 保留歌曲、标记「受限」、自动切下一首、提供「在网易云打开」，**不做绕过**。
8. Cookie 失效 → 提示重新登录，**不删除已导入歌曲**。
9. **无任何自有后端**：无 Route Handler / Server Actions / api 目录 / 数据库 / Supabase / 服务端代理 / 服务端 Session / 自建网易云 API 服务。
10. 登录状态失效判定：`kind === "api"` 且 `code===301` 或 message 含 `/需要登录|登录.{0,4}失效|登录状态已过期/`；其余 API 错误走重试，**不得误判为登录失效**。

## 七、待办 / 待用户裁量

| 事项 | 状态 | 说明 |
|---|---|---|
| 部署 Vercel | ⏳ 待用户授权 | 需用户 Vercel 登录 + 配置 `NEXT_PUBLIC_NETEASE_API_BASE_URL`；README「部署」已写步骤。**未执行**。 |
| B 轨人工目检 12 项 | ⏳ 待人工 | `task-21-report.md` 每项有操作指引；B8 网易云需真机扫码 + 公共 CORS API 实例。 |
| 语言栏修正 | ✅ 已完成 | `.gitattributes` 将 cd-showcase-3d 原型 HTML 标为 linguist-documentation；GitHub 重扫后 TS 应主导。 |

**Deferred minors（无害/纯性能/设计判断，用户已知晓）**：
- `loadSession` 额外一次 IndexedDB 读（纯性能）。
- `deleteNeteaseSession` 会清空所有已存会话（设计判断）。
- `verifyLogin` 网络错误与真登录失效未区分（T18 契约，窗口窄可重扫）。
- 孤儿 StoredImage 无定期清扫（数据卫生）。
- `NeteasePicker.tsx` 989 行单文件，可拆分（维护性）。
- 未配置 API 时网易云曲目返回 unavailable 自动跳过（按简报 spec）。
- 恢复在线后 error 文本残留到下次 play（无害）。

## 八、已知坑（踩过的教训）

- **Next 16 破坏性变更**：API/约定可能与训练数据不同——写代码前先查 `node_modules/next/dist/docs/`。
- **React Compiler 禁 render 中读 ref**（`react-hooks/refs`）：不要在渲染期间读 useRef；网易云 cookie 用 useState 放组件内存而非 ref。
- **R3F 9** 配 React 19；勿混用 R3F 8。3D Canvas 用 `frameloop="demand"` + `dpr={[1,1.5]}`。
- **Tailwind 4** 为 CSS-first 配置，无 `tailwind.config.js`。
- **语言统计**：`.claude/skills/cd-showcase-3d/assets/template.html`（522KB 单文件原型）会拖垮 GitHub 语言栏——已 `.gitattributes` 排除；不要再往仓库加大型单文件 HTML。
- **`useReducedMotion()` 是挂载快照，非实时订阅**；reduced 分支要放在 useFrame 最前。
- **网易云播放**：`/song/url/v1` 失败回退 `/song/url`；无 URL = restricted/unavailable，不要伪造可播地址。
- **重试路径 `el.play()`** 可能 reject（NotSupportedError），必须 `.catch(() => {})`，否则 Console Error。
- **dev 端口**：本地 `pnpm dev` 用 Turbopack，启动快；验收用 `pnpm build`（生产构建）+ `pnpm lint`。

## 九、验证方法

```bash
pnpm install     # 首次
pnpm lint        # 期望 0 errors（5 条既有 warning 非阻断）
pnpm build       # 期望通过、TS 干净、2 静态路由
pnpm dev         # → http://localhost:3000
```

手工验收清单（含操作指引）见 `.superpowers/sdd/task-21-report.md` 的 B 轨；本地跑通后做 B1–B12，网易云需配置环境变量 + 真机扫码。**注意**：`NEXT_PUBLIC_NETEASE_API_BASE_URL` 未配置时网易云入口自动隐藏、播放回退 Demo，这是预期行为。

## 十、给下一个窗口的建议

1. **下一步最有价值**：等用户决定是否部署 Vercel；或处理 deferred minors 中的可交付项。
2. **动手前**：任何涉及网易云/播放/存储的改动，先读 `lib/netease/auth.ts`、`client.ts`、`hooks/use-player-engine.ts` 的注释（内含大量设计决策与安全护栏）。
3. **验收纪律**：改动后必须 `pnpm lint && pnpm build` 通过；视觉/动效改动遵循 CLAUDE.md 设计 token 与动效曲线，且**需先与用户对齐效果**。
4. **别破坏**：playToken 守卫、cookie 安全架构、provider 抽象、Object URL 释放——都是多次评审与修复换来的。
