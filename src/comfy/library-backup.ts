import {
  deleteRequest,
  fetchBytes,
  fetchJson,
  postBlob,
  postText,
  type RequestOptions,
} from '@/comfy/client';
import { userdataItemUrl, userdataWriteUrl } from '@/comfy/endpoints';
import { isMissing, isNotFound } from '@/comfy/request-error';
import { listUserdataPaths } from '@/comfy/userdata';
import type { LibraryItemFile, LibraryKind } from '@/port/comfy-port';

// ─────────────────────────────
// プリセット・システムプロンプトのテンプレート・追加辞書・プレイブック・アバターの控えを読み書きする。
// 中身は文字のまま受け渡し、形は上の層が読む。
// ─────────────────────────────

const DIRS: Readonly<Record<LibraryKind, string>> = {
  presets: 'kisara/presets',
  'system-prompts': 'kisara/system-prompts',
  dictionaries: 'kisara/dictionaries',
  playbooks: 'kisara/playbooks',
  avatars: 'kisara/avatars',
};

/** id として受け付ける形（ほかのフォルダへ出る経路を作らない） */
const ITEM_ID = /^[a-z0-9]+$/;

function itemPath(kind: LibraryKind, id: string, suffix: '.json' | '.png'): string {
  if (!ITEM_ID.test(id)) throw new Error(`invalid library id: ${id}`);
  return `${DIRS[kind]}/${id}${suffix}`;
}

/** 控えの全件（`<id>.json` の中身）。読めない 1 件は外す。フォルダが無ければ空 */
export async function listLibraryItems(
  baseUrl: string,
  kind: LibraryKind,
  options: RequestOptions = {},
): Promise<unknown[]> {
  const paths = (await listUserdataPaths(baseUrl, DIRS[kind], options)).filter(
    (path) => path.endsWith('.json') && ITEM_ID.test(path.slice(0, -'.json'.length)),
  );
  const items = await Promise.all(
    paths.map(async (path) => {
      try {
        const url = userdataItemUrl(baseUrl, `${DIRS[kind]}/${path}`);
        return await fetchJson(url, { cache: 'no-store', ...options });
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    }),
  );
  return items.filter((item) => item !== null);
}

/** 1 件の控えを書く（上書きする）。画像を渡せば画像も書く */
export async function saveLibraryItem(
  baseUrl: string,
  { kind, id, body, image }: LibraryItemFile,
  options: RequestOptions = {},
): Promise<void> {
  if (image !== null) {
    await postBlob(userdataWriteUrl(baseUrl, itemPath(kind, id, '.png'), true), image, options);
  }
  await postText(userdataWriteUrl(baseUrl, itemPath(kind, id, '.json'), true), body, options);
}

/** 1 件の画像の控え。無ければ null */
export async function fetchLibraryImage(
  baseUrl: string,
  kind: LibraryKind,
  id: string,
  options: RequestOptions = {},
): Promise<Blob | null> {
  try {
    const bytes = await fetchBytes(userdataItemUrl(baseUrl, itemPath(kind, id, '.png')), options);
    return new Blob([bytes], { type: 'image/png' });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * 1 件の控え（本文と画像）を消す。無ければ済み。
 * ファイルを消さない決まりの例外で、消すのは KisaraUI が書いたこれらのフォルダの、その id のファイルだけ
 */
export async function removeLibraryItem(
  baseUrl: string,
  kind: LibraryKind,
  id: string,
  options: RequestOptions = {},
): Promise<void> {
  for (const suffix of ['.json', '.png'] as const) {
    try {
      await deleteRequest(userdataItemUrl(baseUrl, itemPath(kind, id, suffix)), options);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
}
