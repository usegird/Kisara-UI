import { matchesAnyTerm, rankBySearch, searchTerms } from '@/lib/search-terms';

export interface WorkflowTemplate {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly models: readonly string[];
  readonly mediaType: string;
  readonly mediaSubtype: string;
  readonly date: string | null;
  readonly usage: number | null;
  readonly size: number | null;
  readonly builtin?: boolean | undefined;
}

export interface TemplateSection {
  readonly title: string;
  readonly templates: readonly WorkflowTemplate[];
}

export type TemplateSortKey = 'default' | 'popular' | 'newest' | 'name' | 'size';

interface TemplateCategory {
  readonly index: number;
  readonly title: string;
  readonly count: number;
}

export function templateCategories(sections: readonly TemplateSection[]): TemplateCategory[] {
  return sections.map((section, index) => ({
    index,
    title: section.title,
    count: section.templates.length,
  }));
}

export function allTemplates(sections: readonly TemplateSection[]): WorkflowTemplate[] {
  const seen = new Set<string>();
  const result: WorkflowTemplate[] = [];
  for (const section of sections) {
    for (const template of section.templates) {
      if (seen.has(template.name)) continue;
      seen.add(template.name);
      result.push(template);
    }
  }
  return result;
}

interface TemplateFilter {
  readonly category: number | null;
  readonly query: string;
}

function searchable(template: WorkflowTemplate): string[] {
  return [template.title, template.description, ...template.tags, ...template.models];
}

function matches(template: WorkflowTemplate, terms: readonly string[]): boolean {
  return matchesAnyTerm(searchable(template), terms);
}

export function rankTemplates(
  templates: readonly WorkflowTemplate[],
  query: string,
): WorkflowTemplate[] {
  return rankBySearch(templates, query, (template) => ({
    names: [template.title],
    texts: searchable(template),
  }));
}

export function filterTemplates(
  sections: readonly TemplateSection[],
  { category, query }: TemplateFilter,
): WorkflowTemplate[] {
  const source =
    category === null ? allTemplates(sections) : [...(sections[category]?.templates ?? [])];
  const terms = searchTerms(query);
  return source.filter((template) => matches(template, terms));
}

function byValue<T>(
  value: (template: WorkflowTemplate) => T | null,
  compare: (left: T, right: T) => number,
): (left: WorkflowTemplate, right: WorkflowTemplate) => number {
  return (left, right) => {
    const a = value(left);
    const b = value(right);
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return compare(a, b);
  };
}

const COMPARATORS: Readonly<
  Record<
    Exclude<TemplateSortKey, 'default'>,
    (left: WorkflowTemplate, right: WorkflowTemplate) => number
  >
> = {
  popular: byValue(
    (template) => template.usage,
    (a, b) => b - a,
  ),
  newest: byValue(
    (template) => template.date,
    (a, b) => b.localeCompare(a),
  ),
  name: (left, right) => left.title.localeCompare(right.title),
  size: byValue(
    (template) => template.size,
    (a, b) => a - b,
  ),
};

export function sortTemplates(
  templates: readonly WorkflowTemplate[],
  key: TemplateSortKey,
): WorkflowTemplate[] {
  return key === 'default' ? [...templates] : [...templates].sort(COMPARATORS[key]);
}
