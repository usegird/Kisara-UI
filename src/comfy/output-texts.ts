import { isRecord, isUnknownArray } from '@/lib/guards';
import type { OutputText } from '@/port/files';

const TEXT_KEY = 'text';

export function parseOutputTexts(entry: unknown): OutputText[] {
  if (!isRecord(entry) || !isRecord(entry.outputs)) return [];

  const found: OutputText[] = [];
  for (const [nodeId, output] of Object.entries(entry.outputs)) {
    if (!isRecord(output)) continue;
    const texts = stringsOf(output[TEXT_KEY]);
    if (texts.length > 0) found.push({ nodeId, texts });
  }
  return found.sort((left, right) => compareNodeIds(left.nodeId, right.nodeId));
}

function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!isUnknownArray(value)) return [];
  return value.flatMap((item) => stringsOf(item));
}

function compareNodeIds(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true });
}
