import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { App, Button, Checkbox, Empty, Modal, Select, Tabs, Tag } from "antd";
import { FolderDown, FolderPlus, Image as ImageIcon, Music2, Video as VideoIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { ensureImagePreview, getImageBlob, getImagePreviewRevision, previewUrlFor, resolveImageUrl, subscribeImagePreviews } from "@/services/image-storage";
import { getMediaBlob, resolveMediaUrl } from "@/services/file-storage";

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
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
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
                const images = node.metadata?.images || [];
                return Boolean(node.metadata?.storageKey || node.metadata?.content || images.some((img) => img.storageKey || img.content));
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
                        const images = node.metadata?.images || [];
                        const primaryId = node.metadata?.primaryImageId || images[0]?.id;
                        const primaryImg = images.find((i) => i.id === primaryId) || images[0];
                        const storageKey = primaryImg?.storageKey || node.metadata?.storageKey;
                        const contentUrl = primaryImg?.content || (node.metadata?.content as string) || "";

                        if (storageKey) {
                            blob = node.type === CanvasNodeType.Image ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                        }
                        if (!blob && contentUrl) {
                            const res = await fetch(contentUrl);
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
                    <FolderDown className="size-4 text-emerald-500" />
                    <span>{t("editor.importModalTitle")}</span>
                </div>
            }
            open={open}
            onCancel={onClose}
            width={780}
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
                                            <span className="text-xs">{t("common.selectAll", "全选")}</span>
                                        </Checkbox>
                                    )}
                                </div>
                                {mediaAssets.length ? (
                                    <div className="grid max-h-[400px] grid-cols-3 gap-2.5 overflow-y-auto p-1 thin-scrollbar">
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
                                                        <AssetMediaPreview asset={asset} />
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
                                {t("editor.tabCanvasNodes")} ({canvasMediaNodes.length})
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
                                            <span className="text-xs">{t("common.selectAll", "全选")}</span>
                                        </Checkbox>
                                    )}
                                </div>

                                {canvasMediaNodes.length ? (
                                    <div className="grid max-h-[400px] grid-cols-3 gap-2.5 overflow-y-auto p-1 thin-scrollbar">
                                        {canvasMediaNodes.map((node) => {
                                            const key = `node:${currentProject?.id}:${node.id}`;
                                            const selected = selectedKeys.has(key);
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
                                                        <CanvasNodeMediaPreview node={node} />
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

function CanvasNodeMediaPreview({ node }: { node: CanvasNodeData }) {
    const [url, setUrl] = useState<string>("");
    const [loadError, setLoadError] = useState(false);

    useEffect(() => {
        let active = true;
        setLoadError(false);

        const load = async () => {
            const images = node.metadata?.images || [];
            const primaryId = node.metadata?.primaryImageId || images[0]?.id;
            const primaryImg = images.find((i) => i.id === primaryId) || images[0];
            const storageKey = primaryImg?.storageKey || node.metadata?.storageKey;
            const direct = primaryImg?.content || (node.metadata?.content as string) || "";

            if (storageKey) {
                // 1. 优先使用本地同步缩略图
                const preview = previewUrlFor(storageKey);
                if (preview && active) {
                    setUrl(preview);
                    return;
                }
                // 异步触发缩略图构建
                void ensureImagePreview(storageKey);

                // 2. 从 IndexedDB 提取 blob URL
                const resolved = node.type === CanvasNodeType.Image
                    ? await resolveImageUrl(storageKey, direct)
                    : await resolveMediaUrl(storageKey, direct);
                if (active && resolved) {
                    setUrl(resolved);
                    return;
                }
            }

            if (direct && active) {
                setUrl(direct);
            }
        };

        void load();
        return () => {
            active = false;
        };
    }, [node]);

    if (!url || loadError) {
        return (
            <div className="grid size-full place-items-center text-stone-400 bg-stone-100 dark:bg-stone-800">
                {node.type === CanvasNodeType.Video ? <VideoIcon className="size-6" /> : <ImageIcon className="size-6" />}
            </div>
        );
    }

    if (node.type === CanvasNodeType.Video) {
        return (
            <video
                src={`${url}#t=0.1`}
                muted
                playsInline
                preload="metadata"
                className="size-full object-cover"
                onError={() => setLoadError(true)}
            />
        );
    }

    return (
        <img
            src={url}
            alt={node.title || ""}
            className="size-full object-cover"
            onError={() => setLoadError(true)}
        />
    );
}

function AssetMediaPreview({ asset }: { asset: Asset }) {
    const [url, setUrl] = useState<string>("");
    const [loadError, setLoadError] = useState(false);

    useEffect(() => {
        let active = true;
        setLoadError(false);

        const load = async () => {
            if (asset.kind === "video") {
                if (asset.coverUrl) {
                    setUrl(asset.coverUrl);
                    return;
                }
                if (asset.data.storageKey) {
                    const resolved = await resolveMediaUrl(asset.data.storageKey, asset.data.url);
                    if (active && resolved) {
                        setUrl(resolved);
                        return;
                    }
                }
                if (asset.data.url && active) setUrl(asset.data.url);
                return;
            }

            if (asset.kind === "image") {
                if (asset.coverUrl) {
                    setUrl(asset.coverUrl);
                    return;
                }
                if (asset.data.storageKey) {
                    const preview = previewUrlFor(asset.data.storageKey);
                    if (preview && active) {
                        setUrl(preview);
                        return;
                    }
                    void ensureImagePreview(asset.data.storageKey);
                    const resolved = await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl);
                    if (active && resolved) {
                        setUrl(resolved);
                        return;
                    }
                }
                if (asset.data.dataUrl && active) setUrl(asset.data.dataUrl);
            }
        };

        void load();
        return () => {
            active = false;
        };
    }, [asset]);

    if (!url || loadError) {
        return (
            <div className="grid size-full place-items-center text-stone-400 bg-stone-100 dark:bg-stone-800">
                {asset.kind === "video" ? <VideoIcon className="size-6" /> : <ImageIcon className="size-6" />}
            </div>
        );
    }

    if (asset.kind === "video" && !asset.coverUrl) {
        return (
            <video
                src={`${url}#t=0.1`}
                muted
                playsInline
                preload="metadata"
                className="size-full object-cover"
                onError={() => setLoadError(true)}
            />
        );
    }

    return (
        <img
            src={url}
            alt={asset.title || ""}
            className="size-full object-cover"
            onError={() => setLoadError(true)}
        />
    );
}
