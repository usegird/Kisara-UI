import { LATIN1_LAST } from '@/components/ui/units';
import { activeLocale, t, type MessageKey } from '@/i18n';
import { formatBytes } from '@/lib/text';
import { BACKUP_OF, type BackupKind } from '@/store/persist/storage-backups';
import { categoryKey } from '@/store/persist/storage-export';
import {
  totalOf,
  USER_FILE_KINDS,
  type IndexedDbTable,
  type KnownKey,
  type StorageCategory,
  type StorageItem,
  type StorageUsage,
  type UserFileKind,
} from '@/store/persist/storage-usage';

const WIDE_CHAR_EM = 0.95;

const NARROW_CHAR_EM = 0.55;

export const OVERVIEW = 'overview';

export const COMFY_BACKUP = 'comfyBackup';

export const INDEXED_DB = 'indexedDb';

export const INDEXED_DB_IDS: readonly string[] = [
  'table:chat',
  'table:preset',
  'table:system-prompt',
  'table:dictionary',
  'table:playbook',
  'table:avatar',
  'table:object-info',
  'table:session',
];

export const TOP_IDS: readonly string[] = ['local', 'session'];

export const GROUPS: readonly {
  readonly id: string;
  readonly label: MessageKey;
  readonly ids: readonly string[];
}[] = [
  {
    id: 'group:llm',
    label: 'llm.storage.group.llm',
    ids: [
      'table:chat',
      'table:preset',
      'table:system-prompt',
      'table:dictionary',
      'table:playbook',
      'table:avatar',
      'cache',
    ],
  },
  {
    id: 'group:comfy',
    label: 'llm.storage.group.comfy',
    ids: [
      'table:object-info',
      'table:session',
      ...USER_FILE_KINDS.map((kind) => categoryKey({ area: 'userFiles', kind })),
    ],
  },
];

type Texts = readonly [MessageKey, MessageKey];

const TABLE_TEXT: Readonly<Record<IndexedDbTable, Texts>> = {
  'object-info': ['llm.storage.table.objectInfo', 'llm.storage.table.objectInfoHint'],
  session: ['llm.storage.table.session', 'llm.storage.table.sessionHint'],
  chat: ['llm.storage.table.chat', 'llm.storage.table.chatHint'],
  preset: ['llm.storage.table.preset', 'llm.storage.table.presetHint'],
  'system-prompt': ['llm.storage.table.systemPrompt', 'llm.storage.table.systemPromptHint'],
  dictionary: ['llm.storage.table.dictionary', 'llm.storage.table.dictionaryHint'],
  avatar: ['llm.storage.table.avatar', 'llm.storage.table.avatarHint'],
  playbook: ['llm.storage.table.playbook', 'llm.storage.table.playbookHint'],
};

const USER_FILE_TEXT: Readonly<Record<UserFileKind, Texts>> = {
  history: ['llm.storage.userFiles.history', 'llm.storage.userFiles.historyHint'],
  notes: ['llm.storage.userFiles.notes', 'llm.storage.userFiles.notesHint'],
  styles: ['llm.storage.userFiles.styles', 'llm.storage.userFiles.stylesHint'],
  tags: ['llm.storage.userFiles.tags', 'llm.storage.userFiles.tagsHint'],
};

export const KEY_TEXT: Readonly<Record<KnownKey, Texts>> = {
  settings: ['llm.storage.key.settings', 'llm.storage.key.settingsHint'],
  terms: ['llm.storage.key.terms', 'llm.storage.key.termsHint'],
  profiles: ['llm.storage.key.profiles', 'llm.storage.key.profilesHint'],
  locale: ['llm.storage.key.locale', 'llm.storage.key.localeHint'],
  clientId: ['llm.storage.key.clientId', 'llm.storage.key.clientIdHint'],
  tabLayout: ['llm.storage.key.tabLayout', 'llm.storage.key.tabLayoutHint'],
  pastSessions: ['llm.storage.key.pastSessions', 'llm.storage.key.pastSessionsHint'],
  tasks: ['llm.storage.key.tasks', 'llm.storage.key.tasksHint'],
};

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

