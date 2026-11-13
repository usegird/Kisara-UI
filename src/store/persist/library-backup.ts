import { dictionaryBody, parseDictionary } from '@/chat/dictionary';
import type { Avatar, Preset, SystemPromptTemplate } from '@/chat/types';
import { approxBytes } from '@/lib/approx-bytes';
import { isRecord } from '@/lib/guards';
import type { LibraryBackupPort, LibraryKind } from '@/port/comfy-port';
import { restoreOutcomeOf, type RestoreOutcome } from '@/store/kit/library-table';
import { overRestoreLimit } from '@/store/persist/restore-limit';
import { comfyPort } from '@/store/ports/comfy-port';
import { avatarImageOf, useAvatarsStore } from '@/store/use-avatars-store';
import { connectedComfyUrl, useConnectionStore } from '@/store/use-connection-store';
import { useDictionariesStore } from '@/store/use-dictionaries-store';
import { parseOwnPlaybook, usePlaybooksStore, type OwnPlaybook } from '@/store/use-playbooks-store';
import { parsePreset, usePresetsStore } from '@/store/use-presets-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { parseTemplate, useSystemPromptsStore } from '@/store/use-system-prompts-store';

// ─────────────────────────────
// プリセット・システムプロンプトのテンプレート・追加辞書・自分のプレイブック・アバターの控えを
// ComfyUI に 1 件ずつ書き、利用者が押したときに戻す。
// ─────────────────────────────

/** 変えてから控えを書くまでの間（ms）。打鍵のたびに書かない */
const BACKUP_DELAY_MS = 2000;

/**
 * 控えの 1 件の本文（画像は別のファイル）。個別追加辞書は並びで持つ
 */
function presetBody(preset: Preset): string {
  const { id, name, fields, lorebooks, createdAt, updatedAt } = preset;
  return JSON.stringify({ v: 7, id, name, fields, lorebooks, createdAt, updatedAt });
}

function templateBody(template: SystemPromptTemplate): string {
  return JSON.stringify({ v: 1, ...template });
}

/**
 * アバターの控えの本文（画像は別のファイル。画像の種類はここに持つ）
 */
function avatarBody(avatar: Avatar): string {
  const { id, name, hash, createdAt } = avatar;
  return JSON.stringify({ v: 1, id, name, hash, type: avatar.image.type, createdAt });
}

/** アバターの控えの本文（画像を除く）。形が違えば null */
export function parseAvatarBackup(
  raw: unknown,
): (Omit<Avatar, 'image'> & { readonly type: string }) | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.hash !== 'string') return null;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '',
    hash: raw.hash,
    type: typeof raw.type === 'string' ? raw.type : '',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
  };
}

function playbookBody(item: OwnPlaybook): string {
  return JSON.stringify({ v: 1, ...item });
}

interface Item {
  readonly kind: LibraryKind;
  readonly id: string;
  readonly body: string;
  readonly image: Blob | null;
}

/** 1 つの種別の一覧の見張り方と、一覧の 1 件を控えの 1 件にする手続き */
interface LibrarySource {
  /** 読み終えた後の変化を追う。止めるための関数を返す */
  readonly watch: (onChanged: (item: Item) => void, onRemoved: (id: string) => void) => () => void;
  /** 一覧にある 1 件の控え。無ければ null */
  readonly current: (id: string) => Item | null;
}

/** 一覧を持つストア（購読と今の状態） */
interface LibraryStore<S> {
  readonly subscribe: (listener: (state: S, prev: S) => void) => () => void;
  readonly getState: () => S;
}

/** 控えの見張りを始める順 */
const LIBRARY_KINDS: readonly LibraryKind[] = [
  'presets',
  'dictionaries',
  'system-prompts',
  'avatars',
  'playbooks',
];

