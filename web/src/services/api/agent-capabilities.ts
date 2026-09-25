import { fetchAgentJson } from "@/services/api/canvas-agent";
import { toolDescriptions, toolNames } from "@/lib/agent/mcp-tool-catalog";

export type AgentCapabilities = {
    threads: boolean;
    models: boolean;
    skills: boolean;
    approvals: boolean;
    reasoningEffort: boolean;
    attachments: boolean;
};

export type AgentProviderInfo = {
    id: string;
    label: string;
    capabilities: AgentCapabilities;
};

export type AgentInfo = {
    ok: boolean;
    protocolVersion: number;
    provider: AgentProviderInfo;
    toolNames: string[];
};

/** 读取本地 Agent 的 provider 与能力位。 */
export async function fetchAgentInfo(endpoint: string, token: string): Promise<AgentInfo> {
    return fetchAgentJson<AgentInfo>(endpoint, token, "/agent/info");
}

/** 全部 MCP 工具的静态目录（名称 + 描述）。 */
export function listAgentTools(): Array<{ name: string; description: string }> {
    return toolNames.map((name) => ({ name, description: toolDescriptions[name] || name }));
}

/** 从网页直接调用本地 Agent 的任意 MCP 工具（与 canvas-agent mcp 同通道）。 */
export async function callAgentTool(endpoint: string, token: string, name: string, input: Record<string, unknown>): Promise<unknown> {
    const data = await fetchAgentJson<{ ok: boolean; result: unknown }>(endpoint, token, "/api/tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, input }),
    });
    return data.result;
}

export { toolDescriptions, toolNames };
