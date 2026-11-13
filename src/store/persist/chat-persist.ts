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

// ─────────────────────────────
// 開いている会話をブラウザに書き、ComfyUI に控えを書く。読めない・書けないは異常としない（画面は続ける）。
// ─────────────────────────────

// ─────────────────────────────
// ComfyUI の接続先
// ─────────────────────────────

// 会話の左の列などから読む（置き場は接続のストア）
export { connectedComfyUrl };

/**
 * 控えを書く先（控えを書く設定で、ComfyUI につないでいるとき）。無ければ null
 */
function backupComfyUrl(): string | null {
  return useSettingsStore.getState().chatComfyBackup ? connectedComfyUrl() : null;
}

// ─────────────────────────────
// 書き込み
// ─────────────────────────────

interface Writer {
  /** 予約した書き込み */
  readonly timers: Map<string, ReturnType<typeof setTimeout>>;
  /** 最後に書いた（書き始めた）中身 */
  readonly written: Map<string, Chat>;
  /** 最後に見た中身と置き場（手放した会話の書き残しに使う） */
  readonly latest: Map<string, { readonly chat: Chat; readonly place: ChatPlace }>;
  /** 置き場に一度でも書いた（置き場から読んだ）会話。メッセージの無い新しい会話は書かない */
  readonly stored: Set<string>;
  /** 控えを書けなかった会話と、その中身（つなぎ直したら書く。手放した会話も含む） */
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

/** 開いている会話の置き場を替える（同じなら何もしない）。タブにも残す */
function adoptPlace(chatId: string, place: ChatPlace): void {
  const current = useChatStore.getState().places[chatId];
  if (current?.kind === place.kind && comfyUrlOf(current) === comfyUrlOf(place)) return;
  useChatStore.getState().setPlace(chatId, place);
  useTabsStore.getState().setChatPlace(chatId, place);
}

/**
 * 控えを書く。設定が外れていれば書かない。つないでいない・書けなければ、
 * つなぎ直したときに書く。受け取り中は書かない（終えたときにもう一度書かれる）
 */
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

/** プロンプトのタブで直す持ち物（と、それに伴って進む時刻） */
type PromptKey = 'prompt' | 'character' | 'preset' | 'persona' | 'updatedAt';

/** プロンプトのタブで直す持ち物を除いた会話 */
function withoutPrompt(chat: Chat): Omit<Chat, PromptKey> {
  const { prompt, character, preset, persona, updatedAt, ...rest } = chat;
  void [prompt, character, preset, persona, updatedAt];
  return rest;
}

/**
 * プロンプトのタブの直しだけの変更か。これだけでは書かず、送ったとき
 * （ほかの変更で書くとき）に一緒に書く
 */
function promptOnlyChange(written: Chat, next: Chat): boolean {
  return JSON.stringify(withoutPrompt(written)) === JSON.stringify(withoutPrompt(next));
}

/** 1 つの会話を書く。書いている間に手放した会話は、書けたかを入れない */
function writeChat(target: Writer, chatId: string): void {
  const timer = target.timers.get(chatId);
  if (timer !== undefined) clearTimeout(timer);
  target.timers.delete(chatId);
  const entry = target.latest.get(chatId);
  if (entry === undefined || target.written.get(chatId) === entry.chat) return;
  const { chat, place } = entry;
  // メッセージの無い新しい会話は書かない（一覧に空の会話を増やさない）
  if (chat.messages.length === 0 && !target.stored.has(chatId)) return;
  // プロンプトのタブの直しだけなら、送るまで書かない
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
      // 書けなかった中身は、書いたことにしない（次に書き直す）
      if (target.written.get(chatId) === chat) target.written.delete(chatId);
    }
    const open = useChatStore.getState().chats[chatId] !== undefined;
    if (open) useChatStore.getState().setSaveState(chatId, result);
    if (result === 'full') return;
    void ensurePersisted();
    void checkStorageUsage();
    if (result !== 'saved') return;
    // 控えだけの会話は、ブラウザに写したので両方に置いたことにする
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

/** 書けなかった会話と、書けなかった控えを書き直す（会話を消した後・つなぎ直した後） */
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

/** 消した会話は、書けなかった控えも忘れる（消した後に書き戻さない） */
export function forgetPendingBackup(chatId: string): void {
  writer?.backupPending.delete(chatId);
}

/** 予約している書き込みを今すぐ書き、書き終えるのを待つ（移す・書き出す前） */
export async function flushChat(chatId: string): Promise<void> {
  const target = writer;
  if (target === null) return;
  if (target.timers.has(chatId)) writeChat(target, chatId);
  await target.queue;
}

/** 書いたことにする（ほかの手続きが置き場に書いた・移した会話） */
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

/** 開いている会話を追いかけて置き場へ書く。止めるための関数を返す */
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
  // 始めた時点の中身は読み戻したものなので、書いたことにする
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
      // 新しく開いた会話の鍵を取る（ほかのブラウザのタブから、開いていることが見えるように）
      if (last === undefined) void claimChat(chatId);
      target.latest.set(chatId, { chat, place });
      if (target.written.get(chatId) !== chat) schedule(target, chatId);
    }
    // 手放した会話は、書いていない分を書いてから忘れる
    for (const chatId of [...target.latest.keys()]) {
      if (chats[chatId] !== undefined) continue;
      writeChat(target, chatId);
      target.latest.delete(chatId);
      target.written.delete(chatId);
      if (useChatStore.getState().pending[chatId] === undefined) releaseChat(chatId);
    }
  };
  const unsubscribe = useChatStore.subscribe(onChange);

  // つないだ・接続先を替えたら、待っていた会話を読み、書けなかった分を書く
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

/** 書き終えるのを待つ（テスト用） */
export async function settleChatWrites(): Promise<void> {
  await writer?.queue;
}
