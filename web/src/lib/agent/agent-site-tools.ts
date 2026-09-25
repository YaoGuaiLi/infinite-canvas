import type { NavigateFunction } from "react-router-dom";

import i18n from "@/i18n";
import { fetchPrompts } from "@/services/api/prompts";
import { uploadImage } from "@/services/image-storage";
import { imageAspectOptions, imageQualityOptions, imageScaleOptions } from "@/components/image-settings-panel";
import { videoResolutionOptions, videoSecondsRange, videoSizeOptions } from "@/components/video-settings-panel";
import type { CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";
import { clampVideoSeconds } from "@/lib/media-size";
import { buildTemplateProject, findWorkflowTemplate } from "@/lib/canvas/workflow-templates";
import { getMediaBlob, uploadMediaFile } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { checkWebGPUAvailability, getOrFetchDepthModel, isDepthModelCached } from "@/services/depth-webgpu";
import { createApimartVideoTask, pollApimartVideoTask } from "@/services/api/apimart";
import { uploadGithubFile } from "@/services/github-sync";
import { resilientDelay } from "@/lib/polling-guard";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { modelOptionLabel, modelOptionName, normalizeModelOptionValue, selectableModelsByCapability, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";

// Execute site-level Agent tools in the browser, including canvas lists, workbench generation, prompt search, and asset operations.
// Their data lives locally in the browser through localforage and Zustand, so this module accesses the relevant stores directly.

export const SITE_TOOL_NAMES = [
    "canvas_list_projects",
    "generation_get_status",
    "workbench_image_get_config",
    "workbench_image_generate",
    "workbench_video_get_config",
    "workbench_video_generate",
    "prompts_search",
    "assets_list",
    "assets_add",
    "workflows_apply_template",
    "editor_import_media",
    "sync_github_backup",
    "apimart_generate_video",
    "apimart_task_status",
    "depth_model_status",
    "depth_model_prefetch",
] as const;

export type SiteToolName = (typeof SITE_TOOL_NAMES)[number];

export function isSiteTool(name: string): name is SiteToolName {
    return (SITE_TOOL_NAMES as readonly string[]).includes(name);
}

function siteText(key: string, options?: Record<string, unknown>) {
    return i18n.t(`agent.siteTools.${key}`, options);
}

export const SITE_TOOL_LABELS: Record<SiteToolName, string> = {
    get canvas_list_projects() { return siteText("canvasList"); },
    get generation_get_status() { return siteText("generationStatus"); },
    get workbench_image_get_config() { return siteText("imageConfig"); },
    get workbench_image_generate() { return siteText("imageGenerate"); },
    get workbench_video_get_config() { return siteText("videoConfig"); },
    get workbench_video_generate() { return siteText("videoGenerate"); },
    get prompts_search() { return siteText("promptSearch"); },
    get assets_list() { return siteText("assetList"); },
    get assets_add() { return siteText("assetAdd"); },
    get workflows_apply_template() { return siteText("workflowsApplyTemplate"); },
    get editor_import_media() { return siteText("editorImportMedia"); },
    get sync_github_backup() { return siteText("syncGithubBackup"); },
    get apimart_generate_video() { return siteText("apimartGenerateVideo"); },
    get apimart_task_status() { return siteText("apimartTaskStatus"); },
    get depth_model_status() { return siteText("depthModelStatus"); },
    get depth_model_prefetch() { return siteText("depthModelPrefetch"); },
};

type SiteToolInput = Record<string, unknown>;
type SiteToolContext = { canvasSnapshot?: CanvasAgentSnapshot | null };
type GenerationStatus = "idle" | "queued" | "running" | "succeeded" | "failed";
type GenerationStatusItem = { id: string; source: "canvas" | "image" | "video"; status: GenerationStatus; kind?: string; title?: string; prompt?: string; projectId?: string; createdAt?: string; updatedAt?: string; successCount?: number; failCount?: number; error?: string };

export async function runSiteTool(name: SiteToolName, input: SiteToolInput, navigate: NavigateFunction, context: SiteToolContext = {}): Promise<unknown> {
    switch (name) {
        case "canvas_list_projects":
            return listCanvasProjects(input);
        case "generation_get_status":
            return getGenerationStatus(input, context.canvasSnapshot);
        case "workbench_image_get_config":
            return getImageConfig();
        case "workbench_image_generate":
            return runImageWorkbench(input, navigate);
        case "workbench_video_get_config":
            return getVideoConfig();
        case "workbench_video_generate":
            return runVideoWorkbench(input, navigate);
        case "prompts_search":
            return searchPrompts(input);
        case "assets_list":
            return listAssets(input);
        case "assets_add":
            return addAsset(input);
        case "workflows_apply_template":
            return applyWorkflowTemplate(input, navigate);
        case "editor_import_media":
            return importEditorMedia(input, navigate);
        case "sync_github_backup":
            return runGithubBackup(input);
        case "apimart_generate_video":
            return startApimartVideo(input);
        case "apimart_task_status":
            return getApimartTaskStatus(input);
        case "depth_model_status":
            return getDepthStatus(input);
        case "depth_model_prefetch":
            return prefetchDepthModel();
        default:
            throw new Error(siteText("unknownTool", { name }));
    }
}

function getGenerationStatus(input: SiteToolInput, canvasSnapshot?: CanvasAgentSnapshot | null) {
    const scope = input.scope === "canvas" || input.scope === "image" || input.scope === "video" ? input.scope : "all";
    const taskId = typeof input.taskId === "string" ? input.taskId : "";
    const nodeIds = new Set(Array.isArray(input.nodeIds) ? input.nodeIds.filter((id): id is string => typeof id === "string") : []);
    const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit)) || 20));
    const tasks: GenerationStatusItem[] = [];
    const includeCanvas = (scope === "all" || scope === "canvas") && (!taskId || nodeIds.size > 0);
    const includeWorkbench = !nodeIds.size || Boolean(taskId);

    if (includeCanvas && canvasSnapshot) {
        canvasSnapshot.nodes.forEach((node) => {
            const status = normalizeCanvasGenerationStatus(node.metadata?.status);
            if (!status || (nodeIds.size && !nodeIds.has(node.id))) return;
            const metadata = node.metadata || {};
            if (!nodeIds.size && node.type !== "config" && status !== "running" && status !== "failed" && !metadata.generationMode && !metadata.generationType && !metadata.model) return;
            tasks.push({ id: node.id, source: "canvas", status, kind: metadata.generationMode || node.type, title: node.title, prompt: compactPrompt(metadata.prompt || metadata.composerContent), projectId: canvasSnapshot.projectId, error: metadata.errorDetails });
        });
    }

    if (includeWorkbench) {
        useWorkbenchAgentStore.getState().tasks.forEach((task) => {
            if ((scope === "image" || scope === "video") && task.kind !== scope) return;
            if (scope === "canvas" || (taskId && task.id !== taskId)) return;
            tasks.push({ ...task, source: task.kind, prompt: compactPrompt(task.prompt) });
        });
    }

    tasks.sort((a, b) => generationStatusOrder(a.status) - generationStatusOrder(b.status) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    const summary: Record<GenerationStatus, number> = { idle: 0, queued: 0, running: 0, succeeded: 0, failed: 0 };
    tasks.forEach((task) => (summary[task.status] += 1));
    return { total: tasks.length, summary, tasks: tasks.slice(0, limit) };
}

