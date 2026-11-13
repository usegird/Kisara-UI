import { parseDictionary } from '@/chat/dictionary';
import { isStreaming } from '@/chat/edit';
import { BROWSER_PLACE } from '@/chat/types';
import { approxBytes } from '@/lib/approx-bytes';
import { isRecord } from '@/lib/guards';
import type { LibraryKind } from '@/port/comfy-port';
import { restoreChats } from '@/store/chat/chat-library';
import { withAppStore } from '@/store/persist/app-db';
import {
  listChatsIn,
  loadChatFrom,
  loadRawChat,
  removeChatFrom,
  saveChatTo,
} from '@/store/persist/chat-repo';
import {
  backupLibraryItem,
  parseAvatarBackup,
  restoreLibrary,
  type RestoreResult,
} from '@/store/persist/library-backup';
import {
  INDEXED_DB_TABLES,
  sortItems,
  type IndexedDbTable,
  type StorageItem,
} from '@/store/persist/storage-usage';
import { comfyPort } from '@/store/ports/comfy-port';
import { useChatStore } from '@/store/use-chat-store';
import { connectedComfyUrl } from '@/store/use-connection-store';
import { parseOwnPlaybook } from '@/store/use-playbooks-store';
import { parsePreset } from '@/store/use-presets-store';
import { parseTemplate } from '@/store/use-system-prompts-store';

// ─────────────────────────────
// ComfyUI の控えの一覧・取る・戻す・消す。戻すときと同じ読み方をする。消すのは削除の印を適用した
// ものだけ（控えを消さない決まりの例外）。
// ─────────────────────────────

/** 1 日のミリ秒 */
const MS_PER_DAY = 86_400_000;

/** 古いと知らせる控えの、最後に変えてからの日数 */
const STALE_BACKUP_DAYS = 30;

/** ComfyUI の控えの種類 */
export type BackupKind = 'chats' | LibraryKind;

export const BACKUP_KINDS: readonly BackupKind[] = [
  'chats',
  'presets',
  'system-prompts',
  'dictionaries',
  'playbooks',
  'avatars',
];

/**
 * 控えを書く表と、その控えの種類。控えの id は表の鍵と同じ
 */
export const BACKUP_OF: Readonly<Partial<Record<IndexedDbTable, BackupKind>>> = {
  chat: 'chats',
  preset: 'presets',
  'system-prompt': 'system-prompts',
  dictionary: 'dictionaries',
  playbook: 'playbooks',
  avatar: 'avatars',
};

/** 控えの 1 件の名前と時刻。形が違えば null */
function libraryItem(kind: LibraryKind, raw: unknown): Omit<StorageItem, 'bytes' | 'known'> | null {
  const found =
    kind === 'presets'
      ? parsePreset(raw)
      : kind === 'system-prompts'
        ? parseTemplate(raw)
        : kind === 'dictionaries'
          ? parseDictionary(raw)
          : null;
  if (found !== null) return { key: found.id, name: found.name, updatedAt: found.updatedAt };
  const avatar = kind === 'avatars' ? parseAvatarBackup(raw) : null;
  if (avatar !== null) return { key: avatar.id, name: avatar.name, updatedAt: avatar.createdAt };
  const own = kind === 'playbooks' ? parseOwnPlaybook(raw) : null;
  return own === null ? null : { key: own.id, name: own.playbook.name, updatedAt: own.updatedAt };
}

/** 種類ごとの控えの一覧（新しい順）。つないでいなければ null。読めなければ投げる */
export async function listBackups(kind: BackupKind): Promise<StorageItem[] | null> {
  const baseUrl = connectedComfyUrl();
  if (baseUrl === null) return null;
  const items: StorageItem[] =
    kind === 'chats'
      ? (await listChatsIn({ kind: 'comfy', baseUrl })).map((meta) => ({
          key: meta.id,
          name: meta.name || meta.head,
          known: null,
          updatedAt: meta.updatedAt,
          bytes: meta.size,
        }))
      : (await comfyPort().library.list(baseUrl, kind)).flatMap((raw) => {
          const item = libraryItem(kind, raw);
          return item === null ? [] : [{ ...item, known: null, bytes: approxBytes(raw) }];
        });
  return sortItems(items);
}

