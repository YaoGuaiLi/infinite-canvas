import { spawn } from "node:child_process";

import { errorMessage } from "../utils/value.js";
import { createAgentLogWriter } from "../utils/agent-runtime.js";
import { AGENT_PROMPT } from "../config.js";
import { runClaudeTurn } from "./claude.js";
import { runCodexTurn } from "./codex.js";
import type { AgentEmit } from "./types.js";

export type AgentProviderId = "codex" | "claude" | "custom";

export type AgentProviderCapabilities = {
    threads: boolean;
    models: boolean;
    skills: boolean;
    approvals: boolean;
    reasoningEffort: boolean;
    attachments: boolean;
};

export type AgentProviderConfig = {
    id: AgentProviderId;
    command?: string;
    args?: string[];
};

const PROVIDER_LABELS: Record<AgentProviderId, string> = {
    codex: "Codex (app-server)",
    claude: "Claude Code (CLI)",
    custom: "Custom Agent CLI",
};

const PROVIDER_CAPABILITIES: Record<AgentProviderId, AgentProviderCapabilities> = {
    codex: { threads: true, models: true, skills: true, approvals: true, reasoningEffort: true, attachments: true },
    claude: { threads: false, models: false, skills: false, approvals: false, reasoningEffort: false, attachments: false },
    custom: { threads: false, models: false, skills: false, approvals: false, reasoningEffort: false, attachments: false },
};

/** 从本地配置解析当前 Agent Provider（默认 codex，兼容全部旧路由）。 */
export function resolveProvider(configProvider?: AgentProviderConfig): AgentProviderConfig {
    const id = configProvider?.id && configProvider.id in PROVIDER_CAPABILITIES ? configProvider.id : "codex";
    if (id === "custom" && configProvider?.command) {
        return { id, command: configProvider.command, args: configProvider.args };
    }
    return { id };
}

export function providerInfo(provider: AgentProviderConfig) {
    return {
        id: provider.id,
        label: PROVIDER_LABELS[provider.id],
        capabilities: PROVIDER_CAPABILITIES[provider.id],
    };
}

/** 按当前 provider 分发一次对话回合。Codex 之外的 provider 均为无状态单轮（stdout 事件流）。 */
export function runProviderTurn(
    provider: AgentProviderConfig,
    prompt: string,
    emit: AgentEmit,
    options: { attachments?: unknown[]; permissionMode?: string } = {},
) {
    if (provider.id === "codex") {
        return runCodexTurn(prompt, emit, (options.attachments as never[]) || [], { permissionMode: (options.permissionMode as never) || "request" });
    }
    if (provider.id === "claude") {
        runClaudeTurn(prompt, emit);
        return;
    }
    runCustomCliTurn(provider, prompt, emit);
}

/** 运行自定义 Agent CLI：命令模板中的 {prompt} 会被替换为用户输入。 */
function runCustomCliTurn(provider: AgentProviderConfig, prompt: string, emit: AgentEmit) {
    if (!provider.command) {
        emit("agent_error", { message: "Custom provider is missing command configuration." });
        return;
    }
    const fullPrompt = `${AGENT_PROMPT}\n\n用户请求：${prompt}`;
    const args = (provider.args || ["{prompt}"]).map((arg) => arg.replace("{prompt}", fullPrompt));
    let child;
    try {
        child = spawn(provider.command, args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32", windowsHide: true });
    } catch (error) {
        emit("agent_error", { message: errorMessage(error) });
        return;
    }

    const stderr = createAgentLogWriter((text) => emit("agent_log", { text }));
    let out = "";
    child.stdout?.on("data", (chunk) => {
        out += chunk.toString();
        const lines = out.split(/\r?\n/);
        out = lines.pop() || "";
        lines.filter(Boolean).forEach((line) => {
            emit("agent_event", { agent: provider.id, type: "raw", text: line });
        });
    });
    child.stderr?.on("data", (chunk) => stderr.write(chunk.toString()));
    child.on("error", (error) => {
        stderr.flush();
        emit("agent_error", { message: errorMessage(error) });
    });
    child.on("close", (code) => {
        stderr.flush();
        emit("agent_done", { agent: provider.id, code });
    });
}
