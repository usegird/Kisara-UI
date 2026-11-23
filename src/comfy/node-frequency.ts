import { fetchJson, type RequestOptions } from '@/comfy/client';
import { nodeFrequencyUrl } from '@/comfy/endpoints';
import { isRecord } from '@/lib/guards';

export function parseNodeFrequency(raw: unknown): string[] {
  if (!isRecord(raw)) return [];

  return Object.entries(raw)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([name, count], index) => ({ name, count, index }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((entry) => entry.name);
}

export async function fetchNodeFrequency(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<string[]> {
  return parseNodeFrequency(await fetchJson(nodeFrequencyUrl(baseUrl), options));
}