function generationStatusOrder(status: GenerationStatus) {
    return status === "running" ? 0 : status === "queued" ? 1 : 2;
}

function normalizeCanvasGenerationStatus(status: unknown): GenerationStatus | null {
    if (status === "idle") return "idle";
    if (status === "loading") return "running";
    if (status === "success") return "succeeded";
    if (status === "error") return "failed";
    return null;
}

function compactPrompt(prompt: unknown) {
    const value = typeof prompt === "string" ? prompt.trim() : "";
    return value ? `${value.slice(0, 200)}${value.length > 200 ? "..." : ""}` : undefined;
}

function listCanvasProjects(input: SiteToolInput) {
    const { projects, hydrated } = useCanvasStore.getState();
    if (!hydrated) throw new Error(siteText("canvasLoading"));
    const keyword = String(input.keyword || "").trim().toLowerCase();
    const filtered = keyword ? projects.filter((project) => project.title.toLowerCase().includes(keyword)) : projects;
    const { page, pageSize, start, end } = paginate(input, filtered.length, 20);
    const items = filtered.slice(start, end).map((project) => ({
        id: project.id,
        title: project.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        nodeCount: project.nodes.length,
        connectionCount: project.connections.length,
    }));
    return { total: filtered.length, page, pageSize, items, hint: siteText("canvasHint") };
}

