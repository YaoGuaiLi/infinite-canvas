import i18n from "@/i18n";
import { nanoid } from "nanoid";
import { dataUrlToFile } from "@/lib/image-utils";
import { imageToDataUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import type { AiConfig } from "@/stores/use-config-store";

/**
 * APIMart (https://api.apimart.ai) channel adapter.
 *
 * APIMart is a task-based gateway: image/video requests return a `task_id`
 * which the client polls at `/tasks/{id}?language=zh` until the result is
 * ready. Reference images must be uploaded to `/uploads/images` first so they
 * become public URLs. Request/response normalization ports the model-specific
 * rules from tigerowo's Go implementation (apimart_image.go / apimart_video.go).
 */

const APIMART_REQUEST_TIMEOUT_MS = 120000;
const APIMART_POLL_INTERVAL_MS = 2000;
const APIMART_MAX_POLL_ATTEMPTS = 300;

const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

type ApimartInputConfig = {
    aspectField: string;
    durationField: string;
    hasResolution: boolean;
    resolutionCase: string;
    maxResolution: string;
    minResolution: string;
    hasCount: boolean;
    hasQuality: boolean;
    maxImageRefs: number;
    hasOutput: boolean;
    modeFromRes: boolean;
    dropAspectWithImage: boolean;
    imageRefField: string;
    imageRefKind: string;
    videoRefField: string;
    videoRefKind: string;
    audioRefField: string;
    audioRefKind: string;
};

type ApimartPayload = Record<string, unknown>;

function defaultConfig(): ApimartInputConfig {
    return {
        aspectField: "size",
        durationField: "duration",
        hasResolution: true,
        resolutionCase: "upper",
        maxResolution: "",
        minResolution: "",
        hasCount: true,
        hasQuality: false,
        maxImageRefs: 0,
        hasOutput: false,
        modeFromRes: false,
        dropAspectWithImage: false,
        imageRefField: "image_urls",
        imageRefKind: "array",
        videoRefField: "",
        videoRefKind: "",
        audioRefField: "",
        audioRefKind: "",
    };
}

function defaultVideoConfig(): ApimartInputConfig {
    return {
        ...defaultConfig(),
        aspectField: "aspect_ratio",
        durationField: "duration",
        resolutionCase: "video",
    };
}

function normalizeModelName(modelName: string) {
    return modelName.trim().toLowerCase().replaceAll("_", "-").replaceAll(".", "-");
}

function imageConfig(modelName: string): ApimartInputConfig {
    const model = normalizeModelName(modelName);
    const config = defaultConfig();
    if (model.includes("gpt-image-2") && model.includes("official")) {
        config.resolutionCase = "lower";
        config.hasQuality = true;
        config.hasOutput = true;
    } else if (model.includes("gpt-image-2")) {
        config.resolutionCase = "lower";
        config.hasQuality = true;
    } else if (model.includes("gpt-4o-image") || model.includes("gpt-image-1")) {
        config.hasResolution = false;
        if (model.includes("gpt-image-1")) {
            config.hasQuality = true;
            config.hasOutput = true;
        }
    } else if (model.includes("gemini-3-1-flash-lite")) {
        config.maxResolution = "1K";
    } else if (model.includes("gemini-3-1") || model.includes("nano-banana2")) {
        config.hasCount = false;
    } else if (model.includes("gemini-3-pro") || model.includes("nano-banana-pro")) {
        config.hasCount = false;
    } else if (model.includes("gemini-2-5") || model.includes("nano-banana")) {
        config.maxResolution = "1K";
        config.hasCount = false;
    } else if (model.includes("imagen")) {
        config.hasResolution = false;
        config.hasQuality = false;
        config.hasCount = false;
        config.imageRefField = "";
    } else if (model.includes("seedream-5-0-pro")) {
        config.maxResolution = "2K";
        config.hasCount = false;
        config.maxImageRefs = 10;
    } else if (model.includes("seedream-5")) {
        config.minResolution = "2K";
        config.hasOutput = true;
    } else if (model.includes("seedream-4-5") || model.includes("seedance-4-5")) {
        config.minResolution = "2K";
    } else if (model.includes("seedream") || model.includes("seedance-4")) {
        // default upper-case resolution
    } else if (model.includes("qwen") || model.includes("z-image")) {
        config.maxResolution = "2K";
        if (model.includes("z-image")) {
            config.hasCount = false;
            config.imageRefField = "";
        }
    } else if (model.includes("grok-imagine")) {
        config.hasResolution = false;
    } else if (model.includes("flux-2")) {
        config.hasCount = false;
    }
    return config;
}

function videoConfig(modelName: string): ApimartInputConfig {
    const model = normalizeModelName(modelName);
    const config = defaultVideoConfig();
    switch (true) {
        case model.includes("doubao-seedance-2"):
            config.aspectField = "size";
            config.imageRefKind = "seedance2";
            config.videoRefField = "video_urls";
            config.videoRefKind = "array";
            config.audioRefField = "audio_urls";
            config.audioRefKind = "array";
            break;
        case model.includes("doubao-seedance-1-0"):
        case model.includes("doubao-seedance-1-5") || model.includes("seedance-1"):
            config.imageRefField = "image_with_roles";
            config.imageRefKind = "roles";
            break;
        case model.includes("sora-2-pro"):
            config.dropAspectWithImage = true;
            config.maxImageRefs = 1;
            break;
        case model.includes("sora-2"):
            config.maxResolution = "720p";
            config.dropAspectWithImage = true;
            config.maxImageRefs = 1;
            break;
        case model.includes("veo") && model.includes("official"):
            config.imageRefField = "first_frame_image";
            config.imageRefKind = "first_last";
            break;
        case model === "minimax-h3":
            config.imageRefKind = "minimax_h3";
            config.videoRefField = "video_urls";
            config.videoRefKind = "array";
            config.audioRefField = "audio_urls";
            config.audioRefKind = "array";
            break;
        case model.includes("minimax-hailuo-2-3"):
            config.aspectField = "";
            config.imageRefField = "first_frame_image";
            config.imageRefKind = "first_only";
            break;
        case model.includes("minimax") || model.includes("hailuo"):
            config.aspectField = "";
            config.imageRefField = "first_frame_image";
            config.imageRefKind = "first_last";
            break;
        case model === "kling-3-0-turbo":
            config.imageRefField = "first_frame_image";
            config.imageRefKind = "first_only";
            config.dropAspectWithImage = true;
            break;
        case model.includes("happyhorse-1-1"):
            config.aspectField = "size";
            config.resolutionCase = "upper_video";
            config.imageRefKind = "happyhorse11";
            break;
        case model.includes("happyhorse"):
            config.aspectField = "size";
            config.resolutionCase = "upper_video";
            config.imageRefKind = "happyhorse";
            config.videoRefField = "video_url";
            config.videoRefKind = "single";
            break;
        case model.includes("gemini-omni-flash-preview"):
            config.maxResolution = "720p";
            config.videoRefField = "video_urls";
            config.videoRefKind = "array";
            break;
        case model.includes("wan2-7-r2v") || model.includes("wan2.7-r2v"):
            config.aspectField = "size";
            config.resolutionCase = "upper_video";
            config.imageRefField = "image_with_roles";
            config.imageRefKind = "roles";
            config.videoRefField = "video_urls";
            config.videoRefKind = "array";
            break;
        case model.includes("wan2-7-videoedit") || model.includes("wan2.7-videoedit"):
            config.aspectField = "size";
            config.resolutionCase = "upper_video";
            config.videoRefField = "video_urls";
            config.videoRefKind = "array";
            break;
        case model.includes("wan2-7") || model.includes("wan2.7"):
            config.aspectField = "size";
            config.resolutionCase = "upper_video";
            config.imageRefField = "image_with_roles";
            config.imageRefKind = "roles";
            config.videoRefField = "video_urls";
            config.videoRefKind = "array";
            config.audioRefField = "audio_url";
            config.audioRefKind = "single";
            break;
        case model.includes("wan2-6-i2v-flash") || model.includes("wan2.6-i2v-flash"):
            config.aspectField = "";
            config.audioRefField = "audio_url";
            config.audioRefKind = "single";
            break;
        case model.includes("wan2-5") || model.includes("wan2.5"):
            config.aspectField = "size";
            config.dropAspectWithImage = true;
            config.audioRefField = "audio_url";
            config.audioRefKind = "single";
            break;
        case model.includes("wan2-6") || model.includes("wan2.6"):
            config.dropAspectWithImage = true;
            config.audioRefField = "audio_url";
            config.audioRefKind = "single";
            break;
        case model.includes("kling-v2-6-motion") || model.includes("motion-control"):
            config.aspectField = "";
            config.hasResolution = false;
            config.imageRefField = "image_url";
            config.imageRefKind = "single";
            config.videoRefField = "video_url";
            config.videoRefKind = "single";
            break;
        case model.includes("kling-v2-6") || model.includes("kling-2-6"):
            config.hasResolution = false;
            config.imageRefKind = "array_frames";
            break;
        case model === "kling-v3":
            config.hasResolution = false;
            config.imageRefKind = "array_frames";
            break;
        case model.includes("kling-v3-omni") || model.includes("kling-video-o1"):
            config.hasResolution = false;
            config.modeFromRes = true;
            config.videoRefField = "video_list";
            config.videoRefKind = "kling_video_list";
            break;
        case model.includes("kling"):
            config.hasResolution = false;
            config.modeFromRes = true;
            break;
        case model.includes("vidu"):
            config.dropAspectWithImage = model !== "viduq3" && model !== "viduq3-mix";
            config.imageRefKind = "array_frames";
            break;
        case model.includes("grok-imagine"):
            config.aspectField = "size";
            config.hasResolution = false;
            config.hasQuality = true;
            break;
        case model.includes("pixverse"):
            config.aspectField = "size";
            config.imageRefKind = "pixverse";
            break;
        case model.includes("omni-flash"):
            config.videoRefField = "video_urls";
            config.videoRefKind = "array";
            break;
        case model.includes("flux-3-video"):
            config.maxImageRefs = 10;
            config.videoRefField = "video_url";
            config.videoRefKind = "single";
            break;
        default:
            break;
    }
    return config;
}

// ---------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------

function firstNonEmpty(...values: Array<string | undefined | null>): string {
    for (const value of values) {
        if (value !== undefined && value !== null && value.trim() !== "") return value;
    }
    return "";
}

function toText(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return "";
    }
}

