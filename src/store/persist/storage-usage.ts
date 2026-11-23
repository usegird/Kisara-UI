import { parseChatMeta } from '@/chat/meta';
import { LOCALE_KEY } from '@/i18n';
import { approxBytes } from '@/lib/approx-bytes';
import { isRecord } from '@/lib/guards';
import type { UserFileKind } from '@/port/comfy-port';
import { isAgreementKey } from '@/store/persist/agreements';
import { withAppStore, type AppStoreName } from '@/store/persist/app-db';
import { TAB_LAYOUT_KEY } from '@/store/persist/session-format';
import { comfyPort } from '@/store/ports/comfy-port';
import { embeddingPort } from '@/store/ports/embedding-port';
import { connectedComfyUrl } from '@/store/use-connection-store';
import { PROFILES_KEY } from '@/store/use-llm-profiles-store';
import { useSemanticStore } from '@/store/use-semantic-store';
import { CLIENT_ID_KEY, SETTINGS_KEY } from '@/store/use-settings-store';
import { PAST_SESSIONS_KEY } from '@/store/use-tabs-store';

export type IndexedDbTable = Exclude<AppStoreName, 'chat-meta'>;

export const INDEXED_DB_TABLES: readonly IndexedDbTable[] = [
  'object-info',
  'session',
  'chat',
  'preset',
  'system-prompt',
  'dictionary',
  'avatar',
  'playbook',
];

export type BrowserCategory =
  | { readonly area: 'indexedDb'; readonly table: IndexedDbTable }
  | { readonly area: 'local' }
  | { readonly area: 'session' }
  | { readonly area: 'cache' };

interface UserFilesCategory {
  readonly area: 'userFiles';
  readonly kind: UserFileKind;
}

export type StorageCategory = BrowserCategory | UserFilesCategory;

export type { UserFileKind };

export const USER_FILE_KINDS: readonly UserFileKind[] = ['history', 'notes', 'styles', 'tags'];

export type KnownKey =
  | 'settings'
  | 'terms'
  | 'profiles'
  | 'locale'
  | 'clientId'
  | 'tabLayout'
  | 'pastSessions'
  | 'tasks';

const OLD_TASKS_KEY = 'kisaraui.tasks';

const KNOWN_KEYS: Readonly<Record<string, KnownKey>> = {
  [OLD_TASKS_KEY]: 'tasks',
  [SETTINGS_KEY]: 'settings',
  [PROFILES_KEY]: 'profiles',
  [LOCALE_KEY]: 'locale',
  [CLIENT_ID_KEY]: 'clientId',
  [TAB_LAYOUT_KEY]: 'tabLayout',
  [PAST_SESSIONS_KEY]: 'pastSessions',
};

export function knownKeyOf(key: string): KnownKey | null {
  if (isAgreementKey(key)) return 'terms';
  return KNOWN_KEYS[key] ?? null;
}

const KEY_PREFIX = 'kisaraui';

export const isOwnKey = (key: string): boolean => key.startsWith(KEY_PREFIX);

export interface StorageItem {
  readonly key: string;
  readonly name: string;
  readonly known: KnownKey | null;
  readonly updatedAt: number | null;
  readonly bytes: number;
}

interface BrowserCategoryUsage {
  readonly category: BrowserCategory;
  readonly items: readonly StorageItem[];
}

export interface StorageUsage {
  readonly categories: readonly BrowserCategoryUsage[];
  readonly usage: number | null;
  readonly quota: number | null;
  readonly persisted: boolean | null;
}

export function totalOf(items: readonly { readonly bytes: number }[]): number {
  return items.reduce((sum, item) => sum + item.bytes, 0);
}

export function sortItems(items: StorageItem[]): StorageItem[] {
  return items.sort(
    (a, b) => (b.updatedAt ?? -Infinity) - (a.updatedAt ?? -Infinity) || a.key.localeCompare(b.key),
  );
}

const numberOr = (value: unknown): number | null => (typeof value === 'number' ? value : null);

export function describe(value: unknown): Pick<StorageItem, 'name' | 'updatedAt'> {
  if (!isRecord(value)) return { name: '', updatedAt: null };
  const own = isRecord(value.playbook) ? value.playbook.name : undefined;
  const name = [value.name, own, value.baseUrl].find((item) => typeof item === 'string');
  return {
    name: typeof name === 'string' ? name : '',
    updatedAt: numberOr(value.updatedAt) ?? numberOr(value.savedAt) ?? numberOr(value.createdAt),
  };
}

