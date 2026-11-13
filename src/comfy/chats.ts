import {
  ComfyRequestError,
  deleteRequest,
  fetchJson,
  postText,
  type RequestOptions,
} from '@/comfy/client';
import { userdataItemUrl, userdataWriteUrl } from '@/comfy/endpoints';
import { isMissing, isNotFound } from '@/comfy/request-error';
import { listUserdataPaths } from '@/comfy/userdata';
import type { ChatFiles } from '@/port/comfy-port';

// ─────────────────────────────
// 置き場を ComfyUI にした会話の、本文と一覧の項目の 2 つのファイルを読み書きする。
// ─────────────────────────────

/** 会話のファイルを置く、ユーザーフォルダの中のフォルダ */
const KISARA_CHATS_DIR = 'kisara/chats';
const META_SUFFIX = '.meta.json';
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_INSUFFICIENT_STORAGE = 507;

/** 会話の id として受け付ける形（ほかのフォルダへ出る経路を作らない） */
const CHAT_ID = /^[a-z0-9]+$/;

function chatPath(id: string, suffix: string): string {
  if (!CHAT_ID.test(id)) throw new Error(`invalid chat id: ${id}`);
  return `${KISARA_CHATS_DIR}/${id}${suffix}`;
}

/** 一覧の項目の全件（`.meta.json` の中身）。読めない 1 件は外す */
export async function listChatMetas(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<unknown[]> {
  const paths = (await listUserdataPaths(baseUrl, KISARA_CHATS_DIR, options)).filter((path) =>
    path.endsWith(META_SUFFIX),
  );
  const metas = await Promise.all(
    paths.map(async (path) => {
      try {
        const url = userdataItemUrl(baseUrl, `${KISARA_CHATS_DIR}/${path}`);
        return await fetchJson(url, { cache: 'no-store', ...options });
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    }),
  );
  return metas.filter((meta) => meta !== null);
}

/** 会話のファイル。無い・JSON でなければ null */
export async function fetchChatFile(
  baseUrl: string,
  id: string,
  options: RequestOptions = {},
): Promise<unknown> {
  try {
    return await fetchJson(userdataItemUrl(baseUrl, chatPath(id, '.json')), {
      cache: 'no-store',
      ...options,
    });
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** 本文を書いてから一覧の項目を書く（一覧に出たものは本文が読める） */
export async function saveChatFiles(
  baseUrl: string,
  { id, body, meta }: ChatFiles,
  options: RequestOptions = {},
): Promise<void> {
  await postText(userdataWriteUrl(baseUrl, chatPath(id, '.json'), true), body, options);
  await postText(userdataWriteUrl(baseUrl, chatPath(id, META_SUFFIX), true), meta, options);
}

/**
 * 一覧の項目を消してから本文を消す（途中で止まっても一覧に読めない会話を残さない）。無ければ済み。
 * ファイルを消さない決まりの例外で、消すのは会話の 2 つのファイルだけ
 */
export async function removeChatFiles(
  baseUrl: string,
  id: string,
  options: RequestOptions = {},
): Promise<void> {
  for (const suffix of [META_SUFFIX, '.json']) {
    try {
      await deleteRequest(userdataItemUrl(baseUrl, chatPath(id, suffix)), options);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
}

/** 置き場の容量の不足か（大きすぎる要求 413・ディスクの不足 507） */
export function isStorageFull(error: unknown): boolean {
  return (
    error instanceof ComfyRequestError &&
    (error.status === HTTP_PAYLOAD_TOO_LARGE || error.status === HTTP_INSUFFICIENT_STORAGE)
  );
}