function getImageConfig() {
    const { config } = useConfigStore.getState();
    const model = config.imageModel || config.model;
    return {
        current: { model, modelName: modelOptionName(model), quality: config.quality || "auto", size: config.size || "1:1", count: config.count || "1" },
        models: selectableModelsByCapability(config, "image").map((value) => ({ value, label: modelOptionLabel(config, value) })),
        qualityOptions: imageQualityOptions,
        scaleOptions: imageScaleOptions,
        sizeOptions: imageAspectOptions,
        countRange: { min: 1, max: 15 },
    };
}

function runImageWorkbench(input: SiteToolInput, navigate: NavigateFunction) {
    const configStore = useConfigStore.getState();
    const applied: Record<string, unknown> = {};
    if (typeof input.model === "string" && input.model.trim()) {
        const value = normalizeModelOptionValue(input.model, configStore.config.channels) || input.model;
        configStore.updateConfig("imageModel", value);
        applied.model = value;
    }
    if (typeof input.quality === "string" && input.quality.trim()) {
        configStore.updateConfig("quality", input.quality);
        applied.quality = input.quality;
    }
    if (typeof input.size === "string" && input.size.trim()) {
        configStore.updateConfig("size", input.size);
        applied.size = input.size;
    }
    if (input.count != null) {
        const count = String(Math.max(1, Math.min(15, Math.floor(Number(input.count)) || 1)));
        configStore.updateConfig("count", count);
        applied.count = count;
    }
    const prompt = typeof input.prompt === "string" ? input.prompt : undefined;
    const run = input.run !== false;
    navigate("/image");
    const taskId = useWorkbenchAgentStore.getState().dispatchImage({ prompt, run });
    return { ok: true, navigated: "/image", prompt, run, taskId, applied, note: siteText(run ? "imageGenerationStarted" : "imageConfigApplied") };
}

function getVideoConfig() {
    const { config } = useConfigStore.getState();
    const model = config.videoModel || config.model;
    return {
        current: {
            model,
            modelName: modelOptionName(model),
            size: config.size || "1280x720",
            seconds: config.videoSeconds || "6",
            resolution: config.vquality || "720",
            generateAudio: config.videoGenerateAudio !== "false",
            watermark: config.videoWatermark === "true",
            mode: config.videoMode === "reference" ? "reference" : "frames",
        },
        models: selectableModelsByCapability(config, "video").map((value) => ({ value, label: modelOptionLabel(config, value) })),
        sizeOptions: videoSizeOptions,
        secondsRange: videoSecondsRange,
        resolutionOptions: videoResolutionOptions,
        modeOptions: [
            { value: "frames", label: i18n.t("settingsPanels.video.modes.frames") },
            { value: "reference", label: i18n.t("settingsPanels.video.modes.reference") },
        ],
    };
}