/** 種別ごとの一覧の置き場と、控えの本文・画像 */
const SOURCES: Readonly<Record<LibraryKind, LibrarySource>> = {
  presets: sourceOf('presets', usePresetsStore, {
    listOf: (state) => state.presets,
    isLoaded: (state) => state.loaded,
    partsOf: (preset) => ({ body: presetBody(preset), image: avatarImageOf(preset.imageId) }),
  }),
  dictionaries: sourceOf('dictionaries', useDictionariesStore, {
    listOf: (state) => state.dictionaries,
    isLoaded: (state) => state.loaded,
    partsOf: (dictionary) => ({ body: dictionaryBody(dictionary), image: null }),
  }),
  // テンプレートは読み終えた印を持たないので、初めから追う
  'system-prompts': sourceOf('system-prompts', useSystemPromptsStore, {
    listOf: (state) => state.templates,
    isLoaded: () => true,
    partsOf: (template) => ({ body: templateBody(template), image: null }),
  }),
  avatars: sourceOf('avatars', useAvatarsStore, {
    listOf: (state) => state.avatars,
    isLoaded: (state) => state.loaded,
    partsOf: (avatar) => ({ body: avatarBody(avatar), image: avatar.image }),
  }),
  playbooks: sourceOf('playbooks', usePlaybooksStore, {
    listOf: (state) => state.playbooks,
    isLoaded: (state) => state.loaded,
    partsOf: (item) => ({ body: playbookBody(item), image: null }),
  }),
};

/** ストアの一覧の読み方 */
interface SourceShape<S, T> {
  readonly listOf: (state: S) => Readonly<Record<string, T>>;
  /** 読み終えたか（読み終える前の変化を控えに書かない） */
  readonly isLoaded: (state: S) => boolean;
  /** 控えの本文と画像 */
  readonly partsOf: (item: T) => Pick<Item, 'body' | 'image'>;
}

/** ストアの一覧から、1 つの種別の見張り方を作る */
function sourceOf<S, T extends { readonly id: string }>(
  kind: LibraryKind,
  store: LibraryStore<S>,
  { listOf, isLoaded, partsOf }: SourceShape<S, T>,
): LibrarySource {
  const toItem = (item: T): Item => ({ kind, id: item.id, ...partsOf(item) });
  return {
    watch: (onChanged, onRemoved) =>
      store.subscribe((state, prev) => {
        if (!isLoaded(prev)) return;
        diff(listOf(state), listOf(prev), (item) => onChanged(toItem(item)), onRemoved);
      }),
    current: (id) => {
      const item: T | undefined = listOf(store.getState())[id];
      return item === undefined ? null : toItem(item);
    },
  };
}

/** 控えを書く先（控えを書く設定で、ComfyUI につないでいるとき）。無ければ null */
function backupComfyUrl(): string | null {
  return useSettingsStore.getState().chatComfyBackup ? connectedComfyUrl() : null;
}

const keyOf = (kind: LibraryKind, id: string): string => `${kind}/${id}`;

/** 書くのを待っている 1 件（間を置いている・つないでいなかった・書けなかった） */
const pending = new Map<string, Item>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** 控えから戻している間（戻した 1 件を控えに書き戻さない） */
let restoring = false;

async function writeItem(item: Item): Promise<void> {
  const key = keyOf(item.kind, item.id);
  const baseUrl = backupComfyUrl();
  if (baseUrl === null) return;
  try {
    await comfyPort().library.save(baseUrl, item);
    if (pending.get(key) === item) pending.delete(key);
  } catch {
    // 残して、つなぎ直したときに書く
  }
}

function scheduleItem(item: Item): void {
  if (!useSettingsStore.getState().chatComfyBackup || restoring) return;
  const key = keyOf(item.kind, item.id);
  pending.set(key, item);
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      const latest = pending.get(key);
      if (latest !== undefined) void writeItem(latest);
    }, BACKUP_DELAY_MS),
  );
}

