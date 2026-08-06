# 音乐精选集创作网站：三小时开发挑战计划书

## 一、项目定义

开发一个以视觉设计和交互动效为核心的音乐精选集创作网站。

用户可以创建自己的 Compilation Album / Mix CD，自定义：

* 精选集名称、作者、年份和说明
* CD 盒正面封面
* CD 盒背面封面
* 盒脊侧标
* CD 唱片盘面
* 曲目列表及排序
* 图片裁剪、缩放、旋转、位置和滤镜
* 浅色与深色主题
* 精选集的交互式 3D 预览
* 曲目播放与当前播放状态

网站必须同时适配桌面端和移动端。

本项目的重点不是复杂后台，而是：

1. 极具完成度的前端视觉
2. 丝滑、连贯而克制的动效
3. 有真实功能的封面编辑器
4. 具有质感的 CD 盒与唱片展示
5. 三小时内能够运行、演示和部署

---

# 二、三小时版本的产品边界

## 必须完成

### 1. 创建精选集

用户可以编辑：

* 精选集名称
* 副标题
* 创建者名称
* 年份
* 简介
* 侧标类型

所有内容实时反映在 CD 展示模型上。

### 2. 自定义视觉素材

支持分别上传：

* 正面封面
* 背面封面
* CD 盘面图片

每张图片支持：

* 拖动定位
* 缩放
* 旋转
* 重新裁剪
* 更换图片
* 恢复默认

图片裁剪可以使用 `react-easy-crop`，它提供现成的 React 图片裁剪与交互能力。

### 3. 图片滤镜

第一版提供以下预设：

* Original：原图
* Mono：黑白
* High Contrast：高对比
* Faded：褪色
* Cold Chrome：冷银色
* Deep Black：深黑
* Duotone：双色调
* Grain：胶片颗粒
* Soft Blur：柔焦
* Invert：反相实验效果

实现方式：

* 编辑预览阶段优先使用 CSS Filter
* 颗粒使用一层轻量 noise texture
* 导出时使用 Canvas 将滤镜烘焙进图片
* 不引入大型完整图片编辑器

### 4. CD 盒交互展示

优先复用现有 `cd-showcase-3d` skill，不从零重新制作模型。

需要实现以下状态：

* 正面展示
* 背面展示
* 侧面展示
* CD 盒打开
* CD 唱片滑出
* 唱片缓慢旋转
* 用户拖动旋转模型
* 封面与背面实时更新
* 深浅色环境光切换

桌面端允许轻微鼠标视差。

移动端通过单指拖动旋转，不依赖 hover。

### 5. 曲目列表

用户可以：

* 添加曲目
* 编辑歌曲名
* 编辑艺术家
* 删除曲目
* 拖动排序
* 点击播放
* 查看当前播放状态

至少内置 6 首演示曲目，保证项目无外部接口时也可以完整演示。

### 6. 播放器

页面底部提供极简播放器：

* 播放与暂停
* 上一首
* 下一首
* 当前曲名与艺术家
* 播放进度
* 曲目时长
* 可拖动进度条

播放器不自动播放。现代浏览器通常会阻止未经用户交互的有声媒体自动播放，因此首次播放必须由用户点击触发。

### 7. 本地保存

精选集状态保存到 `localStorage`，刷新页面后恢复。

三小时版本不做：

* 注册和登录
* 云端数据库
* 多用户协作
* 评论与点赞
* 公开作品广场
* 复杂权限系统
* 正式商业音乐版权接入

### 8. 导出

提供一个简洁的 Export 按钮，将当前 CD 正面展示导出为 PNG。

可以使用 `html-to-image` 将指定 DOM 节点转换为 PNG；该库通过 SVG、Canvas 等浏览器能力生成图像。

如果 3D Canvas 无法稳定直接导出，则使用专门的二维 ExportCard 组件生成宣传图，不要在导出功能上浪费大量时间。

---

# 三、网易云音乐接入方案（2026-08-06 更新）

## 现实情况

