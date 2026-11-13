import { fetchJson, type RequestOptions } from '@/comfy/client';
import { nodeFrequencyUrl } from '@/comfy/endpoints';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// ノードの利用頻度の表を読む（ノード検索の「よく使うもの」に使う）。
// ─────────────────────────────

/**
 * 応答（`{ ノード名: 回数 }`）をノード名の並び（回数の多い順。同数は元の順）にする。形が違えば空。
 * 回数が数でないものは落とし、全体は落とさない
 */
export function parseNodeFrequency(raw: unknown): string[] {
  if (!isRecord(raw)) return [];

  return Object.entries(raw)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([name, count], index) => ({ name, count, index }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((entry) => entry.name);
}

/** 利用頻度の表を取る。ノード名の並び（多い順） */
export async function fetchNodeFrequency(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<string[]> {
  return parseNodeFrequency(await fetchJson(nodeFrequencyUrl(baseUrl), options));
}