function isEmpty(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
    return false;
}

function toInt(value: unknown): number {
    if (typeof value === "number") return Math.trunc(value);
    const parsed = parseInt(toText(value), 10);
    return Number.isFinite(parsed) ? parsed : -1;
}

function parseSize(value: string): { width: number; height: number } | null {
    const text = value.trim().toLowerCase();
    const parts = text.split(text.includes("*") ? "*" : "x");
    if (parts.length !== 2) return null;
    const width = parseInt(parts[0].trim(), 10);
    const height = parseInt(parts[1].trim(), 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return { width, height };
}

const RATIO_TABLE: Array<{ width: number; height: number; ratio: string }> = [
    { width: 1, height: 1, ratio: "1:1" },
    { width: 2, height: 1, ratio: "2:1" },
    { width: 1, height: 2, ratio: "1:2" },
    { width: 3, height: 1, ratio: "3:1" },
    { width: 1, height: 3, ratio: "1:3" },
    { width: 5, height: 4, ratio: "5:4" },
    { width: 4, height: 5, ratio: "4:5" },
    { width: 16, height: 9, ratio: "16:9" },
    { width: 9, height: 16, ratio: "9:16" },
    { width: 4, height: 3, ratio: "4:3" },
    { width: 3, height: 4, ratio: "3:4" },
    { width: 3, height: 2, ratio: "3:2" },
    { width: 2, height: 3, ratio: "2:3" },
    { width: 21, height: 9, ratio: "21:9" },
    { width: 9, height: 21, ratio: "9:21" },
];

function normalizeRatio(value: string): string {
    const text = value.trim().toLowerCase();
    if (!text || text === "auto") return "auto";
    const size = parseSize(text);
    if (size) {
        for (const item of RATIO_TABLE) {
            const diff = Math.abs(size.width * item.height - size.height * item.width);
            if (diff * 100 <= size.width * item.height * 4) return item.ratio;
        }
    }
    return text;
}

function sizeResolution(value: string): string {
    const size = parseSize(value);
    if (!size) return "";
    const longSide = Math.max(size.width, size.height);
    if (longSide >= 3500) return "4K";
    if (longSide >= 1700) return "2K";
    if (longSide >= 900) return "1K";
    return "";
}

function qualityResolution(value: string): string {
    switch (value.trim().toLowerCase()) {
        case "low":
        case "standard":
            return "1K";
        case "medium":
        case "hd":
            return "2K";
        case "high":
        case "uhd":
            return "4K";
        default:
            return "";
    }
}

function resolutionLevel(value: string): number {
    switch (value.trim().toLowerCase()) {
        case "0.5":
        case "0.5k":
        case "512":
        case "512p":
        case "1":
        case "1k":
        case "1024":
        case "1024p":
        case "low":
        case "standard":
            return 1;
        case "2":
        case "2k":
        case "2048":
        case "2048p":
        case "medium":
        case "hd":
            return 2;
        case "3":
        case "3k":
        case "3072":
            return 3;
        case "4":
        case "4k":
        case "4096":
        case "4096p":
        case "high":
        case "uhd":
            return 4;
        default:
            return 0;
    }
}

function clampImageResolution(value: string, config: ApimartInputConfig): string {
    let level = resolutionLevel(value);
    if (level === 0) return value;
    const maxLevel = resolutionLevel(config.maxResolution);
    const minLevel = resolutionLevel(config.minResolution);
    if (maxLevel && level > maxLevel) level = maxLevel;
    if (minLevel && level < minLevel) level = minLevel;
    return ["", "1K", "2K", "3K", "4K"][level] || value;
}

function normalizeImageResolution(value: string, mode: string): string {
    let text = value.trim().toLowerCase();
    text = text.endsWith("px") ? text.slice(0, -2) : text;
    const map: Record<string, string> = {
        "0.5": "0.5k", "0.5k": "0.5k", "512": "0.5k", "512p": "0.5k",
        "1": "1k", "1k": "1k", "1024": "1k", "1024p": "1k", "low": "1k", "standard": "1k",
        "2": "2k", "2k": "2k", "2048": "2k", "2048p": "2k", "medium": "2k", "hd": "2k",
        "3": "3k", "3k": "3k", "3072": "3k",
        "4": "4k", "4k": "4k", "4096": "4k", "4096p": "4k", "high": "4k", "uhd": "4k",
    };
    const normalized = map[text] || text;
    return mode === "lower" ? normalized : normalized.toUpperCase();
}

function normalizeVideoResolution(value: string, maxResolution = ""): string {
    const text = value.trim().toLowerCase();
    const map: Record<string, string> = {
        "480": "480p", "480p": "480p", "sd": "480p", "low": "480p",
        "512": "512p", "512p": "512p",
        "540": "540p", "540p": "540p",
        "720": "720p", "720p": "720p", "hd": "720p", "medium": "720p", "standard": "720p",
        "768": "768p", "768p": "768p",
        "1080": "1080p", "1080p": "1080p", "fhd": "1080p", "high": "1080p", "pro": "1080p",
        "2160": "4k", "2160p": "4k", "4k": "4k", "uhd": "4k",
        "360": "360p", "360p": "360p",
    };
    const normalized = map[text] || text;
    if (maxResolution === "720p" && (normalized === "1080p" || normalized === "4k")) return "720p";
    return normalized;
}

function normalizeOutputFormat(value: string): string {
    const text = value.trim().toLowerCase();
    return text === "jpg" ? "jpeg" : text;
}

function normalizeAspect(payload: ApimartPayload, config: ApimartInputConfig) {
    if (!config.aspectField) {
        delete payload.size;
        delete payload.ratio;
        delete payload.aspect_ratio;
        return;
    }
    const value = firstNonEmpty(toText(payload[config.aspectField]), toText(payload.size), toText(payload.aspect_ratio), toText(payload.ratio), toText(payload.image_size));
    if (value) payload[config.aspectField] = normalizeRatio(value);
    if (config.aspectField !== "size") delete payload.size;
    if (config.aspectField !== "aspect_ratio") delete payload.aspect_ratio;
    delete payload.ratio;
    delete payload.image_size;
}

function normalizeResolution(payload: ApimartPayload, config: ApimartInputConfig) {
    if (!config.hasResolution) {
        if (!config.hasQuality) {
            delete payload.resolution;
            delete payload.resolution_name;
        }
        delete payload.image_resolution;
        return;
    }
    let value = firstNonEmpty(toText(payload.resolution), toText(payload.resolution_name), toText(payload.image_resolution));
    if (config.resolutionCase !== "video" && config.resolutionCase !== "upper_video") {
        value = firstNonEmpty(value, sizeResolution(toText(payload.size)), qualityResolution(toText(payload.quality)));
    }
    if (value) {
        if (config.resolutionCase === "video") {
            payload.resolution = normalizeVideoResolution(value, config.maxResolution);
        } else if (config.resolutionCase === "upper_video") {
            payload.resolution = normalizeVideoResolution(value, config.maxResolution).toUpperCase();
        } else {
            payload.resolution = normalizeImageResolution(clampImageResolution(value, config), config.resolutionCase);
        }
    }
    delete payload.image_resolution;
    delete payload.resolution_name;
}

function normalizeCount(payload: ApimartPayload, config: ApimartInputConfig) {
    if (!config.hasCount) {
        delete payload.n;
        delete payload.num_images;
        delete payload.max_images;
        delete payload.actual_image_count;
        return;
    }
    const value = firstNonEmpty(toText(payload.n), toText(payload.num_images), toText(payload.max_images), toText(payload.actual_image_count));
    if (value) payload.n = toInt(value);
    delete payload.num_images;
    delete payload.max_images;
    delete payload.actual_image_count;
}

function normalizeImageQuality(payload: ApimartPayload, config: ApimartInputConfig) {
    if (config.hasQuality) {
        const value = toText(payload.quality).trim();
        if (value) payload.quality = value.toLowerCase();
    } else {
        delete payload.quality;
    }
    if (config.hasOutput) {
        const value = firstNonEmpty(toText(payload.output_format), toText(payload.format));
        if (value) payload.output_format = normalizeOutputFormat(value);
    } else {
        delete payload.output_format;
    }
    delete payload.format;
}

function normalizeVideoQuality(payload: ApimartPayload, config: ApimartInputConfig) {
    if (!config.hasQuality) return;
    const value = firstNonEmpty(toText(payload.quality), toText(payload.resolution), toText(payload.resolution_name));
    if (value) payload.quality = normalizeVideoResolution(value, config.maxResolution);
    delete payload.resolution;
    delete payload.resolution_name;
}

function normalizeDuration(payload: ApimartPayload, config: ApimartInputConfig) {
    if (!config.durationField) {
        delete payload.duration;
        delete payload.seconds;
        return;
    }
    const value = firstNonEmpty(toText(payload[config.durationField]), toText(payload.duration), toText(payload.seconds));
    if (value) payload[config.durationField] = toInt(value);
    if (config.durationField !== "duration") delete payload.duration;
    delete payload.seconds;
}

function normalizeVideoMode(payload: ApimartPayload, config: ApimartInputConfig) {
    if (!config.modeFromRes) return;
    let mode = toText(payload.mode).trim().toLowerCase();
    if (!mode || mode === "normal") {
        const resolution = normalizeVideoResolution(firstNonEmpty(toText(payload.resolution), toText(payload.resolution_name)));
        mode = resolution === "1080p" || resolution === "4k" ? "pro" : "std";
    }
    payload.mode = mode;
}

function applyVideoDefaults(payload: ApimartPayload, modelName: string) {
    const model = normalizeModelName(modelName);
    if (model === "doubao-seedance-2.5") {
        const resolution = toText(payload.resolution).trim().toLowerCase();
        if (["1080p", "1080", "2k", "4k"].includes(resolution)) payload.resolution = "720p";
        if (!isEmpty(payload.duration)) {
            const duration = toInt(payload.duration);
            if (duration > -1) payload.duration = Math.max(4, Math.min(30, duration));
        }
    }
    if (model === "flux-3-video") {
        const resolution = toText(payload.resolution).trim().toLowerCase();
        if (["360p", "360", "480p", "480"].includes(resolution)) payload.resolution = "720p";
        if (!isEmpty(payload.duration)) {
            const duration = toInt(payload.duration);
            if (duration > -1) payload.duration = Math.max(5, Math.min(20, duration));
        }
    }
    if (model === "minimax-h3") {
        const resolution = toText(payload.resolution);
        payload.resolution = ["480p", "720p", "768p"].includes(resolution) ? "768P" : "2K";
        if (!isEmpty(payload.duration)) {
            const duration = toInt(payload.duration);
            if (duration > -1) payload.duration = Math.max(4, Math.min(15, duration));
        }
    }
    if (model.includes("wan2-5") && isEmpty(payload.audio)) {
        payload.audio = true;
    }
    if (model.includes("motion-control")) {
        if (isEmpty(payload.character_orientation)) payload.character_orientation = "image";
        if (isEmpty(payload.mode)) payload.mode = "std";
        if (isEmpty(payload.keep_original_sound)) payload.keep_original_sound = "yes";
    }
}

function applyVideoGenerateAudio(payload: ApimartPayload, modelName: string) {
    if (!("video_generate_audio" in payload)) return;
    const enabled = payload.video_generate_audio === true || payload.video_generate_audio === "true";
    delete payload.video_generate_audio;
    const model = normalizeModelName(modelName);
    if (model.includes("doubao-seedance-2") || (model.includes("veo") && model.includes("official"))) {
        payload.generate_audio = enabled;
    } else if (model.includes("doubao-seedance-1-5") || model.includes("seedance-1-5")) {
        payload.audio = enabled;
    } else if (model === "wan2-6" || model === "wan2-6-i2v-flash" || model.includes("kling-v3") || model.includes("pixverse") || model.includes("vidu") || model.includes("kling-v2-6")) {
        payload.audio = enabled;
    }
}

function requireAnyInput(payload: ApimartPayload, fields: string[]): boolean {
    return fields.some((field) => !isEmpty(payload[field]));
}

function validateImageInputs(payload: ApimartPayload, modelName: string): string | null {
    const model = normalizeModelName(modelName);
    if (model.includes("grok-imagine") && model.includes("edit") && !requireAnyInput(payload, ["image_urls"])) {
        return apiText("apimartReferenceRequired");
    }
    return null;
}

function validateVideoInputs(payload: ApimartPayload, modelName: string): string | null {
    const model = normalizeModelName(modelName);
    switch (true) {
        case model === "kling-3-0-turbo":
            return requireAnyInput(payload, ["prompt", "first_frame_image"]) ? null : apiText("apimartReferenceRequired");
        case model === "happyhorse-1-1": {
            const imageUrls = collectReferenceStrings(payload.image_urls);
            if (imageUrls.length > 9) return apiText("apimartTooManyReferences");
            return requireAnyInput(payload, ["prompt", "first_frame_image", "image_urls"]) ? null : apiText("apimartReferenceRequired");
        }
        case model.includes("motion-control"):
            return isEmpty(payload.image_url) || isEmpty(payload.video_url) ? apiText("apimartReferenceRequired") : null;
        case model.includes("minimax-hailuo-2-3-fast"):
            return requireAnyInput(payload, ["first_frame_image"]) ? null : apiText("apimartReferenceRequired");
        case model.includes("wan2-7-videoedit") || model.includes("wan2.7-videoedit"):
            return requireAnyInput(payload, ["video_urls"]) ? null : apiText("apimartReferenceRequired");
        case model.includes("wan2-7-r2v") || model.includes("wan2.7-r2v"):
            return requireAnyInput(payload, ["image_with_roles", "video_urls"]) ? null : apiText("apimartReferenceRequired");
        case model.includes("wan2-6-i2v-flash") || model.includes("wan2.6-i2v-flash"):
            return requireAnyInput(payload, ["image_urls"]) ? null : apiText("apimartReferenceRequired");
        case model === "viduq3" || model === "viduq3-mix":
            return requireAnyInput(payload, ["image_urls"]) ? null : apiText("apimartReferenceRequired");
        default:
            return null;
    }
}

// ---------------------------------------------------------------------------
// Reference handling
// ---------------------------------------------------------------------------

function collectReferenceStrings(value: unknown): string[] {
    if (value === undefined || value === null) return [];
    if (typeof value === "string") return value.trim() ? [value.trim()] : [];
    if (Array.isArray(value)) return value.flatMap((item) => collectReferenceStrings(item));
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of ["url", "image_url", "imageUrl", "video_url", "videoUrl", "download_url", "downloadUrl"]) {
            const text = toText(record[key]).trim();
            if (text) return [text];
        }
        return Object.values(record).flatMap((item) => collectReferenceStrings(item));
    }
    const text = toText(value).trim();
    return text ? [text] : [];
}