使用**非官方**网易云 API。原 `Binaryify/NeteaseCloudMusicApi` 已归档、npm 包下架；社区活跃继任者为 **`NeteaseCloudMusicApiEnhanced/api-enhanced`**（npm `@neteasecloudmusicapienhanced/api`，Node 22+，默认端口 3000，Docker 可用）。它是第三方逆向接口，非官方开放能力，接口可能随时变化/失效，必须接受这一风险。

本项目使用的功能边界：

* 用户通过**二维码登录**网易云账号（不收集密码）
* 读取用户**「我喜欢的音乐」**歌单（`playlist_mylike` / `user_playlist` + `playlist_track_all`）
* **搜索**歌曲（`cloudsearch`）
* 将歌曲**添加到自己创建的精选集**（保存 `neteaseId` 元数据）
* 通过 `/song/url/v1` 获取可播放地址，**直接网页播放**

## 架构

```
浏览器(Next.js 前端)
  │  HTTPS / 同源请求，只走我们自己的 API 路由
  ▼
Next.js Route Handlers  src/app/api/netease/[...path]/route.ts   ← 服务器端代理
  │  持有网易云 cookie（仅服务端 httpOnly cookie，不出现在前端 JS）
  ▼
自托管 NeteaseCloudMusicApiEnhanced 服务（独立部署：localhost / Docker，如 :3001）
  ▼
网易云音乐服务器
```

要点：

* 前端**不直接连** API 服务，全部经 Next.js route handler 代理；**网易云 cookie 绝不进 localStorage / 前端 JS**。
* 登录态用我们自己的 httpOnly cookie 维持，服务端按需带上网易云 cookie 转发请求。
* 音乐来源保持 Provider 抽象（`lib/music/provider.ts`）：`NeteaseProvider` 为主源，`DemoMusicProvider` 为离线回退（无 API 服务时网站仍可完整演示）。

## 登录流程（二维码）

1. `/api/netease/login/qr/key` → 获取 key
2. `/api/netease/login/qr/create?key=...&qrimg=true` → 返回二维码图片 + key
3. 前端展示二维码，轮询 `/api/netease/login/qr/check?key=...`：
   - 801 等待扫码 → 802 已扫码待确认 → 803 登录成功（服务端存 cookie）
   - 800 过期 → 重新生成二维码
4. 成功后进入「我的网易云」模式：可拉取我喜欢的音乐 / 搜索添加。

不实现：手机号密码登录（密码不上云）、短信验证码登录。

## 版权与限制（必须如实对待）

* 很多歌曲是 **VIP / 版权受限**：`/song/url/v1` 返回空或仅试听片段。此时**播放按钮禁用**并显示「VIP 受限 / 无版权」状态，不做绕过。
* API 自带 `ENABLE_GENERAL_UNBLOCK`（解灰）能力：**默认关闭**，是否开启由用户自行决定并自担风险；本项目功能不依赖它。
* 不做：批量抓取/下载、外链传播、Cookie 暴露到前端、假装官方接口。

## Provider 边界

`MusicProvider` 接口不变。`NeteaseProvider.getPlayableSource(track)` 调 `/api/netease/song/url/v1?id=<neteaseId>` 取播放 URL；返回 `null` 即视为受限，播放器进入禁用状态。

## 后续正式产品方案

音乐数据层保持 Provider 化，以便未来接入正式授权的音乐服务、用户自行上传音频、Apple Music MusicKit（官方 Web SDK，需开发者令牌及用户授权）等。

---

# 四、技术栈

## 核心框架

* Next.js App Router
* React
* TypeScript
* Tailwind CSS
* pnpm

使用最新版稳定 `create-next-app` 初始化，并启用：

* TypeScript
* Tailwind CSS
* ESLint
* App Router
* `src` 目录
* 路径别名

Next.js App Router 原生支持布局、路由、Server/Client Components 和 Suspense，适合作为后续扩展基础。

## 状态管理

使用 Zustand 管理编辑器状态：

```ts
type CompilationProject = {
  id: string
  title: string
  subtitle: string
  curator: string
  year: string
  description: string

  frontCover: ArtworkState
  backCover: ArtworkState
  discArtwork: ArtworkState

  spineStyle: SpineStyle
  theme: "light" | "dark"

  tracks: Track[]
  activeTrackId: string | null
}
```

Store 分为：

