<p align="center">
  <img src="web/public/logo.svg" width="96" alt="infinite-canvas logo">
</p>

<h1 align="center">无限画布 (infinite-canvas)</h1>

<p align="center">
  <a href="https://linux.do/"><img src="https://img.shields.io/badge/Linux.do-Community-2b6de8?style=flat-square" alt="Linux.do"></a>
  <a href="https://render.com/deploy?repo=https://github.com/basketikun/infinite-canvas"><img src="https://img.shields.io/badge/Render-Deploy-46e3b7?style=flat-square&logo=render&logoColor=111111" alt="Deploy to Render"></a>
  <a href="https://github.com/basketikun/infinite-canvas"><img src="https://img.shields.io/github/stars/basketikun/infinite-canvas?style=flat-square&logo=github" alt="GitHub stars"></a>
  <a href="https://github.com/basketikun/infinite-canvas/tags"><img src="https://img.shields.io/github/v/tag/basketikun/infinite-canvas?style=flat-square&label=version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-f97316?style=flat-square" alt="License"></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://reactrouter.com/"><img src="https://img.shields.io/badge/React_Router-7-ca4245?style=flat-square&logo=reactrouter&logoColor=white" alt="React Router"></a>
</p>

<p align="center">
<a href="https://trendshift.io/repositories/50077?utm_source=repository-badge&amp;utm_medium=badge&amp;utm_campaign=badge-repository-50077" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/repositories/50077" alt="basketikun%2Finfinite-canvas | Trendshift" width="250" height="55"/></a>
</p>

<p align="center">
  <a href="docs/content/docs/overview/quick-start.mdx">快速开始</a> · <a href="docs/content/docs/overview/features.mdx">功能介绍</a> · <a href="docs/content/docs/overview/render.mdx">Render 部署</a> · <a href="docs/content/docs/overview/docker.mdx">Docker 部署</a> · <a href="docs/content/docs/canvas/canvas-node-manual.mdx">画布节点操作手册</a> · <a href="docs/content/docs/canvas/canvas-shortcuts.mdx">画布快捷键</a> · <a href="SECURITY.md">漏洞提交</a> · <a href="docs/content/docs/progress/todo.mdx">待办事项</a> · <a href="canvas-agent/README.md">本地 Canvas Agent</a> · <a href="plugins/infinite-canvas">Codex app 插件</a>
</p>

无限画布是一款面向图片创作的开源工作台。它把画布编排、AI 图片生成、参考图编辑、对话助手、提示词库和素材沉淀放在同一个界面里，适合用来探索视觉方案并连续迭代图片结果。

> [!CAUTION]
> 项目目前处于开发阶段，不保证历史数据兼容。各种本地存储格式都可能直接调整，欢迎关注后续更新。
>
> 如果你需要稳定维护自己的分支，建议自行 fork 后独立开发。二次开发与 PR 请保留原作者信息和前端页面标识。

## 核心功能

- 无限画布：多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出。
- AI 创作：浏览器前台直连你配置的 OpenAI 兼容接口，支持文生图、图生图、参考图编辑、文本问答、音频和视频生成。
- 画布助手：围绕选中节点和上游节点对话、生图，并把结果插回画布。
- 本地 Agent：通过本机 Canvas Agent 连接 Codex / Claude Code，让 Agent 通过 MCP 操作当前画布；
- Codex App 插件：提供 Codex app 插件，安装后会自动注册 MCP 并尝试拉起本地 Agent。
- 插件系统：支持通过 URL 动态安装 / 启用 / 更新 / 卸载远程节点插件，并提供 TypeScript SDK 自行开发画布节点插件。
- 自定义接口调用：可自定义生图 / 视频接口的调用方式，灵活适配各类中转站与自建服务。
- 提示词库：内置 7 个开源提示词来源并支持自定义标准 JSON 来源，由浏览器前端直连并缓存到 IndexedDB。

完整功能说明见 [功能介绍](docs/content/docs/overview/features.mdx)。