/** 書くのを待っている 1 件をやめる */
function dropPending(kind: LibraryKind, id: string): void {
  const key = keyOf(kind, id);
  pending.delete(key);
  clearTimeout(timers.get(key));
  timers.delete(key);
}

/** 2 つの一覧の違いを、書く・消えたに分ける */
function diff<T>(
  next: Readonly<Record<string, T>>,
  prev: Readonly<Record<string, T>>,
  onChanged: (item: T) => void,
  onRemoved: (id: string) => void,
): void {
  for (const [id, item] of Object.entries(next)) {
    if (prev[id] !== item) onChanged(item);
  }
  for (const id of Object.keys(prev)) {
    if (next[id] === undefined) onRemoved(id);
  }
}

/** 書けなかった控えを書く（つないだ・設定を入れた） */
function retryPending(): void {
  if (backupComfyUrl() === null) return;
  for (const item of [...pending.values()]) {
    if (!timers.has(keyOf(item.kind, item.id))) void writeItem(item);
  }
}

/** 一覧の変化を追いかけて控えを書く。読み込み（load）の後に呼ぶ。止めるための関数を返す */
export function startLibraryBackup(): () => void {
  const unsubscribeKinds = LIBRARY_KINDS.map((kind) =>
    SOURCES[kind].watch(
      (item) => scheduleItem(item),
      (id) => dropPending(kind, id),
    ),
  );
  let connected = connectedComfyUrl();
  const onConnection = (): void => {
    const next = connectedComfyUrl();
    if (next === connected) return;
    connected = next;
    retryPending();
  };
  const unsubscribeConnection = useConnectionStore.subscribe(onConnection);
  const unsubscribeSettings = useSettingsStore.subscribe(onConnection);
  return () => {
    for (const unsubscribe of unsubscribeKinds) unsubscribe();
    unsubscribeConnection();
    unsubscribeSettings();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    pending.clear();
  };
}

/** 端末の一覧にある 1 件を、控えの 1 件にする。無ければ null */
function currentItem(kind: LibraryKind, id: string): Item | null {
  return SOURCES[kind].current(id);
}

/**
 * 端末の 1 件の控えを今すぐ書く（ストレージの管理でバックアップ取得を押したとき）。
 * 控えを書く設定に関わらず、つないでいる先へ書く。書けたら true
 */
export async function backupLibraryItem(kind: LibraryKind, id: string): Promise<boolean> {
  const baseUrl = connectedComfyUrl();
  const item = currentItem(kind, id);
  if (baseUrl === null || item === null) return false;
  try {
    await comfyPort().library.save(baseUrl, { kind, id, body: item.body, image: item.image });
  } catch {
    return false;
  }
  dropPending(kind, id);
  return true;
}

/** 控えを戻した結果の数 */
export interface RestoreResult {
  /** 端末に無かったので足した数 */
  readonly added: number;
  /** 控えの方が新しかったので置き換えた数 */
  readonly updated: number;
  /** 読めなかった */
  readonly failed: boolean;
  /**
   * 上限の大きさを超えたので戻さなかった数。無ければ持たない
   */
  readonly tooLarge?: number;
}

/** 戻さなかった数があるときだけ結果に付ける */
export function withTooLarge(count: number): Pick<RestoreResult, 'tooLarge'> {
  return count > 0 ? { tooLarge: count } : {};
}

/**
 * ComfyUI の控えから、プリセット・テンプレート・追加辞書・自分のプレイブックのどれかを戻す（設定のタブで押したとき）。
 * `only` を渡すとその id の 1 件だけを戻す（ストレージの管理）。
 * id で突き合わせ、端末に無ければ足し、両方にあれば最後に変えた時刻（版）の新しい方を残す
 */