* Project state
* Editor state
* Player state
* 3D presentation state

使用 Zustand persist middleware 写入 localStorage。Zustand 提供基于 Hooks 的轻量状态管理，并支持持久化等中间件。

## 动效

### DOM 动画

使用 Motion：

* 面板进出
* 曲目排序
* 按钮反馈
* 主题切换
* 编辑器模式切换
* 共享元素转场
* 移动端 Bottom Sheet
* 播放状态动画

Motion 支持布局变化、退出动画和手势交互，适合完成连贯的 React 界面动画。

### 3D

使用：

* Three.js
* `@react-three/fiber`
* `@react-three/drei`
* 现有 `cd-showcase-3d` skill

React Three Fiber 应与当前 React 主版本匹配；R3F 9 面向 React 19。

### 图片处理

* `react-easy-crop`
* Canvas 2D API
* CSS Filter
* `html-to-image`

### 图标

使用 Lucide React。

每个页面最多出现少量必要图标，不创建密集工具栏。

### 字体

使用：

* Geist Sans：主要界面
* Geist Mono：曲目编号、年份、目录编号

不要混用大量字体。

---

# 五、前端视觉规范

## 整体风格

关键词：

* Editorial
* Gallery
* Industrial
* Optical disc
* Minimal
* Precise
* Cold
* High contrast

禁止出现：

* AI 常见暖黄色背景
* 米黄色大面积渐变
* 紫蓝发光渐变球
* 大量玻璃卡片
* 多层圆角容器嵌套
* 每个内容都套一个 Card
* 夸张阴影
* 无意义的装饰标签
* 大量胶囊按钮
* 常见 SaaS Dashboard 风格
* 通用 AI Landing Page 风格

## 浅色主题

```css
--background: #f5f5f3;
--surface: #ffffff;
--foreground: #0a0a0a;
--muted: #737373;
--line: rgba(0, 0, 0, 0.12);
--strong-line: rgba(0, 0, 0, 0.28);
```

背景必须偏中性白或冷白，不使用奶油黄。

## 深色主题

```css
--background: #080808;
--surface: #111111;
--foreground: #f4f4f4;
--muted: #8a8a8a;
--line: rgba(255, 255, 255, 0.14);
--strong-line: rgba(255, 255, 255, 0.28);
```

深色主题不是纯黑卡片叠纯黑背景，应通过：

* 细线
* 透明度
* 字号层级
* 局部材质
* 封面色彩

来建立层次。

Tailwind 可以通过自定义 `dark` variant 或 `data-theme` 管理主题。

## 圆角

* 普通控件：8–12px
* Bottom Sheet：顶部 20–24px
* 播放器：允许胶囊形式
* 主编辑区域：不套大圆角 Card
* 3D 舞台：不使用卡片边框

## 边界设计

优先使用：

* 1px 分隔线
* 留白
* 字体层级
* 半透明覆盖层
* 局部模糊

不要依靠一层层容器区分模块。

---

# 六、页面布局

## 桌面端

采用三段式编辑器，但不做传统 Dashboard。

### 左侧：Project Rail

宽度约 64–80px。

只放：

* Logo
* 新建
* 编辑模式
* 曲目模式
* 主题切换
* 导出

按钮使用图标，不增加大型文字标签。

Hover 时显示小型 Tooltip。

### 中央：CD Stage

占据页面最大面积。

展示：

* CD 盒
* 封面
* 背面
* 盘面
* 光线和反射
* 当前编辑对象标识

背景保持干净，允许非常轻微的网格或噪点。

### 右侧：Inspector

宽度约 320–380px。

Inspector 直接贴合页面边缘，通过左侧边线区分，不放在悬浮 Card 中。

内容根据模式切换：

* Info
* Artwork
* Filters
* Spine
* Tracks

### 底部：Player

横跨中央和右侧区域。

高度约 68–80px。

保持单层结构。

## 移动端

### 顶部

只保留：

* 项目名称
* 主题
* 更多操作

### 中央

全屏 CD Stage。

模型尺寸根据视口动态调整。

### 底部

固定播放器。

播放器上方保留一个编辑入口。

点击编辑后打开 Bottom Sheet：

