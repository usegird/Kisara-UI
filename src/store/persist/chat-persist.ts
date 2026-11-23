import { isStreaming } from '@/chat/edit';
import {
  BROWSER_PLACE,
  comfyUrlOf,
  inBrowser,
  placeFrom,
  type Chat,
  type ChatPlace,
} from '@/chat/types';
import { WRITE_DELAY_MS } from '@/store/persist/app-db';
import { claimChat, releaseChat } from '@/store/persist/chat-locks';
import { isFullError, saveChatTo } from '@/store/persist/chat-repo';
import { loadWaitingChats, reconcileBothChats } from '@/store/persist/chat-restore';
import { checkStorageUsage, ensurePersisted } from '@/store/persist/storage-estimate';
import { useChatStore } from '@/store/use-chat-store';
import { connectedComfyUrl, useConnectionStore } from '@/store/use-connection-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

export { connectedComfyUrl };

function backupComfyUrl(): string | null {
  return useSettingsStore.getState().chatComfyBackup ? connectedComfyUrl() : null;
}

interface Writer {
  readonly timers: Map<string, ReturnType<typeof setTimeout>>;
  readonly written: Map<string, Chat>;
  readonly latest: Map<string, { readonly chat: Chat; readonly place: ChatPlace }>;
  readonly stored: Set<string>;
  readonly backupPending: Map<string, Chat>;
  queue: Promise<void>;
}

let writer: Writer | null = null;

function saveStateOf(error: unknown, place: ChatPlace): 'full' | 'unsaved' {
  try {
    return isFullError(error, place) ? 'full' : 'unsaved';
  } catch {
    return 'unsaved';
  }
}

function adoptPlace(chatId: string, place: ChatPlace): void {
  const current = useChatStore.getState().places[chatId];
  if (current?.kind === place.kind && comfyUrlOf(current) === comfyUrlOf(place)) return;
  useChatStore.getState().setPlace(chatId, place);
  useTabsStore.getState().setChatPlace(chatId, place);
}

async function backupChat(target: Writer, chatId: string, chat: Chat): Promise<void> {
  if (!useSettingsStore.getState().chatComfyBackup || isStreaming(chat)) return;
  const baseUrl = backupComfyUrl();
  if (baseUrl === null) {
    target.backupPending.set(chatId, chat);
    return;
  }
  try {
    await saveChatTo(chatId, chat, { kind: 'comfy', baseUrl });
  } catch {
    target.backupPending.set(chatId, chat);
    return;
  }
  if (target.backupPending.get(chatId) === chat) target.backupPending.delete(chatId);
  if (useChatStore.getState().chats[chatId] !== undefined) {
    adoptPlace(chatId, { kind: 'both', baseUrl });
  }
}

type PromptKey = 'prompt' | 'character' | 'preset' | 'persona' | 'updatedAt';

function withoutPrompt(chat: Chat): Omit<Chat, PromptKey> {
  const { prompt, character, preset, persona, updatedAt, ...rest } = chat;
  void [prompt, character, preset, persona, updatedAt];
  return rest;
}

function promptOnlyChange(written: Chat, next: Chat): boolean {
  return JSON.stringify(withoutPrompt(written)) === JSON.stringify(withoutPrompt(next));
}

function writeChat(target: Writer, chatId: string): void {
  const timer = target.timers.get(chatId);
  if (timer !== undefined) clearTimeout(timer);
  target.timers.delete(chatId);
  const entry = target.latest.get(chatId);
  if (entry === undefined || target.written.get(chatId) === entry.chat) return;
  const { chat, place } = entry;
  if (chat.messages.length === 0 && !target.stored.has(chatId)) return;
  const written = target.written.get(chatId);
  if (written !== undefined && promptOnlyChange(written, chat)) return;
  target.written.set(chatId, chat);
  target.queue = target.queue.then(async () => {
    let result: 'saved' | 'full' | 'unsaved' = 'saved';
    try {
      await saveChatTo(chatId, chat, BROWSER_PLACE);
      target.stored.add(chatId);
    } catch (error) {
      result = saveStateOf(error, BROWSER_PLACE);
      if (target.written.get(chatId) === chat) target.written.delete(chatId);
    }
    const open = useChatStore.getState().chats[chatId] !== undefined;
    if (open) useChatStore.getState().setSaveState(chatId, result);
    if (result === 'full') return;
    void ensurePersisted();
    void checkStorageUsage();
    if (result !== 'saved') return;
    if (open && !inBrowser(place)) adoptPlace(chatId, placeFrom(true, comfyUrlOf(place)));
    await backupChat(target, chatId, chat);
  });
}

