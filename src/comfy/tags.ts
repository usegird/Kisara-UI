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

// ─────────────────────────────
// タグ辞書の読み書き。pysssss の一覧は読むだけで、書くのは `kisara/tags/` の辞書と pysssss の上書きだけ
// （合わせるのはストア）。
// ─────────────────────────────

/** 書いた直後に読み直すので、ブラウザのキャッシュを通さない */
const NO_STORE = { cache: 'no-store' } as const;

/** 無ければ null（置いていないだけで、失敗ではない） */
async function fetchTextOrNull(url: string, options: RequestOptions): Promise<string | null> {
  try {
    return await fetchText(url, { ...NO_STORE, ...options });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** pysssss の補完の一覧。拡張か一覧のファイルが無ければ null */
export async function fetchPysssssTags(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<TagEntry[] | null> {
  const text = await fetchTextOrNull(pysssssTagsUrl(baseUrl), options);
  return text === null ? null : parseTagRows(text);
}

/** `kisara/tags/` の辞書の全件。ファイル名の順に返す。読む間に消えたファイルは外す */
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

/** pysssss の上書き（辞書と同じ形の行）。ファイルが無ければ空 */
export async function fetchPysssssOverrides(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<TagEntry[]> {
  const url = userdataItemUrl(baseUrl, `${KISARA_TAGS_DIR}/${PYSSSSS_OVERRIDE_FILE}`);
  const text = await fetchTextOrNull(url, options);
  return text === null ? [] : parseTagRows(text);
}

/**
 * 辞書 1 つを丸ごと書く。`overwrite` が false なら、同じ名前のファイルがあるとき接続先が断る
 * （新しく作る・取り込むとき）
 */
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

/** pysssss の上書きのファイルを丸ごと書く（辞書と同じ 4 列の形） */
export async function savePysssssOverrides(
  baseUrl: string,
  overrides: readonly TagEntry[],
  options: RequestOptions = {},
): Promise<void> {
  const path = `${KISARA_TAGS_DIR}/${PYSSSSS_OVERRIDE_FILE}`;
  await postText(userdataWriteUrl(baseUrl, path, true), serializeTagRows(overrides), options);
}

/**
 * 辞書のファイルを消す。**接続先のファイルを消す**。無ければ済み。
 * ファイルを消さない決まりの例外で、消すのは辞書の画面で選んだ 1 つだけ
 */
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
