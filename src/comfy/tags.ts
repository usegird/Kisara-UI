import { deleteRequest, fetchText, postText, type RequestOptions } from '@/comfy/client';
import { pysssssTagsUrl, userdataItemUrl, userdataWriteUrl } from '@/comfy/endpoints';
import { isNotFound } from '@/comfy/request-error';
import { listUserdataPaths } from '@/comfy/userdata';
import {
  KISARA_TAGS_DIR,
  PYSSSSS_OVERRIDE_FILE,
  tagDictionaryNameOf,
  tagDictionaryPath,
} from '@/graph/kisara-files';
import {
  parseTagRows,
  serializeTagRows,
  type TagDictionary,
  type TagEntry,
} from '@/graph/tag-dictionary';

const NO_STORE = { cache: 'no-store' } as const;

async function fetchTextOrNull(url: string, options: RequestOptions): Promise<string | null> {
  try {
    return await fetchText(url, { ...NO_STORE, ...options });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function fetchPysssssTags(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<TagEntry[] | null> {
  const text = await fetchTextOrNull(pysssssTagsUrl(baseUrl), options);
  return text === null ? null : parseTagRows(text);
}

export async function fetchTagDictionaries(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<TagDictionary[]> {
  const paths = (await listUserdataPaths(baseUrl, KISARA_TAGS_DIR, options))
    .filter((path) => tagDictionaryNameOf(path) !== null)
    .sort();
  const read = await Promise.all(
    paths.map(async (path) => {
      const url = userdataItemUrl(baseUrl, `${KISARA_TAGS_DIR}/${path}`);
      const text = await fetchTextOrNull(url, options);
      const name = tagDictionaryNameOf(path);
      return text === null || name === null ? null : { name, entries: parseTagRows(text) };
    }),
  );
  return read.filter((dictionary) => dictionary !== null);
}

export async function fetchPysssssOverrides(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<TagEntry[]> {
  const url = userdataItemUrl(baseUrl, `${KISARA_TAGS_DIR}/${PYSSSSS_OVERRIDE_FILE}`);
  const text = await fetchTextOrNull(url, options);
  return text === null ? [] : parseTagRows(text);
}

export async function saveTagDictionary(
  baseUrl: string,
  dictionary: TagDictionary,
  overwrite: boolean,
  options: RequestOptions = {},
): Promise<void> {
  const path = `${KISARA_TAGS_DIR}/${tagDictionaryPath(dictionary.name)}`;
  const url = userdataWriteUrl(baseUrl, path, overwrite);
  await postText(url, serializeTagRows(dictionary.entries), options);
}

export async function savePysssssOverrides(
  baseUrl: string,
  overrides: readonly TagEntry[],
  options: RequestOptions = {},
): Promise<void> {
  const path = `${KISARA_TAGS_DIR}/${PYSSSSS_OVERRIDE_FILE}`;
  await postText(userdataWriteUrl(baseUrl, path, true), serializeTagRows(overrides), options);
}

export async function removeTagDictionary(
  baseUrl: string,
  name: string,
  options: RequestOptions = {},
): Promise<void> {
  const url = userdataItemUrl(baseUrl, `${KISARA_TAGS_DIR}/${tagDictionaryPath(name)}`);
  try {
    await deleteRequest(url, options);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}
