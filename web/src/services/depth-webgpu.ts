/**
 * 纯前端 WebGPU Depth-Anything-V2-Small 深度提取能力调度封装
 *
 * 核心设计：
 * 1. 权重源优先采用国内 ModelScope（魔搭社区）镜像，规避 Hugging Face 国内不可达/限速问题；
 * 2. 运行时缓存双保险：通过 CacheStorage (`depth-anything-v2-cache-v1`) 本地持久化，加载前严格优先查本地，
 *    已缓存时秒级离线加载，不重复消耗流量；
 * 3. 运行环境探测：检测 navigator.gpu（WebGPU）可用性并提供优雅降级建议。
 */

export const DEPTH_MODEL_NAME = "Depth-Anything-V2-Small (Q4F16)";
export const DEPTH_CACHE_NAME = "depth-anything-v2-cache-v1";

// 魔搭社区 (ModelScope) 官方权重直链
export const MODELSCOPE_MODEL_URL =
    "https://www.modelscope.cn/models/martindelophy/timeline-studio-onnx-models/resolve/4cc757f80330e22cb8f82b628c53ceca6307fd12/depth-anything-v2-small/onnx/model_q4f16.onnx";

// Hugging Face 备用镜像源
export const HUGGINGFACE_MODEL_URL =
    "https://huggingface.co/haixin/timeline-studio-onnx-models/resolve/a0806c6fb9484894dcb78df523156d244461515d/depth-anything-v2-small/onnx/model_q4f16.onnx";

export type ModelDownloadProgress = {
    loaded: number;
    total: number;
    percent: number;
    fromCache: boolean;
};

/**
 * 检查当前设备与浏览器是否原生支持 WebGPU 推理加速
 */
export async function checkWebGPUAvailability(): Promise<{ supported: boolean; adapterName?: string; reason?: string }> {
    if (typeof navigator === "undefined" || !("gpu" in navigator) || !navigator.gpu) {
        return { supported: false, reason: "当前浏览器或系统不支持 WebGPU，建议使用最新版 Chrome、Edge 或启用硬件加速。" };
    }
    try {
        const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
        const adapter = await gpu?.requestAdapter();
        if (!adapter) {
            return { supported: false, reason: "未找到可用的 GPU 适配器或硬件加速被禁用。" };
        }
        const info = await (adapter as { requestAdapterInfo?: () => Promise<{ description?: string; vendor?: string }> }).requestAdapterInfo?.().catch(() => null);
        const name = info?.description || info?.vendor || "WebGPU Compatible Hardware";
        return { supported: true, adapterName: name };
    } catch (err) {
        return { supported: false, reason: `WebGPU 探测失败: ${err instanceof Error ? err.message : String(err)}` };
    }
}

/**
 * 检查本地 CacheStorage 是否已有已下载好的 Depth-Anything 模型
 */
export async function isDepthModelCached(): Promise<boolean> {
    if (typeof caches === "undefined") return false;
    try {
        const cache = await caches.open(DEPTH_CACHE_NAME);
        const matched = await cache.match(MODELSCOPE_MODEL_URL);
        return Boolean(matched);
    } catch {
        return false;
    }
}

/**
 * 获取 Depth-Anything 模型权重文件（优先从本地 CacheStorage 读取，未缓存则从魔搭下载并持久化入库）
 */
export async function getOrFetchDepthModel(onProgress?: (progress: ModelDownloadProgress) => void): Promise<ArrayBuffer> {
    if (typeof caches === "undefined") {
        throw new Error("当前环境不支持 CacheStorage 存储。");
    }

    const cache = await caches.open(DEPTH_CACHE_NAME);

    // 1. 本地优先：检查是否命中缓存
    const cachedResponse = await cache.match(MODELSCOPE_MODEL_URL);
    if (cachedResponse) {
        onProgress?.({ loaded: 1, total: 1, percent: 100, fromCache: true });
        return await cachedResponse.arrayBuffer();
    }

    // 2. 从魔搭下载
    let response: Response;
    try {
        response = await fetch(MODELSCOPE_MODEL_URL);
        if (!response.ok) throw new Error(`ModelScope responded ${response.status}`);
    } catch {
        // 降级尝试 Hugging Face 镜像
        response = await fetch(HUGGINGFACE_MODEL_URL);
        if (!response.ok) throw new Error(`Model mirrors download failed (${response.status})`);
    }

    const total = Number(response.headers.get("content-length")) || 19_126_267;
    const reader = response.body?.getReader();
    if (!reader) {
        const buf = await response.arrayBuffer();
        await cache.put(MODELSCOPE_MODEL_URL, new Response(buf));
        onProgress?.({ loaded: total, total, percent: 100, fromCache: false });
        return buf;
    }

    let loaded = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            loaded += value.length;
            const percent = Math.min(100, Math.round((loaded / total) * 100));
            onProgress?.({ loaded, total, percent, fromCache: false });
        }
    }

    // 合并二进制
    const merged = new Uint8Array(loaded);
    let offset = 0;
    for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
    }

    // 持久化入本地缓存
    await cache.put(MODELSCOPE_MODEL_URL, new Response(merged.buffer));
    return merged.buffer;
}

/**
 * 清除本地下载的深度模型缓存以释放空间
 */
export async function clearDepthModelCache(): Promise<void> {
    if (typeof caches !== "undefined") {
        await caches.delete(DEPTH_CACHE_NAME).catch(() => false);
    }
}