function runVideoWorkbench(input: SiteToolInput, navigate: NavigateFunction) {
    const configStore = useConfigStore.getState();
    const applied: Record<string, unknown> = {};
    if (typeof input.model === "string" && input.model.trim()) {
        const value = normalizeModelOptionValue(input.model, configStore.config.channels) || input.model;
        configStore.updateConfig("videoModel", value);
        applied.model = value;
    }
    if (typeof input.size === "string" && input.size.trim()) {
        configStore.updateConfig("size", input.size);
        applied.size = input.size;
    }
    if (input.seconds != null && String(input.seconds).trim()) {
        const seconds = clampVideoSeconds(String(input.seconds));
        configStore.updateConfig("videoSeconds", seconds);
        applied.seconds = seconds;
    }
    if (typeof input.resolution === "string" && input.resolution.trim()) {
        configStore.updateConfig("vquality", input.resolution);
        applied.resolution = input.resolution;
    }
    if (typeof input.generateAudio === "boolean") {
        configStore.updateConfig("videoGenerateAudio", String(input.generateAudio));
        applied.generateAudio = input.generateAudio;
    }
    if (typeof input.watermark === "boolean") {
        configStore.updateConfig("videoWatermark", String(input.watermark));
        applied.watermark = input.watermark;
    }
    if (input.mode === "frames" || input.mode === "reference") {
        configStore.updateConfig("videoMode", input.mode);
        applied.mode = input.mode;
    }
    const prompt = typeof input.prompt === "string" ? input.prompt : undefined;
    const run = input.run !== false;
    navigate("/video");
    const taskId = useWorkbenchAgentStore.getState().dispatchVideo({ prompt, run });
    return { ok: true, navigated: "/video", prompt, run, taskId, applied, note: siteText(run ? "videoGenerationStarted" : "videoConfigApplied") };
}

async function searchPrompts(input: SiteToolInput) {
    const page = Math.max(1, Math.floor(Number(input.page)) || 1);
    const pageSize = Math.max(1, Math.min(50, Math.floor(Number(input.pageSize)) || 20));
    const tags = Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === "string") : [];
    const result = await fetchPrompts({ keyword: String(input.keyword || ""), category: String(input.category || i18n.t("common.all")), tag: tags, page, pageSize });
    return {
        total: result.total,
        page,
        pageSize,
        categories: result.categories,
        tags: result.tags.slice(0, 60),
        items: result.items.map((prompt) => ({ id: prompt.id, title: prompt.title, prompt: prompt.prompt, category: prompt.category, tags: prompt.tags, coverUrl: prompt.coverUrl, githubUrl: prompt.githubUrl })),
    };
}

function listAssets(input: SiteToolInput) {
    const { assets, hydrated } = useAssetStore.getState();
    if (!hydrated) throw new Error(siteText("assetsLoading"));
    const kind = input.kind === "text" || input.kind === "image" || input.kind === "video" ? input.kind : "all";
    const keyword = String(input.keyword || "").trim().toLowerCase();
    const filtered = assets.filter((asset) => {
        if (kind !== "all" && asset.kind !== kind) return false;
        if (!keyword) return true;
        return [asset.title, asset.note, asset.source, ...asset.tags].filter(Boolean).join(" ").toLowerCase().includes(keyword);
    });
    const { page, pageSize, start, end } = paginate(input, filtered.length, 20);
    const items = filtered.slice(start, end).map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        title: asset.title,
        tags: asset.tags,
        source: asset.source,
        note: asset.note,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
        coverUrl: asset.coverUrl || undefined,
        content: asset.kind === "text" ? asset.data.content : undefined,
    }));
    return { total: filtered.length, page, pageSize, items };
}

async function addAsset(input: SiteToolInput) {
    const kind = input.kind;
    const title = String(input.title || "").trim();
    if (!title) throw new Error(siteText("assetTitleRequired"));
    const tags = Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === "string") : [];
    const source = typeof input.source === "string" ? input.source : "Agent";
    const note = typeof input.note === "string" ? input.note : undefined;
    const store = useAssetStore.getState();
    if (kind === "text") {
        const content = String(input.content || "").trim();
        if (!content) throw new Error(siteText("textContentRequired"));
        const id = store.addAsset({ kind: "text", title, coverUrl: "", tags, source, note, data: { content } });
        return { ok: true, id, kind: "text" };
    }
    if (kind === "image") {
        const imageUrl = String(input.imageUrl || "").trim();
        if (!imageUrl) throw new Error(siteText("imageUrlRequired"));
        let stored;
        try {
            stored = await uploadImage(imageUrl);
        } catch {
            throw new Error(siteText("imageReadFailed"));
        }
        const id = store.addAsset({ kind: "image", title, coverUrl: stored.url, tags, source, note, data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType } });
        return { ok: true, id, kind: "image" };
    }
    throw new Error(siteText("assetKindUnsupported"));
}