* 基础信息
* 封面
* 背面
* CD
* 曲目

移动端不显示永久侧栏。

响应式布局使用移动优先方式，不要简单把桌面页面等比例压缩。Tailwind 的响应式工具适合针对断点分别定义布局。

---

# 七、侧标设计

至少实现四种侧标。

## 1. Catalog

类似唱片编号：

```text
MIX—004
2026
SELECTED BY SUN
```

特点：

* 极窄字体
* 等宽编号
* 黑白设计
* 位于 CD 盒脊部

## 2. OBI Strip

参考日版唱片侧标。

内容：

* 精选集标题
* 简短介绍
* 年份
* 曲目数量
* 目录编号

使用白、黑或从封面提取的单一强调色。

不要默认使用黄色。

## 3. Vertical Type

纵向排版：

```text
LATE NIGHT
COLLECTION
VOL. 01
```

适合极简封面。

## 4. Transparent Label

半透明塑料贴纸效果。

特点：

* 透明底
* 细描边
* 小字号
* 类似唱片店库存标签

---

# 八、动效规范

## 动效原则

动效必须服务于空间关系。

不做：

* 所有元素同时浮动
* 持续上下漂浮
* 无限弹跳
* 过度鼠标跟随
* 每个文字逐字出现
* 大面积模糊入场
* 无意义页面加载动画

## 统一曲线

普通反馈：

```ts
{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }
```

面板切换：

```ts
{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }
```

物理移动：

```ts
{
  type: "spring",
  stiffness: 260,
  damping: 28,
  mass: 0.8
}
```

CD 盒开合：

```ts
{
  type: "spring",
  stiffness: 110,
  damping: 22,
  mass: 1.1
}
```

## 关键动效

### 模式切换

点击 Front、Back 或 Disc：

* 3D 模型先旋转到目标角度
* Inspector 内容同时淡出
* 模型到达约 70% 时，新 Inspector 内容进入
* 不要先完全结束一个动画再执行下一个

### 曲目播放

开始播放时：

* CD 唱片缓慢旋转
* 当前曲目编号出现细小动态波形
* 播放按钮平滑变为暂停
* 封面只产生非常轻微的呼吸效果

暂停后：

* 唱片逐渐减速
* 不要突然停止

### 图片上传

上传后：

* 原占位图淡出
* 新图片以轻微 scale 进入
* CD 材质同步更新
* 不弹出成功 Toast

### 主题切换

* 使用 CSS Variables
* 背景和文字同步过渡
* 3D 灯光颜色、环境强度一起变化
* 不使用整页白色闪烁

### 移动端 Sheet

* 从底部进入
* 舞台轻微向上和缩小
* 背景只加少量暗化
* 拖动关闭时动画跟随手势

---

# 九、性能要求

## 目标

桌面端：

* 主流设备接近 60 FPS
* 首屏交互尽快可用
* CD 模型操作无明显卡顿

移动端：

* 中端 Android 设备保持流畅
* 允许自动降低视觉质量
* 不因粒子、阴影或后处理导致发热

## 具体规则

### 1. 按需渲染

3D Canvas 优先使用：

```tsx
<Canvas frameloop="demand" />
```

仅在以下情况持续渲染：

* 用户拖动模型
* CD 开合动画
* 唱片播放旋转
* 相机过渡

静止时停止连续渲染。

### 2. 自适应 DPR

```tsx
<Canvas dpr={[1, 1.5]} />
```

低性能设备降至 1。

React Three Fiber 提供 performance regression 和性能缩放能力，可以根据设备情况降低渲染质量。

### 3. 移动端降级

移动端关闭或降低：

* 实时阴影
* 高采样反射
* 后处理
* 高分辨率环境贴图
* 过强的透明材质叠加

### 4. 纹理

上传图片在进入 3D 材质前：

* 限制最长边到 1600px
* 转换为合适尺寸的 Blob
* 避免直接使用手机原始 10MB 图片
* 释放不再使用的 Object URL
* 纹理更新后调用 dispose 清理旧纹理

### 5. React 更新

不要在每次 pointermove 中调用 React setState。

鼠标倾斜、旋转角度等高频状态使用：

* Motion Value
* ref
* `useFrame`

