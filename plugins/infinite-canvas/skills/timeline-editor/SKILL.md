---
name: timeline-editor
description: 操作 Timeline Studio 网页时间轴视频剪辑器，读取工程轨道、切片片段、应用多轨剪辑、音频渐变、字幕排布与导出成片。
---

# Timeline Studio AI 视频剪辑

你正在帮助用户操作嵌入于主应用的 **Timeline Studio**（网页时间轴视频剪辑器，访问路径 `/editor`）。
Timeline Studio 基于 WebGPU 与 WebAssembly FFmpeg 构建，在浏览器内提供完全本地优先的多轨音视频剪辑、自动字幕与视频渲染导出。

## 适用场景与页面入口

- **页面入口**：直接在应用顶栏点击「AI 剪辑」或打开 `/editor`。
- **素材来源**：可通过顶栏「导入素材」按钮，直接从无限画布的节点或「我的资产」库中将视频、图片、音频送入剪辑器媒体区。
- **操作方式**：通过浏览器 WebMCP 工具接口或页面交互命令对当前打开的剪辑工程进行增删改查。

## 核心工具集说明

### 1. 检查与感知工程状态 (Inspect)
- `timeline_project_inspect`：读取当前工程基本信息、全局时长、图层能力及用于防止竞态的 `stateToken`。
- `timeline_track_inspect`：查看音轨、视轨、字幕轨等各轨道信息。
- `timeline_clip_inspect`：读取各轨道中的片段详情（开始时间、源入出点、变换属性）。
- `timeline_transcript_inspect`：读取工程内自动字幕与文本片段。
- `timeline_markers_inspect`：读取工程标记点与节拍点。
- `timeline_assets_inspect`：读取当前已载入剪辑器媒体库的全部素材及其 `assetId`。

### 2. 预览与应用时间轴操作 (Preview & Apply)
- `timeline_edit_preview`：传入计划执行的一组操作（如切片、调整音量、对齐字幕），计算语义差异与时间轴持续时长变化，不会直接改动画面。
  - `visual.split.at`：距离目标切片开头的相对秒数。
  - `visual.trim.sourceIn/sourceOut`：基于原始素材的绝对起止秒数。
  - `clip.set_property`：支持设置音频/视频切片的 `volume`（倍率）、`fadeIn`（淡入秒数）、`fadeOut`（淡出秒数）。
  - `overlay.add`：在指定时间轴位置插入画中画图片/视频素材。
- `timeline_edit_apply`：确认预览无误后传入 `previewId` 执行事务提交，支持撤回。
- `timeline_preview_seek`：将播放指针跳转到目标秒数位置（暂停状态查看）。
- `timeline_edit_undo`：撤回最近一次由 Agent 提交的修改。
- `timeline_project_save`：将当前时间轴工程打包为 `.timeline` 工程文件并触发保存。

### 3. 视频渲染与导出 (Export)
1. `timeline_export_prepare`：传入 `stateToken` 生成导出配置与体积估算。
2. `timeline_export_start`：启动浏览器端多线程 FFmpeg 实时渲染渲染任务，获取 `jobId`。
3. `timeline_export_inspect`：以固定间隔查询渲染进度与状态。
4. `timeline_export_cancel`：在必要时中止当前运行中的导出任务。
5. 渲染完成后确认终态（支持输出高保真 MP4 或 WebM）。

## 协作准则

- 编辑时间轴时，尽量保留原视频的音画对齐与字幕关联。
- 视频拼接时确保时间点连续，避免音轨间歇性静音或画面闪黑。
- 导出视频前先执行一次 `timeline_preview_seek` 检查转场节点与尾帧完整性。
