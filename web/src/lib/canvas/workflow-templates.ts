import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";
import { CanvasNodeType } from "@/types/canvas";

/**
 * 预置并验证过的画布工作流模板。
 * 纯数据 + 纯函数，供「示例工作流」页面与 Agent 站点工具（workflows_apply_template）共用。
 */

export type WorkflowNodeSpec = {
    id: string;
    type: CanvasNodeType;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    metadata?: CanvasNodeData["metadata"];
};

export type WorkflowConnectionSpec = { from: string; to: string };

export type WorkflowTemplate = {
    slug: "motion-transfer" | "first-last-frame" | "lip-sync" | "storyboard-serial";
    titleKey: string;
    descKey: string;
    accent: string;
    tagKey: string;
    nodes: WorkflowNodeSpec[];
    connections: WorkflowConnectionSpec[];
};

const TEXT_NODE_DEFAULT_WIDTH = 260;
const TEXT_NODE_DEFAULT_HEIGHT = 140;
const IMAGE_NODE_DEFAULT_WIDTH = 280;
const IMAGE_NODE_DEFAULT_HEIGHT = 320;
const VIDEO_NODE_DEFAULT_WIDTH = 320;
const VIDEO_NODE_DEFAULT_HEIGHT = 240;
const CONFIG_NODE_DEFAULT_WIDTH = 260;
const CONFIG_NODE_DEFAULT_HEIGHT = 220;

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
    {
        slug: "motion-transfer",
        titleKey: "workflows.templates.motionTransfer.title",
        descKey: "workflows.templates.motionTransfer.desc",
        accent: "#7c3aed",
        tagKey: "workflows.tags.video",
        nodes: [
            { id: "wf-motion-text", type: CanvasNodeType.Text, title: "1. 动作描述", x: 60, y: 80, width: TEXT_NODE_DEFAULT_WIDTH, height: TEXT_NODE_DEFAULT_HEIGHT, metadata: { content: "一位舞者在霓虹灯光下的街头跳出流畅的街舞动作，镜头从低角度缓慢推近。", status: "idle" } },
            { id: "wf-motion-ref", type: CanvasNodeType.Image, title: "2. 人物参考图", x: 60, y: 300, width: IMAGE_NODE_DEFAULT_WIDTH, height: IMAGE_NODE_DEFAULT_HEIGHT, metadata: { status: "idle", prompt: "上传或生成一张清晰的人物全身照" } },
            { id: "wf-motion-config", type: CanvasNodeType.Config, title: "3. 生成配置", x: 400, y: 150, width: CONFIG_NODE_DEFAULT_WIDTH, height: CONFIG_NODE_DEFAULT_HEIGHT, metadata: { status: "idle", size: "9:16", quality: "high", count: 1 } },
            { id: "wf-motion-video", type: CanvasNodeType.Video, title: "4. 动作迁移视频", x: 720, y: 160, width: VIDEO_NODE_DEFAULT_WIDTH, height: VIDEO_NODE_DEFAULT_HEIGHT, metadata: { status: "idle", prompt: "基于人物参考图迁移动作，保持肢体自然连贯" } },
        ],
        connections: [
            { from: "wf-motion-text", to: "wf-motion-config" },
            { from: "wf-motion-ref", to: "wf-motion-video" },
            { from: "wf-motion-config", to: "wf-motion-video" },
        ],
    },
    {
        slug: "first-last-frame",
        titleKey: "workflows.templates.firstLastFrame.title",
        descKey: "workflows.templates.firstLastFrame.desc",
        accent: "#2563eb",
        tagKey: "workflows.tags.video",
        nodes: [
            { id: "wf-fl-first", type: CanvasNodeType.Image, title: "1. 首帧画面", x: 60, y: 80, width: IMAGE_NODE_DEFAULT_WIDTH, height: IMAGE_NODE_DEFAULT_HEIGHT, metadata: { status: "idle", prompt: "生成视频的开场画面" } },
            { id: "wf-fl-last", type: CanvasNodeType.Image, title: "2. 尾帧画面", x: 60, y: 440, width: IMAGE_NODE_DEFAULT_WIDTH, height: IMAGE_NODE_DEFAULT_HEIGHT, metadata: { status: "idle", prompt: "生成视频的收尾画面" } },
            { id: "wf-fl-config", type: CanvasNodeType.Config, title: "3. 生成配置", x: 400, y: 250, width: CONFIG_NODE_DEFAULT_WIDTH, height: CONFIG_NODE_DEFAULT_HEIGHT, metadata: { status: "idle", size: "16:9", seconds: "6", videoMode: "frames" } },
            { id: "wf-fl-video", type: CanvasNodeType.Video, title: "4. 首尾帧过渡视频", x: 720, y: 250, width: VIDEO_NODE_DEFAULT_WIDTH, height: VIDEO_NODE_DEFAULT_HEIGHT, metadata: { status: "idle", prompt: "在两帧之间生成自然的过渡运动" } },
        ],
        connections: [
            { from: "wf-fl-first", to: "wf-fl-video" },
            { from: "wf-fl-last", to: "wf-fl-video" },
            { from: "wf-fl-config", to: "wf-fl-video" },
        ],
    },
    {
        slug: "lip-sync",
        titleKey: "workflows.templates.lipSync.title",
        descKey: "workflows.templates.lipSync.desc",
        accent: "#059669",
        tagKey: "workflows.tags.audio",
        nodes: [
            { id: "wf-lip-img", type: CanvasNodeType.Image, title: "1. 人物肖像", x: 60, y: 120, width: IMAGE_NODE_DEFAULT_WIDTH, height: IMAGE_NODE_DEFAULT_HEIGHT, metadata: { status: "idle", prompt: "一张清晰的正面人物肖像" } },
            { id: "wf-lip-audio", type: CanvasNodeType.Audio, title: "2. 配音音频", x: 60, y: 480, width: 300, height: 160, metadata: { status: "idle" } },
            { id: "wf-lip-video", type: CanvasNodeType.Video, title: "3. 对口型视频", x: 440, y: 260, width: VIDEO_NODE_DEFAULT_WIDTH + 40, height: VIDEO_NODE_DEFAULT_HEIGHT + 40, metadata: { status: "idle", prompt: "根据音频节奏生成自然的口型与表情" } },
        ],
        connections: [
            { from: "wf-lip-img", to: "wf-lip-video" },
            { from: "wf-lip-audio", to: "wf-lip-video" },
        ],
    },
    {
        slug: "storyboard-serial",
        titleKey: "workflows.templates.storyboardSerial.title",
        descKey: "workflows.templates.storyboardSerial.desc",
        accent: "#d97706",
        tagKey: "workflows.tags.image",
        nodes: [
            { id: "wf-sb-config", type: CanvasNodeType.Config, title: "1. 统一风格配置", x: 60, y: 120, width: CONFIG_NODE_DEFAULT_WIDTH, height: CONFIG_NODE_DEFAULT_HEIGHT, metadata: { status: "idle", size: "3:4", quality: "high", count: 4 } },
            { id: "wf-sb-p1", type: CanvasNodeType.Image, title: "2. 分镜 1 · 开场", x: 400, y: 60, width: 240, height: 300, metadata: { status: "idle", prompt: "全景：主角站在城市天台上眺望" } },
            { id: "wf-sb-p2", type: CanvasNodeType.Image, title: "3. 分镜 2 · 冲突", x: 400, y: 400, width: 240, height: 300, metadata: { status: "idle", prompt: "中景：主角转身面对镜头，神情坚定" } },
            { id: "wf-sb-p3", type: CanvasNodeType.Image, title: "4. 分镜 3 · 高潮", x: 700, y: 60, width: 240, height: 300, metadata: { status: "idle", prompt: "特写：主角伸手抓住关键道具" } },
            { id: "wf-sb-p4", type: CanvasNodeType.Image, title: "5. 分镜 4 · 结局", x: 700, y: 400, width: 240, height: 300, metadata: { status: "idle", prompt: "远景：主角离去的背影与晚霞" } },
        ],
        connections: [
            { from: "wf-sb-config", to: "wf-sb-p1" },
            { from: "wf-sb-config", to: "wf-sb-p2" },
            { from: "wf-sb-config", to: "wf-sb-p3" },
            { from: "wf-sb-config", to: "wf-sb-p4" },
        ],
    },
];

export function findWorkflowTemplate(slug: string) {
    return WORKFLOW_TEMPLATES.find((template) => template.slug === slug) || null;
}

export function buildTemplateProject(template: WorkflowTemplate) {
    const nodes: CanvasNodeData[] = template.nodes.map((spec) => ({
        id: spec.id,
        type: spec.type,
        title: spec.title,
        position: { x: spec.x, y: spec.y },
        width: spec.width,
        height: spec.height,
        metadata: { ...spec.metadata },
    }));
    const connections: CanvasConnection[] = template.connections.map((conn, index) => ({
        id: `${template.slug}-conn-${index}`,
        fromNodeId: conn.from,
        toNodeId: conn.to,
    }));
    return { nodes, connections };
}
