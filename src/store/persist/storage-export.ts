import { parseDictionary } from '@/chat/dictionary';
import { parseIntactChat } from '@/chat/file';
import { parseChatMeta } from '@/chat/meta';
import { approxBytes } from '@/lib/approx-bytes';
import { exportJson, reviveExport } from '@/lib/export-json';
import { MEGABYTE } from '@/lib/file-size';
import { isRecord } from '@/lib/guards';
import { gzipLines, readLines } from '@/lib/json-lines';
import { withAppStore, type AppStoreName } from '@/store/persist/app-db';
import { overRestoreLimit } from '@/store/persist/restore-limit';
import {
  describe,
  isOwnKey,
  KNOWN_KEYS,
  readStorageRaw,
  sortItems,
  type BrowserCategory,
  type IndexedDbTable,
  type StorageCategory,
  type StorageItem,
} from '@/store/persist/storage-usage';
import { parseOwnPlaybook } from '@/store/use-playbooks-store';
import { parsePreset } from '@/store/use-presets-store';
import { parseTemplate } from '@/store/use-system-prompts-store';

// ─────────────────────────────
// ストレージのエクスポートと、書き出したファイルを開く。ファイルの中身はダイアログが持ち、戻すときは
// 今ある 1 件を書き換えるだけ（置き場・鍵・単位は増やさない）。
// ─────────────────────────────

const EXPORT_FORMAT = 'kisaraui-storage-export';

const EXPORT_VERSION = 1;

/**
 * 開く書き出しのファイルの 1 行（1 件）の長さの上限。行ごとに解析するので、ファイル全体の上限は置かない。
 * 1 行はブラウザが作れる文字列の長さ（約 512 MB）を超えては読めない
 */
const STORAGE_LINE_MAX_MEGACHARS = 512;

const STORAGE_LINE_MAX_CHARS = STORAGE_LINE_MAX_MEGACHARS * MEGABYTE;

/** 書き出したファイルが読めない（見出しが違う・行が読めない・長すぎる） */
class UnreadableExportError extends Error {}

/** 種類の呼び名（左の列の種類と同じ）。書き出したファイルがどの種類かを示す */
export function categoryKey(category: StorageCategory): string {
  if (category.area === 'userFiles') return `userFiles:${category.kind}`;
  return category.area === 'indexedDb' ? `table:${category.table}` : category.area;
}

/** 書き出せる表。アバター（画像）・ノード定義（接続先から取り直せる）・編集ワークフローは書き出さない */
const EXPORT_TABLES: ReadonlySet<IndexedDbTable> = new Set([
  'chat',
  'preset',
  'system-prompt',
  'dictionary',
  'playbook',
]);

/**
 * 書き出せる種類。表は上の 5 つと、localStorage・sessionStorage（埋め込みモデル・ユーザーフォルダの物は
 * 書き出さない）
 */
export function canExport(category: StorageCategory): category is BrowserCategory {
  if (category.area === 'cache' || category.area === 'userFiles') return false;
  return category.area !== 'indexedDb' || EXPORT_TABLES.has(category.table);
}

/** 書き出しの行。1 行目に見出し、続けて 1 件 1 行。読めなかった 1 件は中身を null にする */
async function* exportLines(
  category: BrowserCategory,
  keys: readonly string[],
): AsyncGenerator<string> {
  yield JSON.stringify({
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    category: categoryKey(category),
  });
  for (const key of keys) {
    const value = await readStorageRaw(category, key).catch(() => null);
    yield await exportJson({ key, value });
  }
}

/**
 * 種類のブラウザの 1 件ずつを、書き出すファイル（1 行 1 件の JSON を gzip で縮めた物）にする。
 * 1 件ずつ読んで縮めながら書き、全体を 1 つの文字列にしない
 */
export function buildStorageExport(
  category: BrowserCategory,
  keys: readonly string[],
): Promise<Blob> {
  return gzipLines(exportLines(category, keys), 'application/gzip');
}

/**
 * 書き出したファイルを流れのまま読み、1 件ずつ鍵と中身（印のまま）を返す。その種類の書き出しでない・
 * 読めない行がある・長すぎる行があれば `UnreadableExportError` を投げる。localStorage・sessionStorage は、
 * このアプリの鍵だけを返す
 */
async function* exportEntries(
  file: Blob,
  category: BrowserCategory,
): AsyncGenerator<readonly [string, unknown]> {
  const keyed = category.area === 'local' || category.area === 'session';
  let header = true;
  try {
    for await (const line of readLines(file, STORAGE_LINE_MAX_CHARS)) {
      const parsed: unknown = JSON.parse(line);
      if (header) {
        header = false;
        if (!isRecord(parsed) || parsed.format !== EXPORT_FORMAT) throw new UnreadableExportError();
        if (parsed.version !== EXPORT_VERSION || parsed.category !== categoryKey(category)) {
          throw new UnreadableExportError();
        }
        continue;
      }
      if (!isRecord(parsed) || typeof parsed.key !== 'string') throw new UnreadableExportError();
      if (keyed && !isOwnKey(parsed.key)) continue;
      yield [parsed.key, parsed.value] as const;
    }
  } catch (error) {
    if (error instanceof UnreadableExportError) throw error;
    throw new UnreadableExportError();
  }
  if (header) throw new UnreadableExportError();
}

