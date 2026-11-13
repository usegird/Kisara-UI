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

// ─────────────────────────────
// ストレージの管理の表の組み立てと印の付け方。読んだ結果から左の列の種類と右の列の行を作り、
// 削除・戻すの印を数える（描かない）。
// ─────────────────────────────

/** 幅の見積もりで、全角の文字 1 つを数える em */
const WIDE_CHAR_EM = 0.95;

/** 幅の見積もりで、半角の文字 1 つを数える em */
const NARROW_CHAR_EM = 0.55;

/** 全体の場所の id */
export const OVERVIEW = 'overview';

/** sessionStorage の下の Comfy バックアップ（接続先のバックアップを種類ごとにまとめて見る場所） */
export const COMFY_BACKUP = 'comfyBackup';

/** 全体のすぐ下の IndexedDB（大きい保存領域の表をまとめて見る場所。表は目的ごとの見出しの下にも並ぶ） */
export const INDEXED_DB = 'indexedDb';

/** IndexedDB で並べる表（目的ごとの見出しと同じ順） */
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

/** 全体のすぐ下に置く種類（見出しを持たない） */
export const TOP_IDS: readonly string[] = ['local', 'session'];

/** 目的ごとの見出しと種類の並び。同じ見出しの中ではバックアップのある種類を上に置く */
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
    // ブラウザの物の後に、ユーザーフォルダの物（実行の記録・モデルのメモ・スタイル）
    ids: [
      'table:object-info',
      'table:session',
      ...USER_FILE_KINDS.map((kind) => categoryKey({ area: 'userFiles', kind })),
    ],
  },
];

/** 行の名前と書く内容 */
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

/** 分かる鍵の名前と説明 */
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

/**
 * 時刻。桁を揃えた書き方にし（月日時分秒を 2 桁）、どの行も同じ幅にして右に寄せる（左端も揃う）
 */
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

/** ユーザーフォルダの物の読み具合（つないでいない・読んでいる・読めなかった） */
export type RemoteState = 'notConnected' | 'loading' | 'failed';

/** 読み具合の文 */
export const REMOTE_TEXT: Readonly<Record<RemoteState, MessageKey>> = {
  notConnected: 'llm.storage.userFiles.notConnected',
  loading: 'llm.storage.loading',
  failed: 'llm.storage.userFiles.failed',
};

/** 控えの一覧。null は読んでいる・つないでいない、'failed' は読めなかった */
type BackupList = readonly StorageItem[] | 'failed' | null;

/**
 * 開いたエクスポートのファイル。ダイアログの中だけで指す。中身は持たず、
 * 生データを見るとき・戻すときにファイルをもう一度読む
 */
export interface OpenedFile {
  readonly name: string;
  readonly blob: Blob;
  readonly items: readonly StorageItem[];
}

/** 左の列の種類 */
export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly category: StorageCategory;
  readonly items: readonly StorageItem[];
  /**
   * ユーザーフォルダの物の読み具合（つないでいない・読んでいる・読めなかった。読めたら null）。
   * ブラウザの物はいつも null
   */
  readonly remote: RemoteState | null;
  /** 控えを書く種類。書かない種類は null */
  readonly backup: BackupKind | null;
  readonly backups: BackupList;
  /** 開いたファイル。開いている間はバックアップの列をこれに替える */
  readonly file: OpenedFile | null;
}

/** 右の列の 1 行。ブラウザと控えを id で突き合わせる */
export interface Row {
  readonly key: string;
  readonly browser: StorageItem | null;
  readonly backup: StorageItem | null;
}

/** 種類ごとの控えの一覧 */
export type BackupLists = Partial<Record<BackupKind, readonly StorageItem[] | 'failed'>>;

/** 種類ごとのユーザーフォルダの物の一覧 */
export type UserFileLists = Partial<Record<UserFileKind, readonly StorageItem[] | 'failed'>>;

/** 左の列の種類を組み立てる元（読んだ結果と、開いたファイル） */
export interface EntrySources {
  readonly usage: StorageUsage | null;
  readonly connected: boolean;
  readonly backups: BackupLists | null;
  readonly userFiles: UserFileLists | null;
  readonly files: ReadonlyMap<string, OpenedFile>;
}

