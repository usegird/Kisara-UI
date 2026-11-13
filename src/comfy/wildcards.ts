import { fetchJson, type RequestOptions } from '@/comfy/client';
import { wildcardListUrl } from '@/comfy/endpoints';
import { isNotFound } from '@/comfy/request-error';
import { parseWildcardList } from '@/comfy/schema';

// ─────────────────────────────
// ワイルドカードの名前の一覧を読む。
// ─────────────────────────────

/**
 * ワイルドカードの名前の一覧。**本体の経路ではなく**（Impact Pack が足すもの）、入っていない接続先では
 * 404 になるので、使えない接続先（経路が無い・形が違う）なら null（呼び出し側はアイコンを出さない）
 */
export async function fetchWildcards(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<string[] | null> {
  try {
    return parseWildcardList(await fetchJson(wildcardListUrl(baseUrl), options));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}