/**
 * 書き出したファイルを開き、一覧に出す 1 件ずつ（名前・時刻・大きさ）を返す。中身は持たない。
 * その種類の書き出しでない・読めなければ null
 */
export async function scanStorageExport(
  file: Blob,
  category: BrowserCategory,
): Promise<StorageItem[] | null> {
  const items = new Map<string, StorageItem>();
  try {
    for await (const [key, value] of exportEntries(file, category)) {
      items.set(key, describeRaw(category, key, value));
    }
  } catch {
    return null;
  }
  return sortItems([...items.values()]);
}

/**
 * 書き出したファイルをもう一度流れで読み、`keys` の 1 件ずつの中身を返す（Blob などは元の形へ戻す）。
 * 読めなければ投げる
 */
export async function readStorageExport(
  file: Blob,
  category: BrowserCategory,
  keys: ReadonlySet<string>,
): Promise<ReadonlyMap<string, unknown>> {
  const found = new Map<string, unknown>();
  for await (const [key, value] of exportEntries(file, category)) {
    if (keys.has(key)) found.set(key, reviveExport(value));
  }
  return found;
}

/** ファイルの 1 件を一覧の 1 件にする（名前・時刻・大きさ。読み方は保存領域を読むときと同じ） */
export function describeRaw(category: BrowserCategory, key: string, raw: unknown): StorageItem {
  if (category.area !== 'indexedDb') {
    return {
      key,
      name: '',
      known: KNOWN_KEYS[key] ?? null,
      updatedAt: null,
      bytes: approxBytes(raw),
    };
  }
  if (category.table === 'chat' && isRecord(raw)) {
    const meta = parseChatMeta(raw.meta);
    if (meta !== null) {
      const bytes = approxBytes(raw);
      return { key, name: meta.name || meta.head, known: null, updatedAt: meta.updatedAt, bytes };
    }
  }
  return { key, known: null, ...describe(raw), bytes: approxBytes(raw) };
}

/**
 * ファイルから戻せる表と、1 件の中の id の読み方。読み込みと同じ確かめを通らなければ null
 * （戻さない）。会話は一覧の項目の id で、本文も確かめる
 */
const RAW_IDS: Partial<Record<IndexedDbTable, (raw: unknown) => string | null>> = {
  preset: (raw) => parsePreset(raw)?.id ?? null,
  'system-prompt': (raw) => parseTemplate(raw)?.id ?? null,
  dictionary: (raw) => parseDictionary(raw)?.id ?? null,
  playbook: (raw) => parseOwnPlaybook(raw)?.id ?? null,
  chat: (raw) =>
    isRecord(raw) && intactStoredChat(raw.chat) ? (parseChatMeta(raw.meta)?.id ?? null) : null,
};

/**
 * 会話の表の 1 件（`{ chat, savedAt }`）の本文が、開くときと同じ確かめ方で読めるか
 */
function intactStoredChat(raw: unknown): boolean {
  return isRecord(raw) && parseIntactChat(raw.chat) !== null;
}

/**
 * ファイルの 1 件でブラウザの 1 件を書き換える（新しい方を残す突き合わせはしない）。読めない形・
 * このアプリの鍵でない・鍵と中の id が違うなら false、大きすぎれば 'too-large'。小さい保存領域を
 * 書き換えたら、呼び出し側が読み込み直す
 */
export async function restoreStorageRaw(
  category: BrowserCategory,
  key: string,
  raw: unknown,
): Promise<boolean | 'too-large'> {
  // 大きすぎる 1 件は戻さない（取り込むときと同じ上限）
  const kind = category.area === 'indexedDb' && category.table === 'chat' ? 'chat' : 'other';
  if (overRestoreLimit(kind, approxBytes(raw))) return 'too-large';
  if (category.area === 'local' || category.area === 'session') {
    if (!isOwnKey(key)) return false;
    const storage = category.area === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    storage.setItem(key, typeof raw === 'string' ? raw : JSON.stringify(raw));
    return true;
  }
  if (category.area !== 'indexedDb' || !isRecord(raw)) return false;
  // 書き出せる表だけを、中の id が鍵と同じときだけ戻す（違えば鍵と中身のずれた 1 件ができる）
  if (RAW_IDS[category.table]?.(raw) !== key) return false;
  const put = (name: AppStoreName, value: unknown): Promise<IDBValidKey> =>
    withAppStore(indexedDB, name, 'readwrite', (s) => s.put(value, key));
  if (category.table === 'chat') {
    await put('chat-meta', raw.meta);
    await put('chat', raw.chat);
    return true;
  }
  await put(category.table, raw);
  return true;
}
