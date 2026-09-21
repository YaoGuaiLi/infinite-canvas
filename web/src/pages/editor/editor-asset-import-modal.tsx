import { useMemo, useState } from "react";
import { App, Button, Checkbox, Empty, Modal, Select, Tabs, Tag, Typography } from "antd";
import { FolderDown, FolderPlus, Image as ImageIcon, Music2, Video as VideoIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { getImageBlob } from "@/services/image-storage";
import { getMediaBlob } from "@/services/file-storage";

export type ImportMediaPayload = {
    name: string;
    mimeType: string;
    buffer: ArrayBuffer;
};

type Props = {
    open: boolean;
    onClose: () => void;
    onImport: (items: ImportMediaPayload[]) => Promise<void>;
};

export function EditorAssetImportModal({ open, onClose, onImport }: Props) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const assets = useAssetStore((state) => state.assets);
    const projects = useCanvasStore((state) => state.projects);

    const [activeTab, setActiveTab] = useState<"assets" | "canvas">("assets");
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [selectedProjectId, setSelectedProjectId] = useState<string>(() => projects[0]?.id || "");
    const [importing, setImporting] = useState(false);

    // 过滤出我的资产中的媒体（图片与视频）
    const mediaAssets = useMemo(() => {
        return assets.filter((asset) => asset.kind === "image" || asset.kind === "video");
    }, [assets]);

    // 当前选中的画布项目及其媒体节点
    const currentProject = useMemo(() => {
        return projects.find((p) => p.id === selectedProjectId) || projects[0] || null;
    }, [projects, selectedProjectId]);

    const canvasMediaNodes = useMemo(() => {
        if (!currentProject) return [];
        return (currentProject.nodes || []).filter((node) => {
            if (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) {
                return Boolean(node.metadata?.storageKey || node.metadata?.content);
            }
            return false;
        });
    }, [currentProject]);

    const toggleSelect = (key: string) => {
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            if (activeTab === "assets") {
                const keys = mediaAssets.map((a) => `asset:${a.id}`);
                setSelectedKeys((prev) => new Set([...prev, ...keys]));
            } else {
                const keys = canvasMediaNodes.map((n) => `node:${currentProject?.id}:${n.id}`);
                setSelectedKeys((prev) => new Set([...prev, ...keys]));
            }
        } else {
            if (activeTab === "assets") {
                const assetKeys = new Set(mediaAssets.map((a) => `asset:${a.id}`));
                setSelectedKeys((prev) => new Set([...prev].filter((k) => !assetKeys.has(k))));
            } else {
                const nodeKeys = new Set(canvasMediaNodes.map((n) => `node:${currentProject?.id}:${n.id}`));
                setSelectedKeys((prev) => new Set([...prev].filter((k) => !nodeKeys.has(k))));
            }
        }
    };

    const handleConfirm = async () => {
        if (!selectedKeys.size) return;
        setImporting(true);
        try {
            const items: ImportMediaPayload[] = [];

            // 1. 处理选中的“我的资产”
            for (const asset of mediaAssets) {
                if (!selectedKeys.has(`asset:${asset.id}`)) continue;
                try {
                    let blob: Blob | null = null;
                    if (asset.kind === "image") {
                        if (asset.data.storageKey) blob = await getImageBlob(asset.data.storageKey);
                        if (!blob && asset.data.dataUrl) {
                            const res = await fetch(asset.data.dataUrl);
                            blob = await res.blob();
                        }
                    } else {
                        if (asset.data.storageKey) blob = await getMediaBlob(asset.data.storageKey);
                        if (!blob && asset.data.url) {
                            const res = await fetch(asset.data.url);
                            blob = await res.blob();
                        }
                    }
                    if (blob) {
                        const buffer = await blob.arrayBuffer();
                        const ext = asset.kind === "video" ? "mp4" : "png";
                        items.push({
                            name: asset.title.includes(".") ? asset.title : `${asset.title || "asset"}.${ext}`,
                            mimeType: blob.type || (asset.kind === "video" ? "video/mp4" : "image/png"),
                            buffer,
                        });
                    }
                } catch (err) {
                    console.error("Failed to load asset blob:", asset.id, err);
                }
            }

            // 2. 处理选中的“画布节点”
            for (const project of projects) {
                for (const node of project.nodes || []) {
                    const key = `node:${project.id}:${node.id}`;
                    if (!selectedKeys.has(key)) continue;
                    try {
                        let blob: Blob | null = null;
                        const storageKey = node.metadata?.storageKey;
                        const url = (node.metadata?.content || "") as string;

                        if (storageKey) {
                            blob = node.type === CanvasNodeType.Image ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                        }
                        if (!blob && url) {
                            const res = await fetch(url);
                            blob = await res.blob();
                        }

                        if (blob) {
                            const buffer = await blob.arrayBuffer();
                            const ext = node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? "mp3" : "png";
                            items.push({
                                name: (node.title || "node").includes(".") ? node.title : `${node.title || "canvas-node"}.${ext}`,
                                mimeType: blob.type || (node.type === CanvasNodeType.Video ? "video/mp4" : node.type === CanvasNodeType.Audio ? "audio/mpeg" : "image/png"),
                                buffer,
                            });
                        }
                    } catch (err) {
                        console.error("Failed to load canvas node blob:", node.id, err);
                    }
                }
            }

            if (!items.length) {
                message.warning(t("editor.importEmpty"));
                return;
            }

            await onImport(items);
            setSelectedKeys(new Set());
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("editor.importFailed"));
        } finally {
            setImporting(false);
        }
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-2 text-base font-semibold">
                    <FolderInputIcon className="size-4 text-emerald-500" />
                    <span>{t("editor.importModalTitle")}</span>
                </div>
            }
            open={open}
            onCancel={onClose}
            width={760}
            destroyOnClose
            footer={
                <div className="flex items-center justify-between border-t border-stone-200 px-1 pt-3 dark:border-stone-800">
                    <div className="text-xs text-stone-500">
                        {t("editor.selectedCount", { count: selectedKeys.size })}
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={onClose}>{t("common.cancel")}</Button>
                        <Button
                            type="primary"
                            disabled={!selectedKeys.size}
                            loading={importing}
                            onClick={handleConfirm}
                            className="bg-emerald-600 hover:bg-emerald-500"
                        >
                            {t("editor.confirmImport", { count: selectedKeys.size })}
                        </Button>
                    </div>
                </div>
            }
        >
            <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as "assets" | "canvas")}
                items={[
                    {
                        key: "assets",
                        label: (
                            <span className="flex items-center gap-1.5">
                                <FolderPlus className="size-3.5" />
                                {t("editor.tabMyAssets")} ({mediaAssets.length})
                            </span>
                        ),
                        children: (
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-xs text-stone-500">{t("editor.selectAssetsHint")}</span>
                                    {mediaAssets.length > 0 && (
                                        <Checkbox
                                            onChange={(e) => handleSelectAll(e.target.checked)}
                                            checked={mediaAssets.length > 0 && mediaAssets.every((a) => selectedKeys.has(`asset:${a.id}`))}
                                        >
                                            <span className="text-xs">{t("common.selectAll")}</span>
                                        </Checkbox>
                                    )}
                                </div>
                                {mediaAssets.length ? (
                                    <div className="grid max-h-[380px] grid-cols-3 gap-2.5 overflow-y-auto p-1 thin-scrollbar">
                                        {mediaAssets.map((asset) => {
                                            const selected = selectedKeys.has(`asset:${asset.id}`);
                                            return (
                                                <div
                                                    key={asset.id}
                                                    onClick={() => toggleSelect(`asset:${asset.id}`)}
                                                    className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border p-2 transition select-none ${
                                                        selected
                                                            ? "border-emerald-500 bg-emerald-50/50 shadow-sm dark:bg-emerald-950/20"
                                                            : "border-stone-200 bg-stone-50/50 hover:border-stone-400 dark:border-stone-800 dark:bg-stone-900/50"
                                                    }`}
                                                >
                                                    <div className="relative aspect-video w-full overflow-hidden rounded bg-stone-200 dark:bg-stone-800">
                                                        {asset.coverUrl || asset.kind === "image" ? (
                                                            <img src={asset.coverUrl || (asset.data as { dataUrl?: string }).dataUrl} alt="" className="size-full object-cover" />
                                                        ) : (
                                                            <div className="grid size-full place-items-center text-stone-400">
                                                                {asset.kind === "video" ? <VideoIcon className="size-6" /> : <Music2 className="size-6" />}
                                                            </div>
                                                        )}
                                                        <div className="absolute top-1.5 left-1.5">
                                                            <Tag className="m-0 text-[10px] uppercase">{asset.kind}</Tag>
                                                        </div>
                                                        <div className="absolute top-1.5 right-1.5">
                                                            <Checkbox checked={selected} />
                                                        </div>
                                                    </div>
                                                    <div className="mt-1.5 truncate text-xs font-medium text-stone-800 dark:text-stone-200" title={asset.title}>
                                                        {asset.title}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("editor.noMediaAssets")} className="py-12" />
                                )}
                            </div>
                        ),
                    },
                    {
                        key: "canvas",
                        label: (
                            <span className="flex items-center gap-1.5">
                                <ImageIcon className="size-3.5" />
                                {t("editor.tabCanvasNodes")}
                            </span>
                        ),
                        children: (
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between gap-3 px-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-stone-500 shrink-0">{t("editor.selectProject")}:</span>
                                        <Select
                                            size="small"
                                            value={currentProject?.id || ""}
                                            onChange={setSelectedProjectId}
                                            options={projects.map((p) => ({ label: p.title || t("canvas.untitled"), value: p.id }))}
                                            className="min-w-44"
                                        />
                                    </div>
                                    {canvasMediaNodes.length > 0 && (
                                        <Checkbox
                                            onChange={(e) => handleSelectAll(e.target.checked)}
                                            checked={
                                                canvasMediaNodes.length > 0 &&
                                                canvasMediaNodes.every((n) => selectedKeys.has(`node:${currentProject?.id}:${n.id}`))
                                            }
                                        >
                                            <span className="text-xs">{t("common.selectAll")}</span>
                                        </Checkbox>
                                    )}
                                </div>

                                {canvasMediaNodes.length ? (
                                    <div className="grid max-h-[380px] grid-cols-3 gap-2.5 overflow-y-auto p-1 thin-scrollbar">
                                        {canvasMediaNodes.map((node) => {
                                            const key = `node:${currentProject?.id}:${node.id}`;
                                            const selected = selectedKeys.has(key);
                                            const previewUrl = (node.metadata?.content || "") as string;
                                            return (
                                                <div
                                                    key={node.id}
                                                    onClick={() => toggleSelect(key)}
                                                    className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border p-2 transition select-none ${
                                                        selected
                                                            ? "border-emerald-500 bg-emerald-50/50 shadow-sm dark:bg-emerald-950/20"
                                                            : "border-stone-200 bg-stone-50/50 hover:border-stone-400 dark:border-stone-800 dark:bg-stone-900/50"
                                                    }`}
                                                >
                                                    <div className="relative aspect-video w-full overflow-hidden rounded bg-stone-200 dark:bg-stone-800">
                                                        {node.type === CanvasNodeType.Image && previewUrl ? (
                                                            <img src={previewUrl} alt="" className="size-full object-cover" />
                                                        ) : (
                                                            <div className="grid size-full place-items-center text-stone-400">
                                                                {node.type === CanvasNodeType.Video ? <VideoIcon className="size-6" /> : <Music2 className="size-6" />}
                                                            </div>
                                                        )}
                                                        <div className="absolute top-1.5 left-1.5">
                                                            <Tag className="m-0 text-[10px] uppercase">{node.type}</Tag>
                                                        </div>
                                                        <div className="absolute top-1.5 right-1.5">
                                                            <Checkbox checked={selected} />
                                                        </div>
                                                    </div>
                                                    <div className="mt-1.5 truncate text-xs font-medium text-stone-800 dark:text-stone-200" title={node.title}>
                                                        {node.title || t("canvas.untitled")}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("editor.noCanvasMedia")} className="py-12" />
                                )}
                            </div>
                        ),
                    },
                ]}
            />
        </Modal>
    );
}

function FolderInputIcon({ className }: { className?: string }) {
    return <FolderDown className={className} />;
}