export type RemoteState = 'notConnected' | 'loading' | 'failed';

export const REMOTE_TEXT: Readonly<Record<RemoteState, MessageKey>> = {
  notConnected: 'llm.storage.userFiles.notConnected',
  loading: 'llm.storage.loading',
  failed: 'llm.storage.userFiles.failed',
};

type BackupList = readonly StorageItem[] | 'failed' | null;

export interface OpenedFile {
  readonly name: string;
  readonly blob: Blob;
  readonly items: readonly StorageItem[];
}

export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly category: StorageCategory;
  readonly items: readonly StorageItem[];
  readonly remote: RemoteState | null;
  readonly backup: BackupKind | null;
  readonly backups: BackupList;
  readonly file: OpenedFile | null;
}

export interface Row {
  readonly key: string;
  readonly browser: StorageItem | null;
  readonly backup: StorageItem | null;
}

export type BackupLists = Partial<Record<BackupKind, readonly StorageItem[] | 'failed'>>;

export type UserFileLists = Partial<Record<UserFileKind, readonly StorageItem[] | 'failed'>>;

export interface EntrySources {
  readonly usage: StorageUsage | null;
  readonly connected: boolean;
  readonly backups: BackupLists | null;
  readonly userFiles: UserFileLists | null;
  readonly files: ReadonlyMap<string, OpenedFile>;
}

export function buildEntries(sources: EntrySources): Entry[] {
  const { usage, connected, backups, userFiles, files } = sources;
  const browserEntries: Entry[] = (usage?.categories ?? []).map(({ category, items }) => {
    const [label, hint] = categoryTexts(category);
    const backup = backupOf(category);
    const id = categoryKey(category);
    return {
      id,
      label: t(label),
      hint: t(hint),
      category,
      items,
      remote: null,
      backup,
      backups: backup === null || !connected ? null : (backups?.[backup] ?? null),
      file: files.get(id) ?? null,
    };
  });
  const userFileEntries: Entry[] =
    usage === null
      ? []
      : USER_FILE_KINDS.map((kind) => {
          const category = { area: 'userFiles', kind } as const;
          const [label, hint] = categoryTexts(category);
          const list = connected ? userFiles?.[kind] : undefined;
          return {
            id: categoryKey(category),
            label: t(label),
            hint: t(hint),
            category,
            items: Array.isArray(list) ? list : [],
            remote: remoteStateOf(connected, list),
            backup: null,
            backups: null,
            file: null,
          };
        });
  return [...browserEntries, ...userFileEntries];
}

export function isBrowserEntry(entry: Entry): boolean {
  return entry.category.area !== 'userFiles';
}

export function backupsOf(entry: Entry): readonly StorageItem[] | null {
  return entry.backups === null || entry.backups === 'failed' ? null : entry.backups;
}

export function allBackupsOf(entries: readonly Entry[]): readonly StorageItem[] | null {
  const backed = entries.filter((entry) => entry.backup !== null);
  if (backed.some((entry) => entry.backups === null)) return null;
  return backed.flatMap((entry) => backupsOf(entry) ?? []);
}

export function hasReference(entry: Entry): boolean {
  return entry.backup !== null || entry.file !== null;
}

export function rowsOf(entry: Entry): { readonly both: Row[]; readonly backupOnly: Row[] } {
  const backups = referenceOf(entry) ?? [];
  const byKey = new Map(backups.map((item) => [item.key, item]));
  const keys = new Set(entry.items.map((item) => item.key));
  return {
    both: entry.items.map((item) => ({
      key: item.key,
      browser: item,
      backup: byKey.get(item.key) ?? null,
    })),
    backupOnly: backups
      .filter((item) => !keys.has(item.key))
      .map((item) => ({ key: item.key, browser: null, backup: item })),
  };
}

export function membersOf(ids: readonly string[], entries: readonly Entry[]): Entry[] {
  return ids.flatMap((id) => entries.filter((entry) => entry.id === id));
}