如果你在为担心没有合适的生图API来发愁，可以查看该免费生图项目：[chatgpt2api](https://github.com/basketikun/chatgpt2api)

## 与上游的差异（Fork 增强功能）

本仓库（[YaoGuaiLi/infinite-canvas](https://github.com/YaoGuaiLi/infinite-canvas)）基于上游 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 开发，在保持上游功能对齐的同时，额外集成与优化了下列能力。

### 差异一览

| 维度 | 上游 | 本仓库 |
|------|------|--------|
| 视频剪辑 | 无独立剪辑器 | 内置 **Timeline Studio 多轨剪辑器**（`/editor`），支持资产一键导入 |
| 工作流模板 | 无 | 新增 **示例工作流**（`/workflows`），预置已验证拓扑模板 |
| 深度提取 | 需外部服务 | **纯前端 WebGPU** 深度推理（Depth-Anything-V2-Small，魔搭下载 + 本地缓存） |
| Agent 接入 | 仅 Codex 插件说明 | 支持 **Codex / CodeG / 任意 MCP 客户端** 一键唤醒与仓库源码部署 |
| Agent 技能 | `canvas` 单技能 | 新增 `timeline-editor`、`creative-studio` 双技能 |
| 长任务轮询 | 固定轮次等待 | **双保险轮询**（前台唤醒 + 绝对超时 + 自适应间隔） |
| 云同步 | WebDAV | 追加 **GitHub 私有仓库备份** |
| 模型渠道 | OpenAI / Gemini | 追加 **APIMart** 任务式渠道适配 |
| 远程图片 | 依赖图床 CORS | 内置 **Edge Function 图片代理**，自动绕过 CORS 与临时外链过期 |
| 上游自动同步 | — | **已移除**每小时自动合并上游的 workflow，改由人工按需同步 |
| 文档 | 含 API 赞助推广 | 移除推广内容，仅注入访问统计代码 |

### 功能详情

- **内置 Timeline Studio AI 视频多轨剪辑器**：新增独立页面入口 `/editor`（顶部导航栏「AI 剪辑」），开箱集成基于 WebGPU + WASM FFmpeg 的多轨时间轴剪辑、自动字幕、AI 配音与画中画合成，支持全屏与多主题自适应，配置 Vercel COOP/COEP 安全响应头支持多线程音视频渲染。剪辑器顶栏提供**资产一键导入**，可直接将「我的资产」与「画布项目」中的图片、视频、音频送入时间轴媒体区。
- **验证过的示例工作流面板**：新增顶部导航「示例工作流」(`/workflows`)，预置并验证了「短视频动作迁移」、「首尾帧平滑过渡视频」、「人物肖像精准对口型」、「多机位分镜连拍组」等开箱即用的拓扑模板，一键克隆生成全新画布工程。
- **纯前端 WebGPU 深度提取能力**：集成 Depth-Anything-V2-Small（Q4F16 量化，约 19MB），默认从**魔搭社区 (ModelScope)** 高速下载并持久化至浏览器 CacheStorage，已缓存时 0 流量秒级离线加载，Hugging Face 作为自动回退镜像。
- **全能 Agent 调度连接器（双引擎联动）**：Agent 插件升级为 `canvas`（画布操作）、`timeline-editor`（时间轴视频剪辑）、`creative-studio`（创意全能调度）三大技能；连接界面提供 **Codex / CodeG / Zed / VSCode 一键唤醒安装**，并给出**本仓库源码直链与 GitHub 加速直链**，不再绑定单一宿主。
- **长任务双保险轮询机制**：针对长耗时生视频与 APIMart 异步任务，引入前台唤醒（`visibilitychange`）即时状态对齐、15 分钟绝对时间超时与动态自适应轮询间隔，规避浏览器切后台静默超时与节点卡死。
- **内置 AutoDL ComfyUI 工作流节点插件**：内置 [infinite-canvas-plugin-comfyui-autodl](https://github.com/YaoGuaiLi/infinite-canvas-plugin-comfyui-autodl)，画布创建菜单直接提供「ComfyUI 工作流」节点。
  - 支持调用 AutoDL.Art 平台 ComfyUI 官方/自定义工作流（文生视频、多图参考、首尾帧控制、对口型、IndexTTS2 语音合成等）。
  - 动态从 API 拉取工作流表单参数，支持上游连线素材与 `@` 标签绑定参考槽位。
  - 生成结果自动下载并缓存到本地 IndexedDB，避免依赖短期外链。
  - 源码内置于 `plugins/canvas/comfyui-autodl/`，产物随站点一同构建分发。
  - 本地内置插件默认启用，无需手动填写 URL 安装。
- **GitHub 仓库云同步备份**：配置弹窗 → 云同步新增 **GitHub 仓库** 选项，可用私有仓库（Contents API）同步画布、我的资产、生成记录与本地媒体文件；填入 `owner/repo` 与仅授予目标仓库 `Contents: Read and write` 的 Fine-grained PAT 即可，网络受限时可将 API 地址换为自有反代。
- **APIMart 渠道原生适配**：渠道编辑器新增 **APIMart** 调用格式（默认 `https://api.apimart.ai/v1`），内置任务式生图 / 生视频适配：参考图自动上传、任务轮询、按模型的尺寸 / 分辨率 / 比例 / 质量参数归一化（gemini-3.1、nano-banana、seedream-5、grok-imagine、imagen-4、flux 等），浏览器直连无需反代。
- **免 CORS 跨域图片持久化代理**：内置 Vercel Edge Function (`/api/image-proxy`)，自动解决无 CORS 头图床（如 APIMart getapib 等）被浏览器阻止下载的问题，确保远程生成图片能安全拉取并写入本地 IndexedDB，防止临时外链过期导致画布裂图。
- **资产卡片高度约束**：修复「我的资产」与画布侧栏中长文本资产无限纵向拉伸的问题，超长文本按行截断并可完整查看详情。
- **移除上游自动同步**：本项目已删除 `.github/workflows/sync-upstream.yml`，不再每小时自动合并上游（此前的自动合并会因 README / i18n 冲突持续失败并刷失败邮件）；需要跟进上游时按需人工合并。
- **纯净文档与访问统计**：移除上游 README 中插入的第三方 API 赞助推广与返利链接，仅保留访问分析统计代码。

## 快速开始

AI API Key、Base URL、画布、素材和生成记录默认保存在浏览器本地。

### 本地开发

```bash
git clone https://github.com/YaoGuaiLi/infinite-canvas.git
cd infinite-canvas
cd web
bun install
bun run dev
```

### Docker 运行

```bash
git clone https://github.com/YaoGuaiLi/infinite-canvas.git
cd infinite-canvas
docker compose up -d
```

运行后默认端口3000，可访问 `http://localhost:3000`。

首次打开后进入右上角配置，填入自己的 OpenAI 兼容 `Base URL` 和 `API Key`。

如果默认的OpenAI接口调用方式与您的API不同，可自定义生图/视频脚本调用。

## 效果展示

<table width="100%">
  <tr>
    <td width="50%"><img src="https://i.ibb.co/TDFvGWDT/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/zVwJq3YS/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/PvY3qhhK/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/7D04LwN/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/bj30FtS5/5.png" alt="5" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/hxRvjw51/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/jkWsF8q1/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/XrnfXHx7/image.png" alt="image" border="0"></td>
  </tr>
</table>

## 联系方式

项目定制二次开发需求 / 生图 API 需求可联系。

邮箱：1844025705@qq.com · QQ：1844025705

## 社区支持

学 AI，上 L 站：[LinuxDO](https://linux.do/)

点击链接加入群聊【开源无限画布(2群)】：https://qm.qq.com/q/HRt2kUnYiG

## 开源协议

本项目使用 [MIT License](LICENSE)。任何人都可以免费使用、复制、修改、分发、再授权和商业使用本项目，也可以用于闭源产品。

## Star History

<a href="https://www.star-history.com/?repos=basketikun%2Finfinite-canvas&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&legend=top-left" />
 </picture>
</a>
