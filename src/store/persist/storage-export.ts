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
  knownKeyOf,
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

const EXPORT_FORMAT = 'kisaraui-storage-export';

const EXPORT_VERSION = 1;

const STORAGE_LINE_MAX_MEGACHARS = 512;

const STORAGE_LINE_MAX_CHARS = STORAGE_LINE_MAX_MEGACHARS * MEGABYTE;

class UnreadableExportError extends Error {}

export function categoryKey(category: StorageCategory): string {
  if (category.area === 'userFiles') return `userFiles:${category.kind}`;
  return category.area === 'indexedDb' ? `table:${category.table}` : category.area;
}

const EXPORT_TABLES: ReadonlySet<IndexedDbTable> = new Set([
  'chat',
  'preset',
  'system-prompt',
  'dictionary',
  'playbook',
]);

export function canExport(category: StorageCategory): category is BrowserCategory {
  if (category.area === 'cache' || category.area === 'userFiles') return false;
  return category.area !== 'indexedDb' || EXPORT_TABLES.has(category.table);
}

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

export function buildStorageExport(
  category: BrowserCategory,
  keys: readonly string[],
): Promise<Blob> {
  return gzipLines(exportLines(category, keys), 'application/gzip');
}

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

export function describeRaw(category: BrowserCategory, key: string, raw: unknown): StorageItem {
  if (category.area !== 'indexedDb') {
    return {
      key,
      name: '',
      known: knownKeyOf(key),
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

const RAW_IDS: Partial<Record<IndexedDbTable, (raw: unknown) => string | null>> = {
  preset: (raw) => parsePreset(raw)?.id ?? null,
  'system-prompt': (raw) => parseTemplate(raw)?.id ?? null,
  dictionary: (raw) => parseDictionary(raw)?.id ?? null,
  playbook: (raw) => parseOwnPlaybook(raw)?.id ?? null,
  chat: (raw) =>
    isRecord(raw) && intactStoredChat(raw.chat) ? (parseChatMeta(raw.meta)?.id ?? null) : null,
};

function intactStoredChat(raw: unknown): boolean {
  return isRecord(raw) && parseIntactChat(raw.chat) !== null;
}

export async function restoreStorageRaw(
  category: BrowserCategory,
  key: string,
  raw: unknown,
): Promise<boolean | 'too-large'> {
  const kind = category.area === 'indexedDb' && category.table === 'chat' ? 'chat' : 'other';
  if (overRestoreLimit(kind, approxBytes(raw))) return 'too-large';
  if (category.area === 'local' || category.area === 'session') {
    if (!isOwnKey(key)) return false;
    const storage = category.area === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    storage.setItem(key, typeof raw === 'string' ? raw : JSON.stringify(raw));
    return true;
  }
  if (category.area !== 'indexedDb' || !isRecord(raw)) return false;
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