### 6. 动画属性

DOM 动画优先修改：

* transform
* opacity

避免高频修改：

* width
* height
* top
* left
* 大面积 blur
* box-shadow

Motion 的性能指南也建议优先选择浏览器更容易合成的动画属性。

### 7. Reduced Motion

必须支持：

```css
@media (prefers-reduced-motion: reduce)
```

降低或关闭：

* 模型自动旋转
* 视差
* 弹簧位移
* 唱片惯性
* 大范围页面转场

---

# 十、建议目录结构

```text
src/
├─ app/
│  ├─ layout.tsx
│  ├─ page.tsx
│  └─ globals.css
│
├─ components/
│  ├─ shell/
│  │  ├─ AppShell.tsx
│  │  ├─ ProjectRail.tsx
│  │  ├─ MobileHeader.tsx
│  │  └─ MobileEditorSheet.tsx
│  │
│  ├─ stage/
│  │  ├─ CDStage.tsx
│  │  ├─ CDCase.tsx
│  │  ├─ Disc.tsx
│  │  ├─ StageLights.tsx
│  │  └─ StageFallback.tsx
│  │
│  ├─ editor/
│  │  ├─ Inspector.tsx
│  │  ├─ InfoEditor.tsx
│  │  ├─ ArtworkEditor.tsx
│  │  ├─ FilterSelector.tsx
│  │  ├─ SpineEditor.tsx
│  │  └─ TrackEditor.tsx
│  │
│  ├─ player/
│  │  ├─ Player.tsx
│  │  ├─ Progress.tsx
│  │  └─ PlayingIndicator.tsx
│  │
│  └─ export/
│     └─ ExportCard.tsx
│
├─ lib/
│  ├─ image/
│  │  ├─ crop.ts
│  │  ├─ filters.ts
│  │  └─ resize.ts
│  │
│  ├─ music/
│  │  ├─ types.ts
│  │  ├─ provider.ts
│  │  ├─ demo-provider.ts
│  │  └─ netease-link-provider.ts
│  │
│  ├─ export-image.ts
│  └─ storage.ts
│
├─ store/
│  └─ use-compilation-store.ts
│
├─ data/
│  └─ demo-project.ts
│
└─ types/
   └─ compilation.ts
```

---

# 十一、三小时执行时间表

## 00:00–00:15：初始化

* 阅读项目现有代码
* 阅读并定位 `cd-showcase-3d` skill
* 初始化 Next.js、TypeScript 和 Tailwind
* 安装必要依赖
* 建立主题变量
* 建立项目类型和 Zustand Store
* 加入演示数据

此阶段不要调整细节动效。

## 00:15–00:45：完成页面骨架

* 桌面三段式布局
* 移动端布局
* Project Rail
* Inspector
* Player
* 深浅色主题
* 模式切换

此时页面应该已经可以完整操作，不允许只出现空白占位区域。

## 00:45–01:25：接入 CD 展示

* 复用 `cd-showcase-3d`
* 映射正面、背面和盘面纹理
* 实现旋转、开盒和唱片滑出
* 实现桌面拖动
* 实现移动端手势
* 设置响应式相机和模型比例

若现有 skill 在 20 分钟内无法正常接入，立即使用 CSS 3D 制作降级 CD 盒，不要让 Three.js 阻塞整个项目。

## 01:25–02:00：图片编辑

* 上传图片
* 裁剪
* 缩放
* 旋转
* 滤镜
* 实时更新纹理
* 本地保存

先实现正面，再复用同一套逻辑到背面和盘面。

## 02:00–02:25：曲目和播放器

* 曲目添加、删除和编辑
* 拖动排序
* Demo 音频
* 播放、暂停、上一首和下一首
* 进度条
* 播放状态驱动唱片旋转

## 02:25–02:45：核心动效

只优化以下高价值动效：

* 模式切换
* CD 盒开合
* 唱片滑出
* Inspector 进入退出
* 移动端 Bottom Sheet
* 当前曲目切换
* 主题切换

不要继续增加装饰动画。

## 02:45–03:00：检查与部署

检查：

