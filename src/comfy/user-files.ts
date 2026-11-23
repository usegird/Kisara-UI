import { deleteRequest, fetchJson, fetchText, type RequestOptions } from '@/comfy/client';
import { userdataItemUrl, userdataListUrl } from '@/comfy/endpoints';
import { isNotFound } from '@/comfy/request-error';
import { RUN_HISTORY_DIR } from '@/comfy/run-history';
import { KISARA_NOTES_DIR, KISARA_STYLES_DIR, KISARA_TAGS_DIR } from '@/graph/kisara-files';
import { toSlashPath } from '@/lib/file-name';
import { finiteNumber, isRecord, isUnknownArray } from '@/lib/guards';
import type { UserFile, UserFileKind } from '@/port/comfy-port';

const DIRS: Readonly<Record<UserFileKind, string>> = {
  history: RUN_HISTORY_DIR,
  notes: KISARA_NOTES_DIR,
  styles: KISARA_STYLES_DIR,
  tags: KISARA_TAGS_DIR,
};

const MS_PER_SECOND = 1000;
const SECONDS_LIKE_BELOW = 1e12;

function filePath(kind: UserFileKind, path: string): string {
  const parts = path.split('/');
  if (path === '' || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`invalid user file path: ${path}`);
  }
  return `${DIRS[kind]}/${path}`;
}

function modifiedOf(raw: unknown): number | null {
  const value = finiteNumber(raw);
  if (value === null) return null;
  return value < SECONDS_LIKE_BELOW ? Math.round(value * MS_PER_SECOND) : value;
}

function listEntry(raw: unknown): UserFile | null {
  const path = isRecord(raw) ? raw.path : raw;
  if (typeof path !== 'string') return null;
  return {
    path: toSlashPath(path),
    bytes: isRecord(raw) ? (finiteNumber(raw.size) ?? 0) : 0,
    modified: isRecord(raw) ? modifiedOf(raw.modified) : null,
  };
}

export async function listUserFiles(
  baseUrl: string,
  kind: UserFileKind,
  options: RequestOptions = {},
): Promise<UserFile[]> {
  let raw: unknown;
  try {
    raw = await fetchJson(userdataListUrl(baseUrl, DIRS[kind]), { cache: 'no-store', ...options });
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  if (!isUnknownArray(raw)) return [];
  return raw.map(listEntry).filter((entry) => entry !== null);
}

export async function readUserFile(
  baseUrl: string,
  kind: UserFileKind,
  path: string,
  options: RequestOptions = {},
): Promise<string | null> {
  try {
    return await fetchText(userdataItemUrl(baseUrl, filePath(kind, path)), {
      cache: 'no-store',
      ...options,
    });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function removeUserFile(
  baseUrl: string,
  kind: UserFileKind,
  path: string,
  options: RequestOptions = {},
): Promise<void> {
  try {
    await deleteRequest(userdataItemUrl(baseUrl, filePath(kind, path)), options);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}