function paginate(input: SiteToolInput, total: number, defaultSize: number) {
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize)) || defaultSize));
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(maxPage, Math.max(1, Math.floor(Number(input.page)) || 1));
    const start = (page - 1) * pageSize;
    return { page, pageSize, start, end: start + pageSize };
}

// ---------------------------------------------------------------------------
// Fork 扩展：工作流模板 / 时间轴素材导入 / GitHub 备份 / APIMart 视频任务 / WebGPU 深度模型
// ---------------------------------------------------------------------------

function applyWorkflowTemplate(input: SiteToolInput, navigate: NavigateFunction) {
    const slug = String(input.template || "");
    const template = findWorkflowTemplate(slug);
    if (!template) throw new Error(siteText("unknownWorkflowTemplate"));
    const store = useCanvasStore.getState();
    if (!store.hydrated) throw new Error(siteText("canvasLoading"));
    const title = i18n.t(template.titleKey);
    const projectId = store.createProject(title);
    const { nodes, connections } = buildTemplateProject(template);
    store.updateProject(projectId, { nodes, connections });
    navigate(`/canvas/${projectId}`);
    return { ok: true, projectId, template: slug, nodeCount: nodes.length, connectionCount: connections.length };
}

async function waitForEditorFrame(timeoutMs = 15000): Promise<HTMLIFrameElement> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const frame = Array.from(document.querySelectorAll("iframe")).find((item) => (item.getAttribute("src") || "").includes("/editor/"));
        if (frame) return frame;
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(siteText("editorNotOpen"));
}

async function importEditorMedia(input: SiteToolInput, navigate: NavigateFunction) {
    const sources = Array.isArray(input.sources) && input.sources.length ? input.sources : ["assets", "canvas"];
    const wantAssets = sources.includes("assets");
    const wantCanvas = sources.includes("canvas");
    const projectId = typeof input.project_id === "string" ? input.project_id : "";
    const limit = Math.max(1, Math.min(50, Math.floor(Number(input.limit)) || 30));
    const assets = useAssetStore.getState();
    const canvas = useCanvasStore.getState();
    if (assets.hydrated !== undefined && !assets.hydrated) throw new Error(siteText("assetsLoading"));

    type Item = { name: string; mimeType: string; buffer: ArrayBuffer };
    const items: Item[] = [];

    const pushItem = async (name: string, kind: "image" | "video" | "audio", storageKey?: string, fallbackUrl?: string) => {
        if (items.length >= limit) return;
        try {
            let blob: Blob | null = null;
            if (storageKey) blob = kind === "image" ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
            if (!blob && fallbackUrl) {
                const res = await fetch(fallbackUrl);
                blob = await res.blob();
            }
            if (!blob) return;
            const ext = kind === "video" ? "mp4" : kind === "audio" ? "mp3" : "png";
            items.push({
                name: name.includes(".") ? name : `${name || "asset"}.${ext}`,
                mimeType: blob.type || (kind === "video" ? "video/mp4" : kind === "audio" ? "audio/mpeg" : "image/png"),
                buffer: await blob.arrayBuffer(),
            });
        } catch (err) {
            console.error("[site-tools] editor media collect failed:", name, err);
        }
    };

    if (wantAssets) {
        for (const asset of assets.assets) {
            if (items.length >= limit) break;
            if (asset.kind !== "image" && asset.kind !== "video") continue;
            await pushItem(asset.title || asset.id, asset.kind, asset.kind === "image" ? asset.data.storageKey : asset.data.storageKey, asset.kind === "video" ? asset.data.url : asset.data.dataUrl);
        }
    }
    if (wantCanvas) {
        const project = projectId ? canvas.projects.find((p) => p.id === projectId) : canvas.projects[0];
        for (const node of project?.nodes || []) {
            if (items.length >= limit) break;
            const images = node.metadata?.images || [];
            const primary = images.find((img) => img.id === (node.metadata?.primaryImageId || images[0]?.id)) || images[0];
            const kind = node.type === "image" ? "image" : node.type === "video" ? "video" : node.type === "audio" ? "audio" : null;
            if (!kind) continue;
            const storageKey = primary?.storageKey || node.metadata?.storageKey;
            const content = primary?.content || node.metadata?.content || "";
            if (!storageKey && !content) continue;
            await pushItem(node.title || node.id, kind, storageKey, content);
        }
    }

    if (!items.length) throw new Error(siteText("editorNoMedia"));

    // 确保剪辑器页面已打开
    if (!window.location.pathname.startsWith("/editor")) {
        navigate("/editor");
        await waitForEditorFrame();
    }
    const frame = await waitForEditorFrame();

    const imported: Promise<number> = new Promise((resolve, reject) => {
        const onMessage = (event: MessageEvent) => {
            if (event.source !== frame.contentWindow) return;
            if (event.data?.type === "TIMELINE_IMPORT_SUCCESS") {
                window.removeEventListener("message", onMessage);
                resolve(Number(event.data.count) || items.length);
            }
            if (event.data?.type === "TIMELINE_IMPORT_ERROR") {
                window.removeEventListener("message", onMessage);
                reject(new Error(event.data.message || "editor import failed"));
            }
        };
        window.addEventListener("message", onMessage);
        setTimeout(() => {
            window.removeEventListener("message", onMessage);
            reject(new Error(siteText("editorImportTimeout")));
        }, 20000);
        frame.contentWindow?.postMessage({ type: "TIMELINE_IMPORT_MEDIA", items }, "*", items.map((item) => item.buffer));
    });

    const count = await imported;
    return { ok: true, imported: count };
}

