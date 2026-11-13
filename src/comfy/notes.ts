import { fetchText, postText, type RequestOptions } from '@/comfy/client';
import { userdataItemUrl, userdataWriteUrl } from '@/comfy/endpoints';
import { isNotFound } from '@/comfy/request-error';
import { listUserdataPaths } from '@/comfy/userdata';
import { KISARA_NOTES_DIR, notesFilePath } from '@/graph/kisara-files';
import type { ModelNoteFile } from '@/port/comfy-port';

// ─────────────────────────────
// `kisara/notes/` のモデルのメモを読み書きする（消す・移す操作は持たない。どれを読むかはストアが決める）。
// ─────────────────────────────

/** 保存したメモの経路（`kisara/notes` からの相対）。置き場がまだ無ければ空 */
export async function listSavedNotes(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<ReadonlySet<string>> {
  return new Set(await listUserdataPaths(baseUrl, KISARA_NOTES_DIR, options));
}

function notesPath(folder: string, filename: string): string {
  return `${KISARA_NOTES_DIR}/${notesFilePath(folder, filename)}`;
}

/** 保存したメモ。無ければ null */
export async function fetchSavedNotes(
  baseUrl: string,
  folder: string,
  filename: string,
  options: RequestOptions = {},
): Promise<string | null> {
  try {
    const url = userdataItemUrl(baseUrl, notesPath(folder, filename));
    return await fetchText(url, { cache: 'no-store', ...options });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** メモを書く。あれば上書きする（無ければ作られる） */
export async function saveNotes(
  baseUrl: string,
  { folder, filename, text }: ModelNoteFile,
  options: RequestOptions = {},
): Promise<void> {
  await postText(userdataWriteUrl(baseUrl, notesPath(folder, filename), true), text, options);
}
