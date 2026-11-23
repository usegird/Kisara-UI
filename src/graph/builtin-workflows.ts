import type { TemplateSection, WorkflowTemplate } from '@/graph/template-filter';
import { t, type MessageKey } from '@/i18n';

interface BuiltinWorkflow {
  readonly name: string;
  readonly title: MessageKey;
  readonly description: MessageKey;
  readonly load: () => Promise<unknown>;
}

const BUILTIN_WORKFLOWS: readonly BuiltinWorkflow[] = [
  {
    name: 'kisara-a1111-txt2img',
    title: 'comfy.template.builtin.a1111Txt2img.title',
    description: 'comfy.template.builtin.a1111Txt2img.description',
    load: () => import('@/graph/builtin/a1111-txt2img.json').then((module) => module.default),
  },
];

export function builtinTemplateSection(): TemplateSection {
  return {
    title: t('comfy.template.builtinCategory'),
    templates: BUILTIN_WORKFLOWS.map(toTemplate),
  };
}

export function loadBuiltinWorkflow(template: WorkflowTemplate): Promise<unknown> | null {
  if (template.builtin !== true) return null;
  return BUILTIN_WORKFLOWS.find((entry) => entry.name === template.name)?.load() ?? null;
}

function toTemplate(entry: BuiltinWorkflow): WorkflowTemplate {
  return {
    name: entry.name,
    title: t(entry.title),
    description: t(entry.description),
    tags: [],
    models: [],
    mediaType: 'none',
    mediaSubtype: '',
    date: null,
    usage: null,
    size: null,
    builtin: true,
  };
}
