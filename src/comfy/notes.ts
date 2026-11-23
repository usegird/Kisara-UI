import { fetchText, postText, type RequestOptions } from '@/comfy/client';
import { userdataItemUrl, userdataWriteUrl } from '@/comfy/endpoints';
import { isNotFound } from '@/comfy/request-error';
import { listUserdataPaths } from '@/comfy/userdata';
import { jsonEditsFilePath, KISARA_NOTES_DIR, notesFilePath } from '@/graph/kisara-files';
import {
  parseModelJsonEdits,
  serializeModelJsonEdits,
  type ModelJsonEditValue,
} from '@/graph/model-json-edits';
import type { ModelJsonEditsFile, ModelNoteFile } from '@/port/models';

export async function listSavedNotes(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<ReadonlySet<string>> {
  return new Set(await listUserdataPaths(baseUrl, KISARA_NOTES_DIR, options));
}

function notesPath(folder: string, filename: string): string {
  return `${KISARA_NOTES_DIR}/${notesFilePath(folder, filename)}`;
}

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

function jsonEditsPath(folder: string, filename: string): string {
  return `${KISARA_NOTES_DIR}/${jsonEditsFilePath(folder, filename)}`;
}

export async function fetchJsonEdits(
  baseUrl: string,
  folder: string,
  filename: string,
  options: RequestOptions = {},
): Promise<Map<string, ModelJsonEditValue>> {
  let text: string;
  try {
    const url = userdataItemUrl(baseUrl, jsonEditsPath(folder, filename));
    text = await fetchText(url, { cache: 'no-store', ...options });
  } catch (error) {
    if (isNotFound(error)) return new Map();
    throw error;
  }
  try {
    return parseModelJsonEdits(JSON.parse(text));
  } catch {
    return new Map();
  }
}

export async function saveJsonEdits(
  baseUrl: string,
  { folder, filename, edits }: ModelJsonEditsFile,
  options: RequestOptions = {},
): Promise<void> {
  const url = userdataWriteUrl(baseUrl, jsonEditsPath(folder, filename), true);
  await postText(url, serializeModelJsonEdits(edits), options);
}

export async function saveNotes(
  baseUrl: string,
  { folder, filename, text }: ModelNoteFile,
  options: RequestOptions = {},
): Promise<void> {
  await postText(userdataWriteUrl(baseUrl, notesPath(folder, filename), true), text, options);
}