/** 左の列の種類。ブラウザの物の後に、ユーザーフォルダの物 */
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
  // ユーザーフォルダの物は、ブラウザの物を読めてから並べる（つないでいなければ空で、その旨を出す）
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

/** 種類の 1 件ずつがブラウザの物か（ユーザーフォルダの物は接続先にある） */
export function isBrowserEntry(entry: Entry): boolean {
  return entry.category.area !== 'userFiles';
}

/** 読めた控え。読めていなければ null */
export function backupsOf(entry: Entry): readonly StorageItem[] | null {
  return entry.backups === null || entry.backups === 'failed' ? null : entry.backups;
}

/**
 * 控えを書く種類の控えをまとめた物。読めなかった種類は除く。読んでいる・つないでいない種類が
 * 1 つでもあれば null
 */
export function allBackupsOf(entries: readonly Entry[]): readonly StorageItem[] | null {
  const backed = entries.filter((entry) => entry.backup !== null);
  if (backed.some((entry) => entry.backups === null)) return null;
  return backed.flatMap((entry) => backupsOf(entry) ?? []);
}

/** バックアップの列を出すか（控えを書く種類か、ファイルを開いている種類） */
export function hasReference(entry: Entry): boolean {
  return entry.backup !== null || entry.file !== null;
}

/** ブラウザの行（控えを添える）の下に、控えにだけある行を並べる */
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

/** 見出しの下の種類 */
export function membersOf(ids: readonly string[], entries: readonly Entry[]): Entry[] {
  return ids.flatMap((id) => entries.filter((entry) => entry.id === id));
}

/** 概要で数える種類（全体・IndexedDB の表・選んだまとまりの中身） */
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

/** 件数と大きさ */
export function figures(items: readonly StorageItem[]): string {
  const size = t('llm.storage.size', { size: formatBytes(totalOf(items)) });
  return `${t('llm.storage.count', { count: items.length })} · ${size}`;
}

/** バックアップの件数と大きさ。読めていなければ — */
export function formatBackupFigures(items: readonly StorageItem[] | null): string {
  return items === null ? '—' : figures(items);
}

/**
 * バックアップの列の情報。件数と大きさは括弧で添え、つないでいない・読めない・読んでいるはその旨。
 * 列が無ければ null
 */
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

/** 1 件の名前。名前を持たない物は、分かる鍵ならその名前、ほかは鍵 */
export function itemName(item: StorageItem): string {
  if (item.name.length > 0) return item.name;
  return item.known === null ? item.key : t(KEY_TEXT[item.known][0]);
}

/** 1 件の名前と大きさ。バックアップにだけある行は、大きさを出さない */
export function rowTextOf(row: Row): { readonly name: string; readonly size: string } {
  const shown = row.browser ?? row.backup;
  return {
    name: shown === null ? row.key : itemName(shown),
    size: row.browser === null ? '' : formatBytes(row.browser.bytes),
  };
}

/** 保存した時刻。分からなければ空 */
export function formatSavedTime(at: number | null): string {
  return at === null ? '' : new Date(at).toLocaleString(activeLocale(), TIME_FORMAT);
}

/** 今の場所の階層（全体 › 見出し › 種類）。押すとそこへ戻る */
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

/** 書き出すファイルの名前（種類と時刻） */
export function exportFileName(entry: Entry): string {
  const at = new Date();
  const two = (value: number): string => String(value).padStart(2, '0');
  const date = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}`;
  return `kisaraui-${entry.id.replace(/[^a-z0-9-]/gi, '-')}-${date}-${two(at.getHours())}${two(at.getMinutes())}.jsonl.gz`;
}

/**
 * 名前を 1 行に書いた長さの見積もり（em）。全角は 0.95em、半角は 0.55em として数える
 * （折り返しの境目を決めるだけなので、測らずに見積もる）
 */
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

/** バックアップの列に出す物。ファイルを開いていればその中身、ほかは読めた控え */
function referenceOf(entry: Entry): readonly StorageItem[] | null {
  return entry.file === null ? backupsOf(entry) : entry.file.items;
}

/** ユーザーフォルダの物を読めたか。読めていればその旨を出さない（null） */
function remoteStateOf(connected: boolean, list: unknown): RemoteState | null {
  if (!connected) return 'notConnected';
  if (list === undefined) return 'loading';
  return list === 'failed' ? 'failed' : null;
}
