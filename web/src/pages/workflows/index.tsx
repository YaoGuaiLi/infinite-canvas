import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { App, Button, Card, Tag, Typography } from "antd";
import { Sparkles, Workflow, MousePointerClick, Music2, Video, Image as ImageIcon, Wand2, PersonStanding, Layers } from "lucide-react";

import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { buildTemplateProject, findWorkflowTemplate, WORKFLOW_TEMPLATES, type WorkflowTemplate } from "@/lib/canvas/workflow-templates";
import { CanvasNodeType } from "@/types/canvas";

type PageTemplate = WorkflowTemplate & { icon: React.ComponentType<{ className?: string }> };

const TEMPLATE_ICONS: Record<WorkflowTemplate["slug"], React.ComponentType<{ className?: string }>> = {
    "motion-transfer": PersonStanding,
    "first-last-frame": Layers,
    "lip-sync": Music2,
    "storyboard-serial": Wand2,
};

const PAGE_TEMPLATES: PageTemplate[] = WORKFLOW_TEMPLATES.map((template) => ({ ...template, icon: TEMPLATE_ICONS[template.slug] }));




export default function WorkflowsPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const createProject = useCanvasStore((state) => state.createProject);

    const templates = useMemo(() => PAGE_TEMPLATES, []);

    const instantiate = (template: WorkflowTemplate) => {
        const title = t(template.titleKey);
        const projectId = createProject(title);
        // Write nodes & connections into the freshly created project.
        const { nodes, connections } = buildTemplateProject(template);
        const store = useCanvasStore.getState();
        store.updateProject(projectId, { nodes, connections });
        message.success(t("workflows.instantiated", { title }));
        navigate(`/canvas/${projectId}`);
    };

    return (
        <main className="h-full overflow-y-auto bg-background px-6 py-10">
            <div className="mx-auto max-w-6xl">
                <div className="text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-3 py-1 text-xs font-medium text-stone-600 dark:border-stone-800 dark:text-stone-300">
                        <Workflow className="size-3.5" />
                        {t("workflows.badge")}
                    </div>
                    <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">{t("workflows.title")}</h1>
                    <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-stone-500 dark:text-stone-400">{t("workflows.description")}</p>
                </div>

                <div className="mt-10 grid gap-4 sm:grid-cols-2">
                    {templates.map((template) => {
                        const Icon = template.icon;
                        return (
                            <Card
                                key={template.slug}
                                hoverable
                                className="overflow-hidden border-stone-200 dark:border-stone-800"
                                styles={{ body: { padding: 20 } }}
                            >
                                <div className="flex h-full flex-col gap-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `${template.accent}1a`, color: template.accent }}>
                                                <Icon className="size-5" />
                                            </span>
                                            <div className="min-w-0">
                                                <h2 className="truncate text-base font-semibold text-stone-950 dark:text-stone-100">{t(template.titleKey)}</h2>
                                                <Tag className="mt-1" color={template.accent}>{t(template.tagKey)}</Tag>
                                            </div>
                                        </div>
                                    </div>
                                    <Typography.Paragraph type="secondary" className="!mb-0 text-sm leading-6">
                                        {t(template.descKey)}
                                    </Typography.Paragraph>
                                    <div className="mt-auto flex items-center justify-between pt-2">
                                        <div className="flex flex-wrap gap-1.5">
                                            {template.nodes.slice(0, 4).map((spec) => {
                                                const NodeIcon = spec.type === CanvasNodeType.Image ? ImageIcon : spec.type === CanvasNodeType.Video ? Video : spec.type === CanvasNodeType.Audio ? Music2 : Sparkles;
                                                return <NodeIcon key={spec.id} className="size-4 text-stone-400" />;
                                            })}
                                        </div>
                                        <Button type="primary" size="small" icon={<MousePointerClick className="size-3.5" />} onClick={() => instantiate(template)}>
                                            {t("workflows.useTemplate")}
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </main>
    );
}