async function tableItems(table: IndexedDbTable): Promise<StorageItem[]> {
  if (typeof globalThis.indexedDB === 'undefined') return [];
  try {
    if (table === 'chat') {
      const metas = await withAppStore(indexedDB, 'chat-meta', 'readonly', (s) => s.getAll());
      return metas.flatMap((raw: unknown) => {
        const meta = parseChatMeta(raw);
        if (meta === null) return [];
        const name = meta.name || meta.head;
        const bytes = meta.size + approxBytes(raw);
        return [{ key: meta.id, name, known: null, updatedAt: meta.updatedAt, bytes }];
      });
    }
    const [keys, values] = await Promise.all([
      withAppStore(indexedDB, table, 'readonly', (s) => s.getAllKeys()),
      withAppStore(indexedDB, table, 'readonly', (s) => s.getAll()),
    ]);
    return keys.flatMap((key, index) =>
      typeof key === 'string'
        ? [{ key, known: null, ...describe(values[index]), bytes: approxBytes(values[index]) }]
        : [],
    );
  } catch {
    return [];
  }
}

function keyItems(area: 'local' | 'session'): StorageItem[] {
  try {
    const storage = area === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    const items: StorageItem[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key === null || !isOwnKey(key)) continue;
      const bytes = (key.length + (storage.getItem(key)?.length ?? 0)) * 2;
      items.push({ key, name: '', known: knownKeyOf(key), updatedAt: null, bytes });
    }
    return items;
  } catch {
    return [];
  }
}

async function modelItems(): Promise<StorageItem[]> {
  const models = await embeddingPort()
    .stored()
    .catch(() => []);
  return models.map((model) => ({
    key: model.id,
    name: model.id,
    known: null,
    updatedAt: null,
    bytes: model.bytes,
  }));
}

async function estimate(): Promise<Pick<StorageUsage, 'usage' | 'quota' | 'persisted'>> {
  const storage = globalThis.navigator?.storage as StorageManager | undefined;
  if (storage === undefined) return { usage: null, quota: null, persisted: null };
  const [found, persisted] = await Promise.all([
    storage.estimate?.().catch(() => null) ?? null,
    storage.persisted?.().catch(() => null) ?? null,
  ]);
  return { usage: found?.usage ?? null, quota: found?.quota ?? null, persisted };
}

export async function readStorageUsage(): Promise<StorageUsage> {
  const [tables, models, totals] = await Promise.all([
    Promise.all(INDEXED_DB_TABLES.map(tableItems)),
    modelItems(),
    estimate(),
  ]);
  const categories: BrowserCategoryUsage[] = [
    ...INDEXED_DB_TABLES.map((table, index) => ({
      category: { area: 'indexedDb', table } as const,
      items: sortItems(tables[index] ?? []),
    })),
    { category: { area: 'local' }, items: sortItems(keyItems('local')) },
    { category: { area: 'session' }, items: sortItems(keyItems('session')) },
    { category: { area: 'cache' }, items: sortItems(models) },
  ];
  return { categories, ...totals };
}

export async function listUserFileItems(kind: UserFileKind): Promise<StorageItem[] | null> {
  const baseUrl = connectedComfyUrl();
  if (baseUrl === null) return null;
  const files = await comfyPort().userFiles.list(baseUrl, kind);
  return sortItems(
    files.map((file) => ({
      key: file.path,
      name: file.path,
      known: null,
      updatedAt: file.modified,
      bytes: file.bytes,
    })),
  );
}

export function isClearable(category: StorageCategory): boolean {
  return category.area !== 'session';
}

export async function deleteStorageItem(category: StorageCategory, key: string): Promise<void> {
  if (category.area === 'userFiles') {
    const baseUrl = connectedComfyUrl();
    if (baseUrl === null) throw new Error('ComfyUI is not connected');
    await comfyPort().userFiles.remove(baseUrl, category.kind, key);
    return;
  }
  if (category.area === 'cache') {
    await useSemanticStore.getState().remove(key);
    return;
  }
  if (category.area === 'local') {
    globalThis.localStorage.removeItem(key);
    return;
  }
  if (category.area !== 'indexedDb') return;
  await withAppStore(indexedDB, category.table, 'readwrite', (s) => s.delete(key));
  if (category.table === 'chat') {
    await withAppStore(indexedDB, 'chat-meta', 'readwrite', (s) => s.delete(key));
  }
}

function parsedValue(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export async function readStorageRaw(category: StorageCategory, key: string): Promise<unknown> {
  if (category.area === 'userFiles') {
    const baseUrl = connectedComfyUrl();
    if (baseUrl === null) throw new Error('ComfyUI is not connected');
    return parsedValue(await comfyPort().userFiles.read(baseUrl, category.kind, key));
  }
  if (category.area === 'local' || category.area === 'session') {
    const storage = category.area === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    return parsedValue(storage.getItem(key));
  }
  if (category.area === 'cache') {
    const models = await embeddingPort().stored();
    return models.find((model) => model.id === key) ?? null;
  }
  const get = (name: AppStoreName): Promise<unknown> =>
    withAppStore(indexedDB, name, 'readonly', (s) => s.get(key));
  if (category.table !== 'chat') return (await get(category.table)) ?? null;
  const [meta, chat] = await Promise.all([get('chat-meta'), get('chat')]);
  return { meta: meta ?? null, chat: chat ?? null };
}