function isImageReference(value: string): boolean {
    return /\.(png|jpe?g|webp|gif|bmp)(\?|#|$)/i.test(new URL(value, "https://x").pathname) || /^https?:\/\/.+\/image/i.test(value);
}

function isVideoReference(value: string): boolean {
    return /\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i.test(new URL(value, "https://x").pathname);
}

function isAudioReference(value: string): boolean {
    return /\.(mp3|wav|m4a|aac|ogg|flac)(\?|#|$)/i.test(new URL(value, "https://x").pathname);
}

async function uploadReferenceImage(baseUrl: string, apiKey: string, dataUrl: string): Promise<string> {
    const file = dataUrlToFile({ id: "reference", name: "reference", type: "image", dataUrl });
    const form = new FormData();
    form.append("file", file, "reference." + (file.type.includes("png") ? "png" : file.type.includes("jpeg") ? "jpg" : file.type.includes("webp") ? "webp" : "png"));
    const response = await apimartFetch(baseUrl, "/uploads/images", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            ...(file.type ? { "Content-Type": "multipart/form-data" } : {}),
        },
        body: form,
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(apiText("apimartUploadFailed", { detail: readErrorBody(body, response.status) }));
    }
    const result = (await response.json().catch(() => null)) as { url?: string } | null;
    const url = result?.url?.trim();
    if (!url) throw new Error(apiText("apimartUploadNoUrl"));
    return url;
}

async function normalizeReferenceUrls(baseUrl: string, apiKey: string, references: ReferenceImage[]): Promise<string[]> {
    const urls: string[] = [];
    for (const image of references) {
        const dataUrl = image.dataUrl?.trim() || (await imageToDataUrl(image).catch(() => "")).trim();
        if (!dataUrl) continue;
        if (/^https?:\/\//i.test(dataUrl)) {
            urls.push(dataUrl);
            continue;
        }
        if (/^data:/i.test(dataUrl) || /^blob:/i.test(dataUrl)) {
            urls.push(await uploadReferenceImage(baseUrl, apiKey, dataUrl));
            continue;
        }
        urls.push(dataUrl);
    }
    return urls;
}

function setImageReference(payload: ApimartPayload, config: ApimartInputConfig, values: string[]) {
    const field = config.imageRefField || "image_urls";
    if (!field || values.length === 0) return;
    const limited = config.maxImageRefs > 0 ? values.slice(0, config.maxImageRefs) : values;
    switch (config.imageRefKind) {
        case "first_only":
            payload.first_frame_image = limited[0];
            break;
        case "first_last":
            payload[field] = limited[0];
            if (limited.length > 1) payload.last_frame_image = limited[1];
            break;
        case "single":
            payload[field] = limited[0];
            break;
        case "array_frames":
            payload.image_urls = limited;
            break;
        case "roles":
            payload.image_with_roles = limited.map((url) => ({ image_url: url, role: "subject" }));
            break;
        case "minimax_h3":
        case "seedance2":
        case "array":
        default:
            payload[field] = mergeStringValues(payload[field], limited);
            break;
    }
}

function setVideoReference(payload: ApimartPayload, config: ApimartInputConfig, values: string[]) {
    const field = config.videoRefField || "video_urls";
    if (!field || values.length === 0) return;
    if (config.videoRefKind === "single") {
        payload[field] = values[0];
    } else {
        payload[field] = mergeStringValues(payload[field], values);
    }
}

function setAudioReference(payload: ApimartPayload, config: ApimartInputConfig, values: string[]) {
    const field = config.audioRefField || "audio_urls";
    if (!field || values.length === 0) return;
    if (config.audioRefKind === "single") {
        payload[field] = values[0];
    } else {
        payload[field] = mergeStringValues(payload[field], values);
    }
}

function mergeStringValues(existing: unknown, values: string[]): string[] {
    const current = collectReferenceStrings(existing);
    const seen = new Set(current);
    for (const value of values) {
        if (!seen.has(value)) {
            current.push(value);
            seen.add(value);
        }
    }
    return current;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function apimartFetch(baseUrl: string, path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), APIMART_REQUEST_TIMEOUT_MS);
    try {
        return await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, { ...init, signal: controller.signal });
    } finally {
        window.clearTimeout(timer);
    }
}

