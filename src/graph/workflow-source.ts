import { isApiPrompt, workflowFromApiPrompt } from '@/graph/from-api-prompt';
import type { NodeDefinitionMap } from '@/graph/types';
import { t } from '@/i18n';
import { MEGABYTE } from '@/lib/file-size';
import { isPngData, readPngTextChunks } from '@/lib/png-text';

const PNG_WORKFLOW_KEY = 'workflow';
const PNG_PROMPT_KEY = 'prompt';
const WORKFLOW_FILE_MAX_MEGABYTES = 100;

type OpenedFile =
  | { readonly kind: 'workflow'; readonly source: unknown }
  | { readonly kind: 'image'; readonly texts: ReadonlyMap<string, string> };

export const WORKFLOW_FILE_MAX_BYTES = WORKFLOW_FILE_MAX_MEGABYTES * MEGABYTE;

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

function parseOrText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