function getGithubSyncConfig() {
    const { github, syncProvider } = useConfigStore.getState();
    if (syncProvider !== "github") throw new Error(siteText("githubProviderRequired"));
    if (!github.repo.trim() || !github.pat.trim()) throw new Error(siteText("githubConfigRequired"));
    return github;
}

async function runGithubBackup(input: SiteToolInput) {
    const github = getGithubSyncConfig();
    const includeAssets = input.include_assets !== false;
    const { projects, hydrated } = useCanvasStore.getState();
    const { assets } = useAssetStore.getState();
    if (!hydrated) throw new Error(siteText("assetsLoading"));

    const uploaded: string[] = [];
    const directory = github.directory.trim() || "infinite-canvas";
    const projectsPayload = new Blob([JSON.stringify({ app: "infinite-canvas", version: 1, exportedAt: new Date().toISOString(), projects }, null, 2)], { type: "application/json" });
    await uploadGithubFile(github, `${directory}/backup/projects.json`, projectsPayload, "application/json");
    uploaded.push(`${directory}/backup/projects.json`);

    if (includeAssets) {
        const assetsPayload = new Blob([JSON.stringify({ app: "infinite-canvas", version: 1, exportedAt: new Date().toISOString(), assets }, null, 2)], { type: "application/json" });
        await uploadGithubFile(github, `${directory}/backup/assets.json`, assetsPayload, "application/json");
        uploaded.push(`${directory}/backup/assets.json`);
    }

    void useConfigStore.getState().updateGithubConfig?.("lastSyncedAt", new Date().toISOString());
    return { ok: true, uploaded };
}

function resolveApimartConfig(model?: string) {
    const { config } = useConfigStore.getState();
    const channel = config.channels.find((item) => item.apiFormat === "apimart");
    const requested = typeof model === "string" && model.trim() ? model : config.videoModel || config.model || "";
    const decoded = requested.includes("::") ? requested.split("::").slice(1).join("::") : requested;
    const owningChannel = requested.includes("::") ? config.channels.find((item) => requested.startsWith(`${item.id}::`)) : undefined;
    const active = owningChannel && owningChannel.apiFormat === "apimart" ? owningChannel : channel;
    if (!active || active.apiFormat !== "apimart") throw new Error(siteText("apimartChannelRequired"));
    return { config: { baseUrl: active.baseUrl, apiKey: active.apiKey } as AiConfig, model: decoded };
}

