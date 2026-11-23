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

const BACKUP_DELAY_MS = 2000;

function presetBody(preset: Preset): string {
  const { id, name, fields, lorebooks, createdAt, updatedAt } = preset;
  return JSON.stringify({ v: 7, id, name, fields, lorebooks, createdAt, updatedAt });
}

function templateBody(template: SystemPromptTemplate): string {
  return JSON.stringify({ v: 1, ...template });
}

function avatarBody(avatar: Avatar): string {
  const { id, name, hash, createdAt } = avatar;
  return JSON.stringify({ v: 1, id, name, hash, type: avatar.image.type, createdAt });
}

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

interface LibrarySource {
  readonly watch: (onChanged: (item: Item) => void, onRemoved: (id: string) => void) => () => void;
  readonly current: (id: string) => Item | null;
}

interface LibraryStore<S> {
  readonly subscribe: (listener: (state: S, prev: S) => void) => () => void;
  readonly getState: () => S;
}

const LIBRARY_KINDS: readonly LibraryKind[] = [
  'presets',
  'dictionaries',
  'system-prompts',
  'avatars',
  'playbooks',
];

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

interface SourceShape<S, T> {
  readonly listOf: (state: S) => Readonly<Record<string, T>>;
  readonly isLoaded: (state: S) => boolean;
  readonly partsOf: (item: T) => Pick<Item, 'body' | 'image'>;
}

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

function backupComfyUrl(): string | null {
  return useSettingsStore.getState().chatComfyBackup ? connectedComfyUrl() : null;
}

const keyOf = (kind: LibraryKind, id: string): string => `${kind}/${id}`;

const pending = new Map<string, Item>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let restoring = false;

async function writeItem(item: Item): Promise<void> {
  const key = keyOf(item.kind, item.id);
  const baseUrl = backupComfyUrl();
  if (baseUrl === null) return;
  try {
    await comfyPort().library.save(baseUrl, item);
    if (pending.get(key) === item) pending.delete(key);
  } catch {
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

function dropPending(kind: LibraryKind, id: string): void {
  const key = keyOf(kind, id);
  pending.delete(key);
  clearTimeout(timers.get(key));
  timers.delete(key);
}

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

function retryPending(): void {
  if (backupComfyUrl() === null) return;
  for (const item of [...pending.values()]) {
    if (!timers.has(keyOf(item.kind, item.id))) void writeItem(item);
  }
}

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

function currentItem(kind: LibraryKind, id: string): Item | null {
  return SOURCES[kind].current(id);
}

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

export interface RestoreResult {
  readonly added: number;
  readonly updated: number;
  readonly failed: boolean;
  readonly tooLarge?: number;
}

export function withTooLarge(count: number): Pick<RestoreResult, 'tooLarge'> {
  return count > 0 ? { tooLarge: count } : {};
}

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
      if (only !== undefined && (!isRecord(raw) || raw.id !== only)) continue;
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

type RestoreStep = RestoreOutcome | 'too-large';

interface RestoreContext {
  readonly baseUrl: string;
  readonly port: LibraryBackupPort;
}

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

async function restorePreset(
  raw: unknown,
  { baseUrl, port }: RestoreContext,
): Promise<RestoreStep> {
  const preset = parsePreset(raw);
  if (preset === null) return null;
  if (restoreOutcomeOf(usePresetsStore.getState().presets[preset.id], preset) === null) return null;
  const image = await port.fetchImage(baseUrl, 'presets', preset.id).catch(() => null);
  const imageId =
    image === null || overRestoreLimit('avatar', image.size)
      ? null
      : (await useAvatarsStore.getState().add(image, preset.name)).id;
  return usePresetsStore.getState().restore({ ...preset, imageId });
}
