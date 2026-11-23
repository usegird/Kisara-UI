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

const MS_PER_DAY = 86_400_000;

const STALE_BACKUP_DAYS = 30;

export type BackupKind = 'chats' | LibraryKind;

export const BACKUP_KINDS: readonly BackupKind[] = [
  'chats',
  'presets',
  'system-prompts',
  'dictionaries',
  'playbooks',
  'avatars',
];

export const BACKUP_OF: Readonly<Partial<Record<IndexedDbTable, BackupKind>>> = {
  chat: 'chats',
  preset: 'presets',
  'system-prompt': 'system-prompts',
  dictionary: 'dictionaries',
  playbook: 'playbooks',
  avatar: 'avatars',
};

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

export async function deleteBackup(kind: BackupKind, key: string): Promise<void> {
  const baseUrl = connectedComfyUrl();
  if (baseUrl === null) throw new Error('ComfyUI is not connected');
  if (kind === 'chats') await removeChatFrom(key, { kind: 'comfy', baseUrl });
  else await comfyPort().library.remove(baseUrl, kind, key);
}

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

export async function readBackupRaw(kind: BackupKind, key: string): Promise<unknown> {
  const baseUrl = connectedComfyUrl();
  if (baseUrl === null) throw new Error('ComfyUI is not connected');
  if (kind === 'chats') return loadRawChat(key, { kind: 'comfy', baseUrl });
  const all = await comfyPort().library.list(baseUrl, kind);
  return all.find((raw) => isRecord(raw) && raw.id === key) ?? null;
}

export const STALE_BACKUP_MS = STALE_BACKUP_DAYS * MS_PER_DAY;

export function orphanBackups(
  backups: readonly StorageItem[],
  browser: readonly StorageItem[],
): StorageItem[] {
  const keys = new Set(browser.map((item) => item.key));
  return backups.filter((item) => !keys.has(item.key));
}

export function isStaleBackup(item: StorageItem, now: number): boolean {
  return item.updatedAt !== null && now - item.updatedAt >= STALE_BACKUP_MS;
}

async function tableKeys(table: IndexedDbTable): Promise<StorageItem[]> {
  if (typeof globalThis.indexedDB === 'undefined') return [];
  const store = table === 'chat' ? 'chat-meta' : table;
  const keys = await withAppStore(indexedDB, store, 'readonly', (s) => s.getAllKeys());
  return keys.flatMap((key) =>
    typeof key === 'string' ? [{ key, name: '', known: null, updatedAt: null, bytes: 0 }] : [],
  );
}

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

export function restoreBackup(kind: BackupKind, only?: string): Promise<RestoreResult> {
  return kind === 'chats' ? restoreChats(only) : restoreLibrary(kind, only);
}