export async function restoreLibrary(kind: LibraryKind, only?: string): Promise<RestoreResult> {
  const baseUrl = connectedComfyUrl();
  if (baseUrl === null) return { added: 0, updated: 0, failed: true };
  const port = comfyPort().library;
  let added = 0;
  let updated = 0;
  let tooLarge = 0;
  const restoreRaw = RESTORERS[kind];
  restoring = true;
  try {
    for (const raw of await port.list(baseUrl, kind)) {
      // 1 件だけ戻すときは、ほかの id を読み飛ばす
      if (only !== undefined && (!isRecord(raw) || raw.id !== only)) continue;
      // 大きすぎる 1 件は戻さない（取り込むときと同じ上限）
      const step = overRestoreLimit('other', approxBytes(raw))
        ? 'too-large'
        : await restoreRaw(raw, { baseUrl, port });
      if (step === 'added') added += 1;
      if (step === 'updated') updated += 1;
      if (step === 'too-large') tooLarge += 1;
    }
  } catch {
    return { added, updated, failed: true, ...withTooLarge(tooLarge) };
  } finally {
    restoring = false;
  }
  return { added, updated, failed: false, ...withTooLarge(tooLarge) };
}

// ─────────────────────────────
// 控えの 1 件を戻す手続き（種別ごと）
// ─────────────────────────────

/** 1 件を戻した結果。上限を超えて戻さなかったときは 'too-large' */
type RestoreStep = RestoreOutcome | 'too-large';

/** 戻すときに画像を読む先 */
interface RestoreContext {
  readonly baseUrl: string;
  readonly port: LibraryBackupPort;
}

/** 種別ごとの、控えの 1 件を読んで一覧に戻す手続き。形が合わなければ null */
const RESTORERS: Readonly<
  Record<LibraryKind, (raw: unknown, context: RestoreContext) => Promise<RestoreStep>>
> = {
  'system-prompts': (raw) => {
    const template = parseTemplate(raw);
    return Promise.resolve(
      template === null ? null : useSystemPromptsStore.getState().restore(template),
    );
  },
  playbooks: (raw) => {
    const item = parseOwnPlaybook(raw);
    return Promise.resolve(item === null ? null : usePlaybooksStore.getState().restore(item));
  },
  dictionaries: (raw) => {
    const dictionary = parseDictionary(raw);
    return Promise.resolve(
      dictionary === null ? null : useDictionariesStore.getState().restore(dictionary),
    );
  },
  avatars: restoreAvatar,
  presets: restorePreset,
};

/** アバターを戻す。画像は別のファイルから読む。同じ画像があれば足さない */
async function restoreAvatar(
  raw: unknown,
  { baseUrl, port }: RestoreContext,
): Promise<RestoreStep> {
  const backup = parseAvatarBackup(raw);
  if (backup === null) return null;
  const image = await port.fetchImage(baseUrl, 'avatars', backup.id).catch(() => null);
  if (image === null) return null;
  if (overRestoreLimit('avatar', image.size)) return 'too-large';
  const avatar = { ...backup, image: new Blob([image], { type: backup.type }) };
  return (await useAvatarsStore.getState().restore(avatar)) ? 'added' : null;
}

/** プリセットを戻す。控えの画像はアバターの表へ入れ、中身が同じなら今ある 1 件を指す */
async function restorePreset(
  raw: unknown,
  { baseUrl, port }: RestoreContext,
): Promise<RestoreStep> {
  const preset = parsePreset(raw);
  if (preset === null) return null;
  // 一覧の方が新しければ、画像を読みに行かない
  if (restoreOutcomeOf(usePresetsStore.getState().presets[preset.id], preset) === null) return null;
  const image = await port.fetchImage(baseUrl, 'presets', preset.id).catch(() => null);
  // 大きすぎる画像はアバターに足さず、プリセットだけ戻す
  const imageId =
    image === null || overRestoreLimit('avatar', image.size)
      ? null
      : (await useAvatarsStore.getState().add(image, preset.name)).id;
  return usePresetsStore.getState().restore({ ...preset, imageId });
}