/**
 * 控えの 1 件を消す。**接続先のファイルを消す**（ストレージの管理で削除を適用したときだけ呼ぶ）。
 * ブラウザの物は消さない。つないでいなければ投げる
 */
export async function deleteBackup(kind: BackupKind, key: string): Promise<void> {
  const baseUrl = connectedComfyUrl();
  if (baseUrl === null) throw new Error('ComfyUI is not connected');
  if (kind === 'chats') await removeChatFrom(key, { kind: 'comfy', baseUrl });
  else await comfyPort().library.remove(baseUrl, kind, key);
}

/**
 * ブラウザの 1 件の控えを今すぐ書く（ストレージの管理のバックアップ取得）。控えを書く設定に関わらず、
 * つないでいる先へ書く。会話は開いていれば開いている中身を書き、受け取り中なら書かない。書けたら true
 */
export async function takeBackup(kind: BackupKind, key: string): Promise<boolean> {
  if (kind !== 'chats') return backupLibraryItem(kind, key);
  const baseUrl = connectedComfyUrl();
  if (baseUrl === null) return false;
  try {
    const chat = useChatStore.getState().chats[key] ?? (await loadChatFrom(key, BROWSER_PLACE));
    if (chat === null || isStreaming(chat)) return false;
    await saveChatTo(key, chat, { kind: 'comfy', baseUrl });
    return true;
  } catch {
    return false;
  }
}

/**
 * 控えの 1 件の中身をそのまま読む（ストレージの管理の生データ。戻すときと同じ読み方）。無ければ null。
 * つないでいなければ投げる
 */
export async function readBackupRaw(kind: BackupKind, key: string): Promise<unknown> {
  const baseUrl = connectedComfyUrl();
  if (baseUrl === null) throw new Error('ComfyUI is not connected');
  if (kind === 'chats') return loadRawChat(key, { kind: 'comfy', baseUrl });
  const all = await comfyPort().library.list(baseUrl, kind);
  return all.find((raw) => isRecord(raw) && raw.id === key) ?? null;
}

/**
 * 古いと知らせる控えの、最後に変えてからの長さ（30 日）
 */
export const STALE_BACKUP_MS = STALE_BACKUP_DAYS * MS_PER_DAY;

/**
 * ブラウザに元の無い控え（ブラウザに同じ鍵の 1 件が無いもの）
 */
export function orphanBackups(
  backups: readonly StorageItem[],
  browser: readonly StorageItem[],
): StorageItem[] {
  const keys = new Set(browser.map((item) => item.key));
  return backups.filter((item) => !keys.has(item.key));
}

/** 最後に変えてから 30 日より前か（時刻の無い物は古いとしない） */
export function isStaleBackup(item: StorageItem, now: number): boolean {
  return item.updatedAt !== null && now - item.updatedAt >= STALE_BACKUP_MS;
}

/** 表の鍵だけを読む（会話は一覧の表） */
async function tableKeys(table: IndexedDbTable): Promise<StorageItem[]> {
  if (typeof globalThis.indexedDB === 'undefined') return [];
  const store = table === 'chat' ? 'chat-meta' : table;
  const keys = await withAppStore(indexedDB, store, 'readonly', (s) => s.getAllKeys());
  return keys.flatMap((key) =>
    typeof key === 'string' ? [{ key, name: '', known: null, updatedAt: null, bytes: 0 }] : [],
  );
}

/**
 * ブラウザに元の無い控えのうち、30 日より前の物があるか（つないだときの知らせ）。
 * つないでいなければ false。読めなければ投げる
 */
export async function hasStaleBackups(now: number): Promise<boolean> {
  for (const table of INDEXED_DB_TABLES) {
    const kind = BACKUP_OF[table];
    if (kind === undefined) continue;
    const backups = await listBackups(kind);
    if (backups === null) return false;
    const browser = await tableKeys(table);
    if (orphanBackups(backups, browser).some((item) => isStaleBackup(item, now))) return true;
  }
  return false;
}

/**
 * 控えから戻す。`only` を渡すとその 1 件だけ（id で突き合わせる）
 */
export function restoreBackup(kind: BackupKind, only?: string): Promise<RestoreResult> {
  return kind === 'chats' ? restoreChats(only) : restoreLibrary(kind, only);
}
