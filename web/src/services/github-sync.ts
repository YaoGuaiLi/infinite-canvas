import i18n from "@/i18n";
import type { GithubSyncConfig } from "@/stores/use-config-store";

export const GITHUB_MANIFEST_FILE_NAME = "manifest.json";
const GITHUB_REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_GITHUB_API_BASE = "https://api.github.com";
const githubText = (key: string, options?: Record<string, unknown>) => i18n.t(`config.github.errors.${key}`, options);

export async function testGithubConnection(config: GithubSyncConfig) {
    assertGithubConfig(config);
    // 目录尚未创建时 GitHub 返回 404，认证与仓库本身没问题即视为可用
    const response = await githubFetch(config, "", { method: "GET", headers: { Accept: "application/vnd.github+json" } });
    if (response.ok || response.status === 404) return;
    await throwGithubError(response, githubText("testFailed"));
}

export async function downloadGithubFile(config: GithubSyncConfig, path: string) {
    assertGithubConfig(config);
    const response = await githubFetch(config, path, { method: "GET", headers: { Accept: "application/vnd.github.raw" } });
    if (response.status === 404) return null;
    if (!response.ok) await throwGithubError(response, githubText("downloadFailed"));
    return await response.blob();
}

export async function uploadGithubFile(config: GithubSyncConfig, path: string, file: Blob, contentType = "application/octet-stream") {
    if (!file.size) throw new Error(githubText("emptyUpload"));
    assertGithubConfig(config);
    void contentType;
    const content = await blobToBase64(file);
    let lastResponse: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const body = JSON.stringify({ message: commitMessage(path), content, ...(await fetchFileSha(config, path)) });
        const response = await githubFetch(config, path, {
            method: "PUT",
            headers: { Accept: "application/vnd.github+json", "Content-Type": "application/json" },
            body,
        });
        if (response.ok) return;
        lastResponse = response;
        // 409/422：同一时刻有另一个同步抢先改了同一文件（如双开页面或两台设备同时同步），取最新 sha 重试
        if (response.status !== 409 && response.status !== 422) break;
        await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
    }
    await throwGithubError(lastResponse!, githubText("uploadFailed"));
}

async function fetchFileSha(config: GithubSyncConfig, path: string): Promise<{ sha: string } | Record<string, never>> {
    const response = await githubFetch(config, path, { method: "GET", headers: { Accept: "application/vnd.github+json" } });
    if (response.status === 404) return {};
    if (!response.ok) await throwGithubError(response, githubText("downloadFailed"));
    const data = (await response.json().catch(() => null)) as { sha?: string } | null;
    return data?.sha ? { sha: data.sha } : {};
}

async function githubFetch(config: GithubSyncConfig, path: string, init: RequestInit) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${config.pat.trim()}`);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);
    try {
        return await fetch(buildGithubUrl(config, path), { ...init, headers, signal: controller.signal });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw new Error(githubText("requestTimeout"));
        if (error instanceof TypeError) throw new Error(githubText("connectionFailed"));
        throw error;
    } finally {
        window.clearTimeout(timer);
    }
}

function buildGithubUrl(config: GithubSyncConfig, path: string) {
    const base = (config.baseUrl.trim() || DEFAULT_GITHUB_API_BASE).replace(/\/+$/, "");
    const repo = config.repo.trim().replace(/^\/+|\/+$/g, "");
    const remotePath = [normalizePath(config.directory), normalizePath(path)].filter(Boolean).join("/");
    return `${base}/repos/${repo}/contents/${remotePath.split("/").map(encodeURIComponent).join("/")}`;
}

function normalizePath(path: string) {
    return path.trim().replace(/^\/+|\/+$/g, "");
}

function assertGithubConfig(config: GithubSyncConfig) {
    if (!config.repo.trim()) throw new Error(githubText("repoRequired"));
    if (!/^[^/\s]+\/[^/\s]+$/.test(config.repo.trim())) throw new Error(githubText("invalidRepo"));
    if (!config.pat.trim()) throw new Error(githubText("patRequired"));
}

async function throwGithubError(response: Response, fallback: string): Promise<never> {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) throw new Error(githubText("authenticationFailed"));
    if (response.status === 404) throw new Error(githubText("pathMissing"));
    throw new Error(githubText("responseFailed", { fallback, status: response.status, detail: detail ? ` ${detail.slice(0, 120)}` : "" }));
}

function commitMessage(path: string) {
    return `sync: update ${path}`;
}

async function blobToBase64(blob: Blob) {
    const buffer = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < buffer.length; index += chunkSize) binary += String.fromCharCode(...buffer.subarray(index, index + chunkSize));
    return btoa(binary);
}
