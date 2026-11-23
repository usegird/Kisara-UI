import { fetchJson, fetchText, postText, type RequestOptions } from '@/comfy/client';
import { userdataItemUrl, userdataWriteUrl } from '@/comfy/endpoints';
import { isMissing, isNotFound } from '@/comfy/request-error';
import { listUserdataPaths } from '@/comfy/userdata';
import { KISARA_STYLES_DIR, styleFilePath } from '@/graph/kisara-files';
import {
  EMPTY_STYLE_TABLE,
  parseStyleFile,
  parseStyleTable,
  savedStyleName,
  serializeStyleFile,
  type SavedStyle,
  type StyleTable,
} from '@/graph/styles';

const STYLES_FILE = 'styles.csv';

export async function fetchStyleTable(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<StyleTable> {
  try {
    return parseStyleTable(await fetchText(userdataItemUrl(baseUrl, STYLES_FILE), options));
  } catch (error) {
    if (isNotFound(error)) return EMPTY_STYLE_TABLE;
    throw error;
  }
}

async function fetchSavedStyle(
  baseUrl: string,
  path: string,
  options: RequestOptions,
): Promise<SavedStyle | null> {
  try {
    const url = userdataItemUrl(baseUrl, `${KISARA_STYLES_DIR}/${path}`);
    return parseStyleFile(await fetchJson(url, { cache: 'no-store', ...options }));
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function fetchSavedStyles(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<SavedStyle[]> {
  const paths = (await listUserdataPaths(baseUrl, KISARA_STYLES_DIR, options))
    .filter((path) => path.endsWith('.json'))
    .sort();
  const entries = await Promise.all(paths.map((path) => fetchSavedStyle(baseUrl, path, options)));
  return entries.filter((entry) => entry !== null);
}

export async function saveStyle(
  baseUrl: string,
  entry: SavedStyle,
  options: RequestOptions = {},
): Promise<void> {
  const path = `${KISARA_STYLES_DIR}/${styleFilePath(savedStyleName(entry))}`;
  await postText(userdataWriteUrl(baseUrl, path, true), serializeStyleFile(entry), options);
}
