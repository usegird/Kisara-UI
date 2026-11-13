import { fetchJson, type RequestOptions } from '@/comfy/client';
import { templateFileUrl, templateIndexUrl } from '@/comfy/endpoints';
import type { TemplateSection, WorkflowTemplate } from '@/graph/template-filter';
import { DEFAULT_TEMPLATE_LOCALE } from '@/graph/template-locales';
import { finiteNumber, isRecord, isUnknownArray, stringArray, stringOr } from '@/lib/guards';
import type { TemplateIndex } from '@/port/workflows';

// ─────────────────────────────
// 接続先に同梱のワークフローテンプレートの一覧と中身を読む。
// ─────────────────────────────

function parseTemplate(raw: unknown): WorkflowTemplate | null {
  if (!isRecord(raw) || typeof raw.name !== 'string' || raw.name.length === 0) return null;

  const date = stringOr(raw.date);
  return {
    name: raw.name,
    title: stringOr(raw.title) || raw.name,
    description: stringOr(raw.description),
    tags: stringArray(raw.tags),
    models: stringArray(raw.models),
    mediaType: stringOr(raw.mediaType),
    mediaSubtype: stringOr(raw.mediaSubtype),
    date: date.length > 0 ? date : null,
    usage: finiteNumber(raw.usage),
    size: finiteNumber(raw.size),
  };
}

/**
 * 一覧（見出しの配列で、見出しが `templates[]` を持つ）を見出しごとの並びにする。
 * **形の合わない 1 件は落とし、全体は落とさない**
 */
export function parseTemplateIndex(raw: unknown): TemplateSection[] {
  if (!isUnknownArray(raw)) return [];

  const sections: TemplateSection[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || !isUnknownArray(entry.templates)) continue;

    const templates = entry.templates
      .map(parseTemplate)
      .filter((template): template is WorkflowTemplate => template !== null);
    if (templates.length === 0) continue;

    sections.push({ title: stringOr(entry.title) || stringOr(entry.category), templates });
  }
  return sections;
}

/**
 * 一覧。英語なら既定の一覧だけを取る。他の言語は**訳を先に取り、取れないか空なら既定の一覧**に
 * 落とす（版によっては訳が無い。本家の画面も JSON でなければ空として扱う）。
 */
export async function listTemplates(
  baseUrl: string,
  locale: string,
  options: RequestOptions = {},
): Promise<TemplateIndex> {
  if (locale !== DEFAULT_TEMPLATE_LOCALE) {
    try {
      const url = templateIndexUrl(baseUrl, locale);
      const sections = parseTemplateIndex(await fetchJson(url, options));
      if (sections.length > 0) return { sections, fellBack: false };
    } catch {
      // 訳が無い接続先。既定の一覧を取りに行く
    }
  }
  const sections = parseTemplateIndex(await fetchJson(templateIndexUrl(baseUrl), options));
  return { sections, fellBack: locale !== DEFAULT_TEMPLATE_LOCALE };
}

/** 本体は Workflow JSON そのもの。検証は `parseWorkflow` に任せる */
export function fetchTemplate(
  baseUrl: string,
  name: string,
  options: RequestOptions = {},
): Promise<unknown> {
  return fetchJson(templateFileUrl(baseUrl, `${name}.json`), options);
}

/** サムネイル。画像を持たないもの（音声など）は null */
export function templateThumbnailSrc(baseUrl: string, template: WorkflowTemplate): string | null {
  if (baseUrl.length === 0 || template.mediaType !== 'image' || template.mediaSubtype === '') {
    return null;
  }
  return templateFileUrl(baseUrl, `${template.name}-1.${template.mediaSubtype}`);
}
