# Infinite Canvas Plugin

让 Codex / ZCode 可以打开并操作 Infinite Canvas。

## 安装

### Codex

macOS / Linux：

```bash
git clone https://github.com/basketikun/infinite-canvas.git
cd infinite-canvas
codex plugin marketplace add "$(pwd)"
codex plugin add infinite-canvas@infinite-canvas-local
```

Windows PowerShell：

```powershell
git clone https://github.com/basketikun/infinite-canvas.git
cd infinite-canvas
codex plugin marketplace add "$PWD"
codex plugin add infinite-canvas@infinite-canvas-local
```

Windows CMD 将 `$PWD` 替换为 `%cd%`。

### ZCode

- 打开 **Settings → Plugin Management → Discover**，点击右上角 **`+`** 添加 marketplace。
- 选择 **本仓库目录**（`plugins/infinite-canvas`）或本仓库根目录，即可发现 `infinite-canvas` 插件并安装。
- 或在 ZCode 界面直接以本地目录方式加载该插件目录。

安装后新建一个任务，然后输入：

```text
帮我打开并连接到 Infinite Canvas
```

## 核心技能与双引擎能力

插件现已升级为**双引擎一体化调度连接器**，同时赋予 Agent 操作「无限画布」与「Timeline Studio 时间轴视频剪辑」的完整能力：

### 1. 🎨 `canvas` (无限画布操作)
- 检查画布、读取选区、创建文本、设计图、配置流程。
- 触发生图、图生图、生视频与音频生成，管理节点网络与连线。

### 2. 🎬 `timeline-editor` (时间轴视频剪辑)
- 操作嵌入式 Timeline Studio 多轨视频剪辑器（`/editor`）。
- 检查时间轴工程、音轨、视轨、字幕片段与媒体资源库。
- 预览并应用多轨切片、裁剪、画中画叠加、音量淡入淡出、自动字幕对齐。
- 本地启动多线程渲染导出 MP4/WebM 成品视频并轮询进度。

### 3. ⚡ `creative-studio` (全能创意调度器)
- 串联「灵感发散 → 多镜头分镜生成 → 媒体资产自动流转 → 时间轴音视频精剪与成片导出」全流程制作管线。
- 适合执行高阶创作指令，例如：“在画布构思 3 个舞蹈分镜生成视频，然后转入时间轴剪辑对齐配乐并导出”。

