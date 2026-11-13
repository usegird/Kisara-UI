import { parseChatMeta } from '@/chat/meta';
import { LOCALE_KEY } from '@/i18n';
import { approxBytes } from '@/lib/approx-bytes';
import { isRecord } from '@/lib/guards';
import type { UserFileKind } from '@/port/comfy-port';
import { withAppStore, type AppStoreName } from '@/store/persist/app-db';
import { TAB_LAYOUT_KEY } from '@/store/persist/session-format';
import { comfyPort } from '@/store/ports/comfy-port';
import { embeddingPort } from '@/store/ports/embedding-port';
import { connectedComfyUrl } from '@/store/use-connection-store';
import { PROFILES_KEY } from '@/store/use-llm-profiles-store';
import { useSemanticStore } from '@/store/use-semantic-store';
import { CLIENT_ID_KEY, SETTINGS_KEY } from '@/store/use-settings-store';
import { PAST_SESSIONS_KEY } from '@/store/use-tabs-store';
import { TERMS_KEY } from '@/store/use-terms-store';

// ─────────────────────────────
// ストレージの管理。ブラウザの保存領域を種類ごと・1 件ずつ数え、消す。読んだ結果は残さず、
// 1 件を消しても読み込み直さない（決めるのは呼び出し側）。
// ─────────────────────────────

/** 大きい保存領域の種類（会話は一覧の表と合わせて 1 つ） */
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

/** ブラウザの保存領域の種類 */
export type BrowserCategory =
  | { readonly area: 'indexedDb'; readonly table: IndexedDbTable }
  | { readonly area: 'local' }
  | { readonly area: 'session' }
  | { readonly area: 'cache' };

/** ComfyUI のユーザーフォルダの KisaraUI の物（控えを除く。つないでいるときだけ読む） */
interface UserFilesCategory {
  readonly area: 'userFiles';
  readonly kind: UserFileKind;
}

/** ストレージの管理の種類（ブラウザの保存領域と、ユーザーフォルダの物） */
export type StorageCategory = BrowserCategory | UserFilesCategory;

export type { UserFileKind };

export const USER_FILE_KINDS: readonly UserFileKind[] = ['history', 'notes', 'styles', 'tags'];

/** 小さい保存領域・タブごとの保存領域の、名前の分かる鍵 */
export type KnownKey =
  | 'settings'
  | 'terms'
  | 'profiles'
  | 'locale'
  | 'clientId'
  | 'tabLayout'
  | 'pastSessions'
  | 'tasks';

/**
 * 実行の記録を書いていた古い鍵。読み書きはしないが、残っている端末で何かが分かるように名前だけ付ける
 * （読み替え・移し替えはしない）
 */
const OLD_TASKS_KEY = 'kisaraui.tasks';

export const KNOWN_KEYS: Readonly<Record<string, KnownKey>> = {
  [OLD_TASKS_KEY]: 'tasks',
  [SETTINGS_KEY]: 'settings',
  [TERMS_KEY]: 'terms',
  [PROFILES_KEY]: 'profiles',
  [LOCALE_KEY]: 'locale',
  [CLIENT_ID_KEY]: 'clientId',
  [TAB_LAYOUT_KEY]: 'tabLayout',
  [PAST_SESSIONS_KEY]: 'pastSessions',
};

/** このアプリが小さい保存領域に書く鍵の頭 */
const KEY_PREFIX = 'kisaraui';

/** このアプリの鍵か（ファイルから戻すのもこの鍵だけ） */
export const isOwnKey = (key: string): boolean => key.startsWith(KEY_PREFIX);

/** 保存領域・控えの 1 件 */
export interface StorageItem {
  /** 表の鍵・保存領域の鍵・モデルの id・控えの id */
  readonly key: string;
  /** 名前（持たない物は空。表示は鍵で代える） */
  readonly name: string;
  /** 名前の分かる鍵（小さい保存領域・タブごとの保存領域） */
  readonly known: KnownKey | null;
  /** 最後に変えた時刻。持たない物は null */
  readonly updatedAt: number | null;
  /** 大きさの見積もり（バイト） */
  readonly bytes: number;
}

/** ブラウザの保存領域の 1 つの種類の中身 */
interface BrowserCategoryUsage {
  readonly category: BrowserCategory;
  /** 新しい順（時刻の無い物は鍵の順で後ろ） */
  readonly items: readonly StorageItem[];
}

/** ブラウザの保存領域の使い方の全体 */
export interface StorageUsage {
  readonly categories: readonly BrowserCategoryUsage[];
  /** このサイトの使用量と上限（ブラウザの見積もり）。読めなければ null */
  readonly usage: number | null;
  readonly quota: number | null;
  /** 消さないよう頼めているか。読めなければ null */
  readonly persisted: boolean | null;
}

/** 件数と大きさの合計 */
export function totalOf(items: readonly { readonly bytes: number }[]): number {
  return items.reduce((sum, item) => sum + item.bytes, 0);
}

/** 新しい順（時刻の無い物は鍵の順で後ろ）に並べる */
export function sortItems(items: StorageItem[]): StorageItem[] {
  return items.sort(
    (a, b) => (b.updatedAt ?? -Infinity) - (a.updatedAt ?? -Infinity) || a.key.localeCompare(b.key),
  );
}

const numberOr = (value: unknown): number | null => (typeof value === 'number' ? value : null);

/** 表の 1 件の名前と時刻。形を問わず、持っている項目だけを拾う */
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
    // このアプリの表の鍵はすべて文字（ノード定義の表は接続先の URL）
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
      // 文字は UTF-16 で持つので 1 文字 2 バイトで数える
      const bytes = (key.length + (storage.getItem(key)?.length ?? 0)) * 2;
      items.push({ key, name: '', known: KNOWN_KEYS[key] ?? null, updatedAt: null, bytes });
    }
    return items;
  } catch {
    // 触ると例外になる設定がある
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

/** 保存領域を種類ごと・1 件ずつ数える（開いたときと読み直すとき） */
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

/**
 * ユーザーフォルダの物の一覧（新しい順）。鍵はその種類のフォルダからの経路。つないでいなければ null。
 * 読めなければ投げる
 */
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

/** タブごとの保存領域はタブを閉じると消えるので、消さない */
export function isClearable(category: StorageCategory): boolean {
  return category.area !== 'session';
}

/**
 * 1 件を消す。大きい保存領域の 1 件は読み込み直さなくてよい（画面の中には残る）。
 * 小さい保存領域の鍵を消したら、呼び出し側が読み込み直す。ユーザーフォルダの物は**接続先のファイルを消す**
 * （つないでいなければ投げる）
 */
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
  // 鍵は読んだときに文字にしている。ノード定義の表の鍵（接続先の URL）も文字
  await withAppStore(indexedDB, category.table, 'readwrite', (s) => s.delete(key));
  if (category.table === 'chat') {
    await withAppStore(indexedDB, 'chat-meta', 'readwrite', (s) => s.delete(key));
  }
}

/** 鍵の値。JSON なら読んだ物、ほかは文字のまま */
function parsedValue(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/**
 * ブラウザの 1 件の保存の中身をそのまま読む（ストレージの管理の生データ）。無ければ null。
 * 会話は一覧の 1 件と本文の両方
 */
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
