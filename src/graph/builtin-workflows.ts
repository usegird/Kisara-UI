import type { TemplateSection, WorkflowTemplate } from '@/graph/template-filter';
import { t, type MessageKey } from '@/i18n';

// ─────────────────────────────
// 本体に同梱する標準のワークフロー。テンプレートの選択の先頭のカテゴリとして出し、選んだら同梱の
// Workflow JSON を開く。ノードの種類はデータの中にだけあり、ここではノード名で分けない。
// ─────────────────────────────

/** 標準のワークフロー 1 件 */
interface BuiltinWorkflow {
  readonly name: string;
  readonly title: MessageKey;
  readonly description: MessageKey;
  /** 本体を読む。初めの読み込みに載せないよう、選んだときに取る */
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

/** テンプレートの選択に出す標準のワークフローのカテゴリ。題名と説明は画面の言語で出す */
export function builtinTemplateSection(): TemplateSection {
  return {
    title: t('comfy.template.builtinCategory'),
    templates: BUILTIN_WORKFLOWS.map(toTemplate),
  };
}

/** 標準のワークフローの本体を読む。標準のワークフローでなければ null */
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
    // サムネイルは持たない（題名だけの枠）
    mediaType: 'none',
    mediaSubtype: '',
    date: null,
    usage: null,
    size: null,
    builtin: true,
  };
}
