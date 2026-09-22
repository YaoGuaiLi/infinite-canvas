import { App, Button, Input, Tooltip } from "antd";
import copyToClipboard from "copy-to-clipboard";
import { BookMarked, Copy, Download, ExternalLink, KeyRound, Link2, PlugZap, Rocket, TerminalSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";

const REPO_PLUGIN_URL = "https://github.com/YaoGuaiLi/infinite-canvas";
const REPO_AGENT_URL = "https://github.com/YaoGuaiLi/infinite-canvas/tree/main/canvas-agent";
const REPO_PLUGIN_GH_PROXY_URL = "https://ghfast.top/https://github.com/YaoGuaiLi/infinite-canvas/archive/refs/heads/main.zip";
const REPO_PLUGIN_GH_DIRECT_URL = "https://github.com/YaoGuaiLi/infinite-canvas/archive/refs/heads/main.zip";
const REPO_AGENT_GH_DIRECT_URL = "https://github.com/YaoGuaiLi/infinite-canvas/archive/refs/heads/main.zip";
const REPO_AGENT_GH_PROXY_URL = "https://ghfast.top/https://github.com/YaoGuaiLi/infinite-canvas/archive/refs/heads/main.zip";
const AGENT_NPM_COMMAND = "npx -y @basketikun/canvas-agent@latest";

export function AgentConnectView({
    theme,
    url,
    token,
    enabled,
    connected,
    activity,
    connectError,
    onUrlChange,
    onTokenChange,
    onToggleEnabled,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    url: string;
    token: string;
    enabled: boolean;
    connected: boolean;
    activity: string;
    connectError: string;
    onUrlChange: (value: string) => void;
    onTokenChange: (value: string) => void;
    onToggleEnabled: () => void;
}) {
    const { t } = useTranslation();
    const { message } = App.useApp();

    const statusText = connectError ? t("agent.status.failed") : connected ? activity : enabled ? t("agent.status.connecting") : t("agent.status.disconnected");
    const statusColor = connectError ? "#dc2626" : connected ? "#16a34a" : enabled ? "#d97706" : theme.node.muted;

    const copyCommand = (command: string) => {
        copyToClipboard(command);
        message.success(t("agent.connect.commandCopied"));
    };

    const commandLineButton = (command: string) => (
        <div className="mt-2 flex items-center gap-2 rounded-md border bg-transparent px-2 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11px] leading-5">{command}</code>
            <Tooltip title={t("agent.connect.copyCommand")}>
                <Button size="small" type="text" className="!h-6 !w-6 !min-w-6" icon={<Copy className="size-3.5" />} onClick={() => copyCommand(command)} />
            </Tooltip>
        </div>
    );

    const openExternal = (href: string, label?: string) => {
        window.open(href, "_blank", "noopener,noreferrer");
        if (label) message.info(label);
    };

    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
                <div>
                    <div className="text-base font-semibold leading-6">{t("agent.connect.title")}</div>
                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                        {t("agent.connect.description")}
                    </div>
                </div>

                {/* 方式一：一键唤醒本机安装 Agent 插件 / MCP */}
                <div className="rounded-lg px-3 py-2.5" style={{ background: theme.node.fill }}>
                    <div className="text-sm font-medium leading-5">{t("agent.connect.pluginTitle")}</div>
                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                        {t("agent.connect.pluginTextEnhanced")}
                    </div>

                    {/* 一键安装按钮组（支持所有支持 MCP 的 Agent） */}
                    <div className="mt-3 grid gap-2">
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                type="primary"
                                icon={<Rocket className="size-3.5" />}
                                className="!h-9 !text-xs !font-semibold"
                                onClick={() => openExternal("codex://plugin/install/infinite-canvas")}
                            >
                                {t("agent.connect.oneClickCodex")}
                            </Button>
                            <Button
                                type="primary"
                                icon={<Rocket className="size-3.5" />}
                                className="!h-9 !text-xs !font-semibold"
                                onClick={() => openExternal("vscode://zed.plugin/install/infinite-canvas")}
                            >
                                {t("agent.connect.oneClickZed")}
                            </Button>
                            <Button
                                icon={<TerminalSquare className="size-3.5" />}
                                className="!h-9 !text-xs !font-semibold"
                                onClick={() => copyCommand("npx -y @basketikun/canvas-agent@latest mcp")}
                            >
                                {t("agent.connect.oneClickMcp")}
                            </Button>
                            <Button
                                icon={<BookMarked className="size-3.5" />}
                                className="!h-9 !text-xs !font-semibold"
                                onClick={() => openExternal(REPO_PLUGIN_URL)}
                            >
                                {t("agent.connect.viewPluginDocs")}
                            </Button>
                        </div>
                        <div className="rounded-md border px-2 py-1.5" style={{ borderColor: theme.node.stroke }}>
                            <span className="text-[11px] leading-5" style={{ color: theme.node.muted }}>
                                {t("agent.connect.agentCompatibilityHint")}
                            </span>
                        </div>
                    </div>

                    <div className="mt-3 rounded-md border px-2.5 py-2 text-[11px] leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                        <div className="font-medium" style={{ color: theme.node.text }}>{t("agent.connect.pluginReminder")}</div>
                        <div className="mt-1">{t("agent.connect.pluginReminderText")}</div>
                    </div>
                </div>

                {/* 方式二：直接运行 Agent（指向本仓库 + GitHub 加速直链） */}
                <div className="rounded-lg px-3 py-2.5">
                    <div className="text-sm font-medium leading-5">{t("agent.connect.directTitle")}</div>
                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                        {t("agent.connect.directTextEnhanced")}
                    </div>

                    {commandLineButton(AGENT_NPM_COMMAND)}

                    <div className="mt-3 grid gap-2">
                        <div className="text-[11px] font-medium" style={{ color: theme.node.muted }}>{t("agent.connect.downloadAgentSource")}</div>
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                icon={<ExternalLink className="size-3.5" />}
                                className="!h-9 !text-xs"
                                onClick={() => openExternal(REPO_PLUGIN_GH_DIRECT_URL)}
                            >
                                {t("agent.connect.ghDirect")}
                            </Button>
                            <Button
                                icon={<Download className="size-3.5" />}
                                className="!h-9 !text-xs"
                                onClick={() => openExternal(REPO_PLUGIN_GH_PROXY_URL)}
                            >
                                {t("agent.connect.ghProxy")}
                            </Button>
                        </div>
                        <div className="flex gap-2 text-[11px] leading-5" style={{ color: theme.node.muted }}>
                            <a href={REPO_PLUGIN_URL} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline" style={{ color: theme.node.text }}>
                                {t("agent.connect.repoLink")}
                            </a>
                            <span>·</span>
                            <a href={REPO_AGENT_URL} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline" style={{ color: theme.node.text }}>
                                {t("agent.connect.agentSourceLink")}
                            </a>
                        </div>
                    </div>
                </div>

                <div className="rounded-lg border p-3" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 text-sm font-medium leading-5">{t("agent.connect.webConnection")}</span>
                                <span
                                    className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-4"
                                    style={{ borderColor: connected || enabled || connectError ? statusColor : theme.node.stroke, color: statusColor }}
                                >
                                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: statusColor }} />
                                    <span className="truncate">{statusText}</span>
                                </span>
                            </div>
                            <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                {t("agent.connect.autoDiscover")}
                            </div>
                        </div>
                        <Button className="!h-8 !px-3" type={enabled ? "default" : "primary"} icon={<PlugZap className="size-4" />} onClick={onToggleEnabled}>
                            {t(enabled ? "agent.connect.disconnect" : "agent.connect.connect")}
                        </Button>
                    </div>
                    <div className="mt-3 grid gap-2.5">
                        <label className="grid gap-1.5">
                            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: theme.node.muted }}>
                                <Link2 className="size-3.5" />
                                {t("agent.connect.localAddress")}
                                <span className="font-normal opacity-70">Local URL</span>
                            </span>
                            <Input size="large" prefix={<Link2 className="mr-1 size-4" style={{ color: theme.node.faint }} />} value={url} onChange={(event) => onUrlChange(event.target.value)} placeholder={t("agent.connect.urlPlaceholder")} />
                        </label>
                        <label className="grid gap-1.5">
                            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: theme.node.muted }}>
                                <KeyRound className="size-3.5" />
                                {t("agent.connect.token")}
                                <span className="font-normal opacity-70">Connect token</span>
                            </span>
                            <Input.Password
                                size="large"
                                prefix={<KeyRound className="mr-1 size-4" style={{ color: theme.node.faint }} />}
                                value={token}
                                onChange={(event) => onTokenChange(event.target.value)}
                                placeholder={t("agent.connect.tokenPlaceholder")}
                            />
                        </label>
                        {connectError ? (
                            <div className="rounded-md border px-2.5 py-2 text-xs leading-5" style={{ borderColor: "rgba(220,38,38,.35)", color: "#dc2626" }}>
                                {connectError}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
