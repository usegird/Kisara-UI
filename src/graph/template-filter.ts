import { matchesAnyTerm, rankBySearch, searchTerms } from '@/lib/search-terms';

// ─────────────────────────────
// 同梱テンプレートの一覧（`/templates/index.json` の射影）のカテゴリ・絞り込み・並び替え。純関数だけを置く。
// ─────────────────────────────

/** 同梱テンプレート 1 件 */
export interface WorkflowTemplate {
  /** 本体とサムネイルの名前（`{name}.json`） */
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly models: readonly string[];
  /** `image` / `audio` など。サムネイルを出せるのは `image` だけ */
  readonly mediaType: string;
  /** サムネイルの拡張子（`webp` など） */
  readonly mediaSubtype: string;
  /** `YYYY-MM-DD`。無ければ null */
  readonly date: string | null;
  /** 使われた数。無ければ null */
  readonly usage: number | null;
  /** 要るモデルの大きさ（バイト）。無ければ null */
  readonly size: number | null;
  /**
   * 本体に同梱の標準のワークフローか（接続先から取らない）
   */
  readonly builtin?: boolean | undefined;
}

/** 一覧の見出し 1 つと、そこに載るテンプレート */
export interface TemplateSection {
  readonly title: string;
  readonly templates: readonly WorkflowTemplate[];
}

/** 並び替えの鍵。`default` は一覧の並びのまま */
export type TemplateSortKey = 'default' | 'popular' | 'newest' | 'name' | 'size';

/** 左の一覧の 1 行。`index` は見出しの位置（同じ題名の見出しがあっても区別できる） */
interface TemplateCategory {
  readonly index: number;
  readonly title: string;
  readonly count: number;
}

/** 左のカテゴリの一覧を、見出しの並びのまま件数を添えて作る */
export function templateCategories(sections: readonly TemplateSection[]): TemplateCategory[] {
  return sections.map((section, index) => ({
    index,
    title: section.title,
    count: section.templates.length,
  }));
}

/** 「すべて」の一覧。複数のカテゴリに同じものが載るので、同じものは 1 つにまとめる */
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

/** テンプレートの絞り込みの条件 */
interface TemplateFilter {
  /** 見出しの位置。null なら「すべて」 */
  readonly category: number | null;
  /** 題名・説明・タグ・モデル名の部分一致。大小を区別しない。空白で区切った語は OR */
  readonly query: string;
}

function searchable(template: WorkflowTemplate): string[] {
  return [template.title, template.description, ...template.tags, ...template.models];
}

function matches(template: WorkflowTemplate, terms: readonly string[]): boolean {
  return matchesAnyTerm(searchable(template), terms);
}

/**
 * 絞り込みの入力で並べ直す。前方一致は題名。同じ順位は並び替えの指定のまま
 */
export function rankTemplates(
  templates: readonly WorkflowTemplate[],
  query: string,
): WorkflowTemplate[] {
  return rankBySearch(templates, query, (template) => ({
    names: [template.title],
    texts: searchable(template),
  }));
}

/** 選んだカテゴリ（null なら「すべて」）のうち、入力の語に合うテンプレート */
export function filterTemplates(
  sections: readonly TemplateSection[],
  { category, query }: TemplateFilter,
): WorkflowTemplate[] {
  const source =
    category === null ? allTemplates(sections) : [...(sections[category]?.templates ?? [])];
  const terms = searchTerms(query);
  return source.filter((template) => matches(template, terms));
}

/** 値の無いものは末尾へ送る。同じ値どうしは元の並びを保つ（sort は安定） */
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

/** 鍵で並べ替えた新しい配列。値の無いものは末尾へ送る */
export function sortTemplates(
  templates: readonly WorkflowTemplate[],
  key: TemplateSortKey,
): WorkflowTemplate[] {
  return key === 'default' ? [...templates] : [...templates].sort(COMPARATORS[key]);
}