* 1440×900 桌面端
* 390×844 移动端
* 浅色主题
* 深色主题
* 图片上传
* 页面刷新恢复
* 音频播放
* CD 拖动
* 无图片时的占位状态
* `prefers-reduced-motion`
* Console 无持续报错
* `pnpm lint`
* `pnpm build`

最后部署至 Vercel。

---

# 十二、必须满足的验收标准

## 功能

* 用户可以编辑精选集名称
* 用户可以上传正面、背面和盘面图片
* 用户可以调整裁剪和滤镜
* 3D 模型会实时显示用户图片
* 用户可以添加、编辑、删除和排序歌曲
* 至少一首演示歌曲能够真实播放
* 页面刷新后项目仍然存在
* 深浅色主题都可以使用
* 桌面端和移动端没有横向溢出

## 视觉

* 没有大面积暖黄色
* 没有紫蓝渐变光球
* 没有多层 Card 嵌套
* 没有大量胶囊按钮
* CD 舞台是页面视觉中心
* Inspector 与舞台之间通过边线和留白分隔
* 浅色和深色版本不是简单颜色反转
* 侧标至少提供四种方案

## 动效

* 模式切换没有明显跳变
* 面板卸载时有退出动画
* CD 开合连续自然
* 播放和暂停时唱片不会突然启停
* 移动端拖动不和页面滚动严重冲突
* 低性能设备存在降级方案

## 工程

* TypeScript 不使用大面积 `any`
* 不硬编码不可维护的重复数据
* 音乐接口使用 Provider 抽象
* 图片 Object URL 会被正确释放
* 不在前端保存第三方账号 Cookie
* 不添加无法工作的假按钮
* 构建通过
* 无持续 Console Error

---

# 十三、明确不做

三小时内不要开发：

* 登录注册
* Supabase
* 社区广场
* 点赞评论
* 关注系统
* 多人协作
* AI 自动生成封面
* 歌词同步
* 音频频谱分析
* 完整网易云账号登录（仅二维码登录，不实现密码/短信登录）
* 会员歌曲解灰与绕权（`ENABLE_GENERAL_UNBLOCK` 默认关闭，由用户自行决定）
* 批量抓取/下载/外链传播受版权音频
* 复杂 WebGL 后处理
* 多页面营销官网

不要为了“看起来功能很多”加入无法工作的入口。

---

# 十四、交给 Claude 的执行指令

你是本项目的主开发者。请直接在现有代码仓库中实现以上计划，不要只提供代码示例或解释。

执行要求：

1. 首先检查现有项目结构、依赖和 `cd-showcase-3d` skill。
2. 尽可能复用已有 CD 3D 能力，不要未经检查重新实现。
3. 不要删除或大范围重写与当前功能无关的代码。
4. 先建立可运行的完整功能链，再优化视觉细节。
5. 所有按钮必须真实可用，不创建装饰性假按钮。
6. 不使用暖黄色、紫蓝渐变球或常见 AI 网站视觉。
7. 不使用多层 Card 和圆角容器嵌套。
8. 网易云使用自托管 `@neteasecloudmusicapienhanced/api` 服务，经 Next.js route handler 服务器端代理；网易云 cookie 仅存服务端 httpOnly，不出现在前端 JS。
9. 网易云实现：二维码登录、读取「我喜欢的音乐」、搜索添加、经 `/song/url/v1` 网页播放；VIP/版权受限歌曲禁用播放并如实显示状态，不做绕过。
10. 使用 DemoMusicProvider 保证项目在无 API Key、无外部服务时仍能完整运行。
11. 所有高频动画避免 React setState。
12. 移动端必须提供真实可操作的布局，而不是缩小桌面版。
13. 实现 localStorage 持久化。
14. 完成后运行 lint 和 build。
15. 修复所有由本次修改引入的 TypeScript、构建和运行错误。
16. 最终汇报：

* 完成的功能
* 修改的主要文件
* 使用的依赖
* 网易云部分的处理方式
* 已知限制
* 测试结果

在视觉选择发生冲突时，优先级如下：

1. 交互可用
2. 动效连贯
3. 性能
4. 响应式
5. 视觉装饰

最终产品应更像一个高级数字唱片设计工具，而不是一个普通音乐播放器或 SaaS 后台。
