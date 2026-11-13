import { isApiPrompt, workflowFromApiPrompt } from '@/graph/from-api-prompt';
import type { NodeDefinitionMap } from '@/graph/types';
import { t } from '@/i18n';
import { MEGABYTE } from '@/lib/file-size';
import { isPngData, readPngTextChunks } from '@/lib/png-text';

// ─────────────────────────────
// 開くファイル（JSON・PNG）の中身から、Workflow JSON の元を取り出す。形は確かめない（`parseWorkflow` が
// 確かめる）。読めなければ理由付きで throw する。
// ─────────────────────────────

/** PNG に埋め込まれた Workflow JSON / API Prompt Format のキーワード（ComfyUI が書く名前） */
const PNG_WORKFLOW_KEY = 'workflow';
const PNG_PROMPT_KEY = 'prompt';
/** 開くワークフローのファイルの上限（MB） */
const WORKFLOW_FILE_MAX_MEGABYTES = 100;

/** 開いたファイルの中身。ワークフローとして開くか、画像のタブで埋め込みを見せるか */
type OpenedFile =
  | { readonly kind: 'workflow'; readonly source: unknown }
  /** ワークフローを持たない画像。文字の埋め込み（キーワード → 本文）だけがある */
  | { readonly kind: 'image'; readonly texts: ReadonlyMap<string, string> };

/** 開くワークフローのファイル（JSON・PNG）の大きさの上限。大きな画像の PNG を含む */
export const WORKFLOW_FILE_MAX_BYTES = WORKFLOW_FILE_MAX_MEGABYTES * MEGABYTE;

/**
 * 開いたファイルの中身を、ワークフローの元か、埋め込みだけを持つ画像に読み分ける。
 * @param definitions - `prompt` から組み立てるときに、値と入力の口を分けるのに使う
 */
export function readOpenedFile(buffer: ArrayBuffer, definitions: NodeDefinitionMap): OpenedFile {
  if (!isPngData(buffer)) {
    return { kind: 'workflow', source: JSON.parse(new TextDecoder().decode(buffer)) as unknown };
  }

  const chunks = readPngTextChunks(buffer);
  const text = chunks.get(PNG_WORKFLOW_KEY);
  if (text !== undefined) return { kind: 'workflow', source: JSON.parse(text) as unknown };

  const prompt = chunks.get(PNG_PROMPT_KEY);
  const parsed = prompt === undefined ? undefined : parseOrText(prompt);
  if (isApiPrompt(parsed)) {
    return { kind: 'workflow', source: workflowFromApiPrompt(parsed, definitions) };
  }
  if (chunks.size > 0) return { kind: 'image', texts: chunks };
  throw new Error(t('graph.png.empty'));
}

/** JSON として読めなければ文字のまま（他のツールが同じ名前で文字を書くことがある） */
function parseOrText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
