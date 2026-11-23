import { fetchJson, postJson, type RequestOptions } from '@/comfy/client';
import { wildcardExpandUrl, wildcardListUrl } from '@/comfy/endpoints';
import { ComfyRequestError, isNotFound } from '@/comfy/request-error';
import { parseWildcardExpansion, parseWildcardList } from '@/comfy/schema';

const SELECT_ALL_COUNT = 9999;

const ENTRY_SEPARATOR = '␞';

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

export async function fetchWildcardEntries(
  baseUrl: string,
  name: string,
  options: RequestOptions = {},
): Promise<string[] | null> {
  const body = { text: `{${String(SELECT_ALL_COUNT)}$$${ENTRY_SEPARATOR}$$${name}}` };
  const url = wildcardExpandUrl(baseUrl);
  let raw: unknown;
  try {
    raw = await postJson(url, body, options);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const text = parseWildcardExpansion(raw);
  if (text === null) throw new ComfyRequestError('parse', url);
  return text
    .split(ENTRY_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .sort((a, b) => a.localeCompare(b));
}