export function shownEntriesOf(
  scope: string,
  entries: readonly Entry[],
  tables: readonly Entry[],
  groups: readonly (typeof GROUPS)[number][],
): readonly Entry[] {
  if (scope === OVERVIEW) return entries;
  if (scope === INDEXED_DB) return tables;
  return groups.flatMap((group) => membersOf(group.ids, entries));
}

export function figures(items: readonly StorageItem[]): string {
  const size = t('llm.storage.size', { size: formatBytes(totalOf(items)) });
  return `${t('llm.storage.count', { count: items.length })} · ${size}`;
}

export function formatBackupFigures(items: readonly StorageItem[] | null): string {
  return items === null ? '—' : figures(items);
}

export function backupInfoOf(entry: Entry, connected: boolean): string | null {
  if (entry.file !== null)
    return t('llm.storage.summaryFile', { figures: figures(entry.file.items) });
  if (!hasReference(entry)) return null;
  if (!connected) return t('llm.storage.backup.notConnected');
  if (entry.backups === 'failed') return t('llm.storage.backup.failed');
  const backups = backupsOf(entry);
  if (backups === null) return t('llm.storage.loading');
  return t('llm.storage.summaryBackup', { figures: figures(backups) });
}

export function itemName(item: StorageItem): string {
  if (item.name.length > 0) return item.name;
  return item.known === null ? item.key : t(KEY_TEXT[item.known][0]);
}

export function rowTextOf(row: Row): { readonly name: string; readonly size: string } {
  const shown = row.browser ?? row.backup;
  return {
    name: shown === null ? row.key : itemName(shown),
    size: row.browser === null ? '' : formatBytes(row.browser.bytes),
  };
}

export function formatSavedTime(at: number | null): string {
  return at === null ? '' : new Date(at).toLocaleString(activeLocale(), TIME_FORMAT);
}

export function pathOf(
  selected: string,
  entries: readonly Entry[],
): { id: string; label: string }[] {
  const root = { id: OVERVIEW, label: t('llm.storage.overview') };
  if (selected === INDEXED_DB) return [root, { id: INDEXED_DB, label: t('llm.storage.indexedDb') }];
  if (selected === COMFY_BACKUP) {
    return [root, { id: COMFY_BACKUP, label: t('llm.storage.comfyBackup') }];
  }
  const group = GROUPS.find((item) => item.id === selected || item.ids.includes(selected));
  const entry = entries.find((item) => item.id === selected);
  return [
    root,
    ...(group === undefined ? [] : [{ id: group.id, label: t(group.label) }]),
    ...(entry === undefined ? [] : [{ id: entry.id, label: entry.label }]),
  ];
}

export function exportFileName(entry: Entry): string {
  const at = new Date();
  const two = (value: number): string => String(value).padStart(2, '0');
  const date = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}`;
  return `kisaraui-${entry.id.replace(/[^a-z0-9-]/gi, '-')}-${date}-${two(at.getHours())}${two(at.getMinutes())}.jsonl.gz`;
}

export function approxEm(text: string): number {
  let em = 0;
  for (const char of text) em += char.charCodeAt(0) > LATIN1_LAST ? WIDE_CHAR_EM : NARROW_CHAR_EM;
  return em;
}

function categoryTexts(category: StorageCategory): Texts {
  if (category.area === 'indexedDb') return TABLE_TEXT[category.table];
  if (category.area === 'userFiles') return USER_FILE_TEXT[category.kind];
  if (category.area === 'local') return ['llm.storage.area.local', 'llm.storage.area.localHint'];
  if (category.area === 'session') {
    return ['llm.storage.area.session', 'llm.storage.area.sessionHint'];
  }
  return ['llm.storage.cache.semanticModels', 'llm.storage.cache.semanticModelsHint'];
}

function backupOf(category: StorageCategory): BackupKind | null {
  return category.area === 'indexedDb' ? (BACKUP_OF[category.table] ?? null) : null;
}

function referenceOf(entry: Entry): readonly StorageItem[] | null {
  return entry.file === null ? backupsOf(entry) : entry.file.items;
}

function remoteStateOf(connected: boolean, list: unknown): RemoteState | null {
  if (!connected) return 'notConnected';
  if (list === undefined) return 'loading';
  return list === 'failed' ? 'failed' : null;
}
