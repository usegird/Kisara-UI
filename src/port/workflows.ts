import type { TemplateSection } from '@/graph/template-filter';

export interface SavedWorkflow {
  readonly path: string;
  readonly name: string;
  readonly size: number | null;
  readonly modified: number | null;
}

export type WorkflowSaveFailure = 'exists' | 'exists-foreign' | 'not-owned';

export interface TemplateIndex {
  readonly sections: TemplateSection[];
  readonly fellBack: boolean;
}