function schedule(target: Writer, chatId: string): void {
  if (target.timers.has(chatId)) return;
  target.timers.set(
    chatId,
    setTimeout(() => writeChat(target, chatId), WRITE_DELAY_MS),
  );
}

export function retryUnsavedChats(): void {
  const target = writer;
  if (target === null) return;
  const { chats, saveStates } = useChatStore.getState();
  for (const chatId of Object.keys(chats)) {
    const state = saveStates[chatId];
    if (state === 'full' || state === 'unsaved') {
      target.written.delete(chatId);
      writeChat(target, chatId);
    }
  }
  if (backupComfyUrl() === null) return;
  for (const [chatId, chat] of [...target.backupPending]) {
    target.queue = target.queue.then(() => backupChat(target, chatId, chat));
  }
}

export function forgetPendingBackup(chatId: string): void {
  writer?.backupPending.delete(chatId);
}

export async function flushChat(chatId: string): Promise<void> {
  const target = writer;
  if (target === null) return;
  if (target.timers.has(chatId)) writeChat(target, chatId);
  await target.queue;
}

export function markChatWritten(chatId: string, chat: Chat, place: ChatPlace): void {
  const target = writer;
  if (target === null) return;
  const timer = target.timers.get(chatId);
  if (timer !== undefined) clearTimeout(timer);
  target.timers.delete(chatId);
  target.latest.set(chatId, { chat, place });
  target.written.set(chatId, chat);
  target.stored.add(chatId);
}

let stopPersist: (() => void) | null = null;

export function startChatPersist(): () => void {
  stopPersist?.();
  const target: Writer = {
    timers: new Map(),
    written: new Map(),
    latest: new Map(),
    stored: new Set(),
    backupPending: new Map(),
    queue: Promise.resolve(),
  };
  writer = target;
  const initial = useChatStore.getState();
  for (const [chatId, chat] of Object.entries(initial.chats)) {
    const place = initial.places[chatId] ?? BROWSER_PLACE;
    target.latest.set(chatId, { chat, place });
    target.written.set(chatId, chat);
    target.stored.add(chatId);
  }

  const onChange = (): void => {
    const { chats, places } = useChatStore.getState();
    for (const [chatId, chat] of Object.entries(chats)) {
      const place = places[chatId] ?? BROWSER_PLACE;
      const last = target.latest.get(chatId);
      if (last?.chat === chat && last.place === place) continue;
      if (last === undefined) void claimChat(chatId);
      target.latest.set(chatId, { chat, place });
      if (target.written.get(chatId) !== chat) schedule(target, chatId);
    }
    for (const chatId of [...target.latest.keys()]) {
      if (chats[chatId] !== undefined) continue;
      writeChat(target, chatId);
      target.latest.delete(chatId);
      target.written.delete(chatId);
      if (useChatStore.getState().pending[chatId] === undefined) releaseChat(chatId);
    }
  };
  const unsubscribe = useChatStore.subscribe(onChange);

  let connected = connectedComfyUrl();
  const onConnection = (): void => {
    const next = connectedComfyUrl();
    if (next === connected) return;
    connected = next;
    if (next === null) return;
    void loadWaitingChats().then(() => reconcileBothChats());
    retryUnsavedChats();
  };
  const unsubscribeConnection = useConnectionStore.subscribe(onConnection);
  const unsubscribeSettings = useSettingsStore.subscribe(onConnection);
  if (connected !== null) void loadWaitingChats().then(() => reconcileBothChats());

  const flush = (): void => {
    for (const chatId of [...target.timers.keys()]) writeChat(target, chatId);
  };
  globalThis.addEventListener?.('pagehide', flush);
  globalThis.addEventListener?.('visibilitychange', flush);

  const stop = (): void => {
    unsubscribe();
    unsubscribeConnection();
    unsubscribeSettings();
    globalThis.removeEventListener?.('pagehide', flush);
    globalThis.removeEventListener?.('visibilitychange', flush);
    for (const timer of target.timers.values()) clearTimeout(timer);
    if (stopPersist === stop) stopPersist = null;
    if (writer === target) writer = null;
  };
  stopPersist = stop;
  return stop;
}

export async function settleChatWrites(): Promise<void> {
  await writer?.queue;
}
