import type { WorkflowTemplate } from '@/graph/template-filter';

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