function readErrorBody(body: string, status: number): string {
    try {
        const parsed = JSON.parse(body) as { msg?: string; message?: string; error?: { message?: string } | string };
        const error = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
        return error || parsed.msg || parsed.message || `${apiText("requestFailed")}（${status}）`;
    } catch {
        return body.slice(0, 200) || `${apiText("requestFailed")}（${status}）`;
    }
}

async function apimartJson(baseUrl: string, apiKey: string, path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
    const response = await apimartFetch(baseUrl, path, {
        ...init,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...init.headers,
        },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(readErrorBody(JSON.stringify(body), response.status));
    return { status: response.status, body };
}

type ApimartTaskResult = {
    taskId: string;
    status: string;
};

function readCreateTask(body: unknown): ApimartTaskResult | null {
    const record = (body || {}) as { code?: number; data?: Array<{ task_id?: string; status?: string }> };
    if (record.code !== undefined && record.code !== 200 && record.code !== 0) {
        throw new Error(readErrorBody(JSON.stringify(body), 200));
    }
    const item = record.data?.[0];
    if (!item || !item.task_id) return null;
    return { taskId: item.task_id, status: item.status || "" };
}

function normalizeTaskStatus(status: string): string {
    const text = status.trim().toLowerCase();
    if (["submitted", "pending", "processing", "running", "queued"].includes(text)) return "processing";
    if (["completed", "success", "succeeded"].includes(text)) return "completed";
    if (["failed", "cancelled", "canceled"].includes(text)) return "failed";
    return text || "processing";
}

function collectUrls(value: unknown, depth = 0): string[] {
    if (depth > 6 || value === undefined || value === null) return [];
    if (typeof value === "string") {
        const text = value.trim();
        if (/^https?:\/\//i.test(text)) return [text];
        try {
            return collectUrls(JSON.parse(text), depth + 1);
        } catch {
            return [];
        }
    }
    if (Array.isArray(value)) return value.flatMap((item) => collectUrls(item, depth + 1));
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        const result: string[] = [];
        for (const key of ["images", "image", "url", "urls", "image_url", "imageUrl", "video_url", "videoUrl", "download_url", "downloadUrl", "output_url", "outputUrl", "data", "result", "videos", "video"]) {
            result.push(...collectUrls(record[key], depth + 1));
        }
        return result;
    }
    return [];
}

function uniqueUrls(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const text = value.trim();
        if (text && /^https?:\/\//i.test(text) && !seen.has(text)) {
            seen.add(text);
            result.push(text);
        }
    }
    return result;
}

