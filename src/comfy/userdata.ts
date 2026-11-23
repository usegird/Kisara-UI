import { fetchJson, type RequestOptions } from '@/comfy/client';
import { userdataListUrl } from '@/comfy/endpoints';
import { isNotFound } from '@/comfy/request-error';
import { toSlashPath } from '@/lib/file-name';
import { isRecord, isUnknownArray } from '@/lib/guards';

export async function listUserdataPaths(
  baseUrl: string,
  dir: string,
  options: RequestOptions = {},
): Promise<string[]> {
  let raw: unknown;
  try {
    raw = await fetchJson(userdataListUrl(baseUrl, dir), { cache: 'no-store', ...options });
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  if (!isUnknownArray(raw)) return [];
  return raw
    .map((entry) => (isRecord(entry) ? entry.path : entry))
    .filter((path): path is string => typeof path === 'string')
    .map((path) => toSlashPath(path));
}
