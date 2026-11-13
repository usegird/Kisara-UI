import type { WorkflowTemplate } from '@/graph/template-filter';

// ─────────────────────────────
// テンプレートの一覧の 1 件（接続先の同梱テンプレート）。`WorkflowTemplate` の形が変わったら**ここだけ**直す。
// ─────────────────────────────

/** 接続先のテンプレート 1 件。題名は名前と同じ */
export function template(name: string, extra: Partial<WorkflowTemplate> = {}): WorkflowTemplate {
  return {
    name,
    title: name,
    description: '',
    tags: [],
    models: [],
    mediaType: 'image',
    mediaSubtype: 'webp',
    date: null,
    usage: null,
    size: null,
    ...extra,
  };
}