function readTaskResult(body: unknown): { status: string; progress: number; urls: string[]; error?: string } {
    const record = (body || {}) as {
        code?: number;
        data?: {
            status?: string;
            progress?: number;
            result?: Record<string, unknown> | null;
            error?: { message?: string } | null;
        };
        msg?: string;
    };
    if (record.code !== undefined && record.code !== 200 && record.code !== 0) {
        throw new Error(record.msg || apiText("apimartTaskQueryFailed"));
    }
    const data = record.data || {};
    const status = normalizeTaskStatus(data.status || "");
    const urls = uniqueUrls(collectUrls(data.result));
    const error = data.error?.message || (urls.length === 0 && status === "failed" ? record.msg || apiText("apimartTaskFailed") : undefined);
    return { status, progress: data.progress || 0, urls, error };
}

async function pollTask(baseUrl: string, apiKey: string, taskId: string, signal?: AbortSignal): Promise<{ status: string; urls: string[]; error?: string }> {
    for (let attempt = 0; attempt < APIMART_MAX_POLL_ATTEMPTS; attempt += 1) {
        if (attempt > 0) {
            await delay(APIMART_POLL_INTERVAL_MS, signal);
        }
        const { body } = await apimartJson(baseUrl, apiKey, `/tasks/${encodeURIComponent(taskId)}?language=zh`);
        const result = readTaskResult(body);
        if (result.status === "completed") return { status: "completed", urls: result.urls };
        if (result.error || result.status === "failed") return { status: "failed", urls: [], error: result.error || apiText("apimartTaskFailed") };
    }
    throw new Error(apiText("apimartTaskTimeout"));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ApimartImageInput = {
    model: string;
    prompt: string;
    n: number;
    size?: string;
    quality?: string;
    background?: string;
    references: ReferenceImage[];
    isEdit: boolean;
    mask?: ReferenceImage;
};

export async function requestApimartImages(config: AiConfig, input: ApimartImageInput): Promise<Array<{ id: string; dataUrl: string }>> {
    if (input.mask) throw new Error(apiText("apimartMaskUnsupported"));
    const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    if (!baseUrl || !config.apiKey.trim()) throw new Error(apiText("baseUrlRequired"));

    const cfg = imageConfig(input.model);
    // 出站 model 必须原文透传（APIMart 模型 ID 含点号），normalize 只用于内部匹配
    const payload: ApimartPayload = { model: input.model.trim(), prompt: input.prompt };
    if (input.size) payload.size = input.size;
    if (input.quality) payload.quality = input.quality;
    if (input.background) payload.background = input.background;
    if (input.isEdit) payload.n = input.n;
    else normalizeCount(payload, cfg);
    if (cfg.imageRefField && input.references.length) {
        const refs = await normalizeReferenceUrls(baseUrl, config.apiKey, input.references);
        setImageReference(payload, cfg, refs);
    }
    normalizeAspect(payload, cfg);
    normalizeResolution(payload, cfg);
    normalizeImageQuality(payload, cfg);
    const validationError = validateImageInputs(payload, input.model);
    if (validationError) throw new Error(validationError);

    // APIMart 网关规则：/images/edits 只支持 Grok 图像模型；其他模型的参考图
    // 需走 /images/generations 并携带 image_urls 字段（上面已按模型归一化）。
    const isGrokEdit = input.isEdit && normalizeModelName(input.model).includes("grok-imagine");
    const path = isGrokEdit ? "/images/edits" : "/images/generations";
    const { body } = await apimartJson(baseUrl, config.apiKey, path, { method: "POST", body: JSON.stringify(payload) });

    const direct = (body as { data?: Array<{ url?: string }> }).data?.filter((item) => item.url).map((item) => item.url as string) || [];
    if (direct.length) return direct.map((dataUrl) => ({ id: nanoid(), dataUrl }));

    const task = readCreateTask(body);
    if (!task) {
        const urls = uniqueUrls(collectUrls(body));
        if (urls.length) return urls.map((dataUrl) => ({ id: nanoid(), dataUrl }));
        throw new Error(apiText("apimartNoTaskId"));
    }
    const result = await pollTask(baseUrl, config.apiKey, task.taskId);
    if (result.status === "failed" || !result.urls.length) throw new Error(result.error || apiText("apimartTaskFailed"));
    return result.urls.map((dataUrl) => ({ id: nanoid(), dataUrl }));
}

export async function createApimartVideoTask(
    config: AiConfig,
    model: string,
    prompt: string,
    params: { seconds: number; size?: string; resolution?: string; generateAudio?: boolean; references?: ReferenceImage[] },
): Promise<string> {
    const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    if (!baseUrl || !config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));

    const cfg = videoConfig(model);
    const payload: ApimartPayload = { model: model.trim(), prompt };
    if (params.size) payload[cfg.aspectField || "aspect_ratio"] = params.size;
    payload.duration = params.seconds;
    if (params.resolution) payload.resolution = params.resolution;
    if (params.generateAudio !== undefined) payload.video_generate_audio = params.generateAudio;
    if (params.references?.length) {
        const refs = await uploadApimartReferences(config, params.references);
        if (refs.imageUrls.length) setImageReference(payload, cfg, refs.imageUrls);
        if (refs.videoUrls.length) setVideoReference(payload, cfg, refs.videoUrls);
        if (refs.audioUrls.length) setAudioReference(payload, cfg, refs.audioUrls);
    }

    normalizeAspect(payload, cfg);
    normalizeDuration(payload, cfg);
    normalizeVideoMode(payload, cfg);
    normalizeResolution(payload, cfg);
    normalizeVideoQuality(payload, cfg);
    applyVideoGenerateAudio(payload, model);
    applyVideoDefaults(payload, model);
    const validationError = validateVideoInputs(payload, model);
    if (validationError) throw new Error(validationError);
    delete payload.preset;

    const { body } = await apimartJson(baseUrl, config.apiKey, "/videos/generations", { method: "POST", body: JSON.stringify(payload) });
    const task = readCreateTask(body);
    if (!task) throw new Error(apiText("apimartNoTaskId"));
    return task.taskId;
}

