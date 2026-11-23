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

const KISARA_CHATS_DIR = 'kisara/chats';
const META_SUFFIX = '.meta.json';
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_INSUFFICIENT_STORAGE = 507;

const CHAT_ID = /^[a-z0-9]+$/;

function chatPath(id: string, suffix: string): string {
  if (!CHAT_ID.test(id)) throw new Error(`invalid chat id: ${id}`);
  return `${KISARA_CHATS_DIR}/${id}${suffix}`;
}

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

export async function saveChatFiles(
  baseUrl: string,
  { id, body, meta }: ChatFiles,
  options: RequestOptions = {},
): Promise<void> {
  await postText(userdataWriteUrl(baseUrl, chatPath(id, '.json'), true), body, options);
  await postText(userdataWriteUrl(baseUrl, chatPath(id, META_SUFFIX), true), meta, options);
}

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

export function isStorageFull(error: unknown): boolean {
  return (
    error instanceof ComfyRequestError &&
    (error.status === HTTP_PAYLOAD_TOO_LARGE || error.status === HTTP_INSUFFICIENT_STORAGE)
  );
}