type ApimartBackgroundTask = { taskId: string; model: string; prompt: string; startedAt: number; status: "processing" | "completed" | "failed"; progress: number; url?: string; storageKey?: string; assetId?: string; error?: string };
const apimartBackgroundTasks = new Map<string, ApimartBackgroundTask>();

async function startApimartVideo(input: SiteToolInput) {
    const prompt = String(input.prompt || "").trim();
    if (!prompt) throw new Error(siteText("videoPromptRequired"));
    const { config, model } = resolveApimartConfig(typeof input.model === "string" ? input.model : undefined);
    const seconds = Number(clampVideoSeconds(String(input.seconds ?? "6")));
    const size = typeof input.size === "string" && input.size.trim() ? input.size : undefined;
    const resolution = typeof input.resolution === "string" && input.resolution.trim() ? input.resolution : undefined;
    const generateAudio = typeof input.generateAudio === "boolean" ? input.generateAudio : undefined;

    const taskId = await createApimartVideoTask(config as AiConfig, model, prompt, { seconds, size, resolution, generateAudio });
    const record: ApimartBackgroundTask = { taskId, model, prompt, startedAt: Date.now(), status: "processing", progress: 0 };
    apimartBackgroundTasks.set(taskId, record);

    // 后台轮询到终态：结果视频转存本地并写入「我的资产」，避免临时外链过期
    void (async () => {
        try {
            for (;;) {
                const state = await pollApimartVideoTask(config as AiConfig, taskId);
                if (state.status === "completed" && state.url) {
                    const stored = await uploadMediaFile(state.url, "video");
                    const assetStore = useAssetStore.getState();
                    const assetId = assetStore.addAsset({
                        kind: "video",
                        title: `APIMart ${model} ${new Date().toLocaleString()}`,
                        coverUrl: "",
                        tags: ["apimart", "agent"],
                        source: "APIMart",
                        note: prompt.slice(0, 200),
                        data: { url: stored.url, storageKey: stored.storageKey, width: stored.width || 1280, height: stored.height || 720, bytes: stored.bytes, mimeType: stored.mimeType },
                    });
                    Object.assign(record, { status: "completed", progress: 100, url: stored.url, storageKey: stored.storageKey, assetId });
                    break;
                }
                if (state.status === "failed") {
                    Object.assign(record, { status: "failed", error: state.error });
                    break;
                }
                await resilientDelay(3000);
            }
        } catch (error) {
            Object.assign(record, { status: "failed", error: error instanceof Error ? error.message : String(error) });
        }
    })().catch((error) => console.error("[site-tools] apimart background crashed:", error));

    return { ok: true, taskId, status: "started", pollWith: "apimart_task_status" };
}

function getApimartTaskStatus(input: SiteToolInput) {
    const taskId = String(input.task_id || input.taskId || "");
    const record = apimartBackgroundTasks.get(taskId);
    if (!record) throw new Error(siteText("apimartTaskNotFound"));
    const { taskId: _omit, ...rest } = record;
    return { taskId: record.taskId, ...rest };
}

async function getDepthStatus(input: SiteToolInput) {
    const webgpu = await checkWebGPUAvailability();
    const cached = await isDepthModelCached();
    let prefetchStarted = false;
    if (input.prefetch === true && !cached && webgpu.supported) {
        prefetchStarted = true;
        void getOrFetchDepthModel().catch((error) => console.error("[site-tools] depth prefetch failed:", error));
    }
    return { webgpu: webgpu.supported, adapterName: webgpu.adapterName, webgpuReason: webgpu.reason, cached, prefetchStarted };
}

async function prefetchDepthModel() {
    const webgpu = await checkWebGPUAvailability();
    if (!webgpu.supported) throw new Error(webgpu.reason || "WebGPU unavailable");
    const cached = await isDepthModelCached();
    if (cached) return { ok: true, cached: true, started: false };
    void getOrFetchDepthModel().catch((error) => console.error("[site-tools] depth prefetch failed:", error));
    return { ok: true, cached: false, started: true };
}