export async function pollApimartVideoTask(config: AiConfig, taskId: string, signal?: AbortSignal): Promise<{ status: "pending" | "completed" | "failed"; url?: string; error?: string }> {
    const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    const result = await pollTask(baseUrl, config.apiKey, taskId, signal);
    if (result.status === "failed") return { status: "failed", error: result.error };
    if (result.status === "completed") {
        const url = result.urls.find((item) => isVideoReference(item)) || result.urls[0];
        if (!url) return { status: "failed", error: apiText("apimartTaskFailed") };
        return { status: "completed", url };
    }
    return { status: "pending" };
}

export async function uploadApimartReferences(config: AiConfig, references: ReferenceImage[]): Promise<{ imageUrls: string[]; videoUrls: string[]; audioUrls: string[]; firstFrame?: string; lastFrame?: string }> {
    const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    const imageUrls: string[] = [];
    const videoUrls: string[] = [];
    const audioUrls: string[] = [];
    for (const image of references) {
        const directUrl = image.dataUrl?.trim() || "";
        if (/^https?:\/\//i.test(directUrl)) {
            if (isAudioReference(directUrl)) audioUrls.push(directUrl);
            else if (isVideoReference(directUrl)) videoUrls.push(directUrl);
            else imageUrls.push(directUrl);
            continue;
        }
        const dataUrl = await imageToDataUrl(image).catch(() => "");
        if (!dataUrl) continue;
        if (/^https?:\/\//i.test(dataUrl)) {
            if (isAudioReference(dataUrl)) audioUrls.push(dataUrl);
            else if (isVideoReference(dataUrl)) videoUrls.push(dataUrl);
            else imageUrls.push(dataUrl);
            continue;
        }
        const url = await uploadReferenceImage(baseUrl, config.apiKey, dataUrl);
        imageUrls.push(url);
    }
    return { imageUrls, videoUrls, audioUrls };
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}