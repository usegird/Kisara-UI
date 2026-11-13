import { deleteRequest, fetchJson, fetchText, type RequestOptions } from '@/comfy/client';
import { userdataItemUrl, userdataListUrl } from '@/comfy/endpoints';
import { isNotFound } from '@/comfy/request-error';
import { RUN_HISTORY_DIR } from '@/comfy/run-history';
import { KISARA_NOTES_DIR, KISARA_STYLES_DIR, KISARA_TAGS_DIR } from '@/graph/kisara-files';
import { toSlashPath } from '@/lib/file-name';
import { finiteNumber, isRecord, isUnknownArray } from '@/lib/guards';
import type { UserFile, UserFileKind } from '@/port/comfy-port';

// ─────────────────────────────
// ストレージの管理で見る・消す、ユーザーフォルダの KisaraUI の物（控えを除く）。
// ─────────────────────────────

const DIRS: Readonly<Record<UserFileKind, string>> = {
  history: RUN_HISTORY_DIR,
  notes: KISARA_NOTES_DIR,
  styles: KISARA_STYLES_DIR,
  tags: KISARA_TAGS_DIR,
};

const MS_PER_SECOND = 1000;
/** これ未満の時刻は秒とみなす（ミリ秒なら 2001 年 9 月より前になる） */
const SECONDS_LIKE_BELOW = 1e12;

/** フォルダの中の経路として受け付ける形（外へ出る `..`・頭の `/` を作らない） */
function filePath(kind: UserFileKind, path: string): string {
  const parts = path.split('/');
  if (path === '' || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`invalid user file path: ${path}`);
  }
  return `${DIRS[kind]}/${path}`;
}

/**
 * 最後に書いた時刻（ミリ秒）。この経路はミリ秒で返すが、同じ項目を秒で返す経路もあり、
 * 版によって秒で返るかは確かめていないので、秒らしい値は 1000 倍する
 */
function modifiedOf(raw: unknown): number | null {
  const value = finiteNumber(raw);
  if (value === null) return null;
  return value < SECONDS_LIKE_BELOW ? Math.round(value * MS_PER_SECOND) : value;
}

/** 一覧の 1 件。`full_info` の形（`{path, size, modified}`）と、名前だけの形の両方を読む */
function listEntry(raw: unknown): UserFile | null {
  const path = isRecord(raw) ? raw.path : raw;
  if (typeof path !== 'string') return null;
  return {
    path: toSlashPath(path),
    bytes: isRecord(raw) ? (finiteNumber(raw.size) ?? 0) : 0,
    modified: isRecord(raw) ? modifiedOf(raw.modified) : null,
  };
}

/** フォルダの中のファイル（大きさと最後に書いた時刻）。フォルダが無ければ空 */
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

/** 1 つのファイルの中身（文字のまま）。無ければ null */
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

/**
 * 1 つのファイルを消す。**接続先のファイルを消す**。無ければ済み。
 * ファイルを消さない決まりの例外で、消すのは一覧に出た 1 つのファイルだけ
 */
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
