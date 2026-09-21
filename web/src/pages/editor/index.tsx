import { useEffect, useRef, useState } from "react";
import { Button, Tooltip, Space } from "antd";
import { ExternalLink, Maximize2, Minimize2, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "@/stores/use-theme-store";

export default function EditorPage() {
    const { t } = useTranslation();
    const theme = useThemeStore((state) => state.theme);
    const [buster, setBuster] = useState(() => Date.now());
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const editorSrc = `/editor/index.html?theme=${theme}&v=${buster}`;

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement));
        };
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, []);

    const toggleFullscreen = async () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            try {
                await containerRef.current.requestFullscreen();
            } catch {
                // Ignore fullscreen failure
            }
        } else {
            try {
                await document.exitFullscreen();
            } catch {
                // Ignore exit failure
            }
        }
    };

    const handleReload = () => {
        setBuster(Date.now());
    };

    const handleOpenExternal = () => {
        window.open(`/editor/index.html?theme=${theme}`, "_blank", "noopener,noreferrer");
    };

    return (
        <div ref={containerRef} className="flex h-full w-full flex-col overflow-hidden bg-background">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-stone-200 px-4 dark:border-stone-800">
                <div className="flex items-center gap-2 text-xs font-medium text-stone-600 dark:text-stone-300">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span>Timeline Studio</span>
                    <span className="text-stone-400 dark:text-stone-500">· {t("editor.subtitle")}</span>
                </div>
                <Space size={6}>
                    <Tooltip title={t("editor.refresh")}>
                        <Button
                            type="text"
                            size="small"
                            icon={<RotateCw className="size-3.5" />}
                            onClick={handleReload}
                            aria-label={t("editor.refresh")}
                        />
                    </Tooltip>
                    <Tooltip title={isFullscreen ? t("editor.exitFullscreen") : t("editor.fullscreen")}>
                        <Button
                            type="text"
                            size="small"
                            icon={isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                            onClick={toggleFullscreen}
                            aria-label={t("editor.fullscreen")}
                        />
                    </Tooltip>
                    <Tooltip title={t("editor.openExternal")}>
                        <Button
                            type="text"
                            size="small"
                            icon={<ExternalLink className="size-3.5" />}
                            onClick={handleOpenExternal}
                            aria-label={t("editor.openExternal")}
                        />
                    </Tooltip>
                </Space>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden bg-stone-950">
                <iframe
                    ref={iframeRef}
                    key={`${theme}-${buster}`}
                    title="Timeline Studio"
                    src={editorSrc}
                    className="h-full w-full border-0"
                    allow="accelerometer; autoplay; clipboard-read; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; cross-origin-isolated"
                />
            </div>
        </div>
    );
}
