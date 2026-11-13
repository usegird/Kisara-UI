import { serializeConversations } from '@/chat/conversation-file';
import { parseConversations } from '@/chat/conversation-file-parse';
import { parseChat, parseIntactChat } from '@/chat/file';
import { byteLength, chatMeta, parseChatMeta } from '@/chat/meta';
import {
  BROWSER_PLACE,
  comfyUrlOf,
  inBrowser,
  placeFrom,
  type Chat,
  type ChatMeta,
  type ChatPlace,
} from '@/chat/types';
import { isRecord } from '@/lib/guards';
import { withAppStore, type AppStoreName } from '@/store/persist/app-db';
import { comfyPort } from '@/store/ports/comfy-port';

// ─────────────────────────────
// 会話の置き場（ブラウザ・ComfyUI・両方）の読み書き。本文と一覧の項目を分けて持ち、一覧は本文を読まない。
// 失敗は投げる（容量の不足かどうかは `isFullError` で見分ける）。
// ─────────────────────────────

/** 1 つの表の読み書き（テストでは作り物に差し替える） */
export interface ChatTable {
  readonly get: (key: string) => Promise<unknown>;
  readonly put: (key: string, value: unknown) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
  readonly keys: () => Promise<string[]>;
}

/** ブラウザの置き場の 2 つの表（会話の本文と、一覧の項目） */
export interface BrowserChatTables {
  readonly chats: ChatTable;
  readonly metas: ChatTable;
}

/** 大きい保存領域（IndexedDB）の 1 つの表を読み書きする表を作る */
export function indexedDbTable(factory: IDBFactory, name: AppStoreName): ChatTable {
  return {
    get: (key) => withAppStore(factory, name, 'readonly', (store) => store.get(key)),
    put: async (key, value) => {
      await withAppStore(factory, name, 'readwrite', (store) => store.put(value, key));
    },
    delete: async (key) => {
      await withAppStore(factory, name, 'readwrite', (store) => store.delete(key));
    },
    keys: async () => {
      const keys = await withAppStore(factory, name, 'readonly', (store) => store.getAllKeys());
      return keys.filter((key): key is string => typeof key === 'string');
    },
  };
}

/** 画面の中だけに持つ表を作る。出し入れのたびに写すので、読んだ物を変えても中身は変わらない */
export function memoryTable(): ChatTable {
  const saved = new Map<string, unknown>();
  return {
    get: (key) => Promise.resolve(saved.has(key) ? structuredClone(saved.get(key)) : undefined),
    put: (key, value) => {
      saved.set(key, structuredClone(value));
      return Promise.resolve();
    },
    delete: (key) => {
      saved.delete(key);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...saved.keys()]),
  };
}

/** 画面の中だけに持つブラウザの置き場の 2 つの表を作る */
export function createMemoryChatTables(): BrowserChatTables {
  return { chats: memoryTable(), metas: memoryTable() };
}

let tables: BrowserChatTables | null = null;

/** ブラウザの置き場。IndexedDB に触れない環境では画面の中だけに持つ */
function browserChatTables(): BrowserChatTables {
  if (tables !== null) return tables;
  try {
    if (typeof globalThis.indexedDB !== 'undefined') {
      const factory = globalThis.indexedDB;
      tables = {
        chats: indexedDbTable(factory, 'chat'),
        metas: indexedDbTable(factory, 'chat-meta'),
      };
      return tables;
    }
  } catch {
    // IndexedDB へのアクセス自体が例外になる環境がある
  }
  tables = createMemoryChatTables();
  return tables;
}

/** テストから置き場を差し替える */
export function installBrowserChatTables(next: BrowserChatTables | null): void {
  tables = next;
}

// ─────────────────────────────
// ブラウザの置き場
// ─────────────────────────────

/** 会話の表の 1 件 */
interface StoredChat {
  readonly chat: Chat;
  readonly savedAt: number;
}

/**
 * 置き場の会話が壊れている（会話の形でない・読めない発言がある）。消さず、上書きもせず、開かない。
 * 読み込みの例外（一時的な失敗）とは別
 */
export class BrokenChatError extends Error {}

/** 会話の表の 1 件を読む。無ければ null、壊れていれば投げる */
function storedChat(raw: unknown): Chat | null {
  if (raw === undefined) return null;
  const chat = isRecord(raw) ? parseIntactChat(raw.chat) : null;
  if (chat === null) throw new BrokenChatError();
  return chat;
}

async function saveBrowser(id: string, chat: Chat): Promise<void> {
  const { chats, metas } = browserChatTables();
  const record: StoredChat = { chat, savedAt: Date.now() };
  await chats.put(id, record);
  await metas.put(id, chatMeta(id, chat, byteLength(JSON.stringify(record))));
}

/**
 * 一覧の項目の全件。一覧の項目が無い会話（一覧の表ができる前に書いたもの）は、本文から作って書き足す。
 * 読めない本文はそのとき消す
 */
async function listBrowser(): Promise<ChatMeta[]> {
  const { chats, metas } = browserChatTables();
  const found = new Map<string, ChatMeta>();
  for (const key of await metas.keys()) {
    const meta = parseChatMeta(await metas.get(key));
    if (meta !== null) found.set(key, meta);
  }
  for (const key of await chats.keys()) {
    if (found.has(key)) continue;
    const raw = await chats.get(key);
    // 壊れた本文も消さずに出す（一覧の項目は書かない。開くと壊れていることを出す）
    const body = isRecord(raw) ? raw.chat : undefined;
    const chat = parseChat(body);
    if (chat === null) continue;
    const meta = chatMeta(key, chat, byteLength(JSON.stringify(raw)));
    if (parseIntactChat(body) === null) {
      found.set(key, meta);
      continue;
    }
    await metas.put(key, meta);
    found.set(key, meta);
  }
  // 本文の無い一覧の項目は出さない
  const keys = new Set(await chats.keys());
  return [...found.values()].filter((meta) => keys.has(meta.id));
}

// ─────────────────────────────
// ComfyUI の置き場
// ─────────────────────────────

async function saveComfy(baseUrl: string, id: string, chat: Chat): Promise<void> {
  const body = serializeConversations([{ id, chat }]);
  const meta = JSON.stringify(chatMeta(id, chat, byteLength(body)));
  await comfyPort().chats.saveChat(baseUrl, { id, body, meta });
}

async function loadComfy(baseUrl: string, id: string): Promise<Chat | null> {
  const raw = await comfyPort().chats.fetchChat(baseUrl, id);
  if (raw === null) return null;
  const parsed = parseConversations(raw);
  const chat = parsed.chats[0];
  if (chat === undefined || parsed.skipped > 0 || parsed.dropped > 0) throw new BrokenChatError();
  return chat;
}

async function listComfy(baseUrl: string): Promise<ChatMeta[]> {
  const raw = await comfyPort().chats.listMetas(baseUrl);
  return raw.flatMap((item) => parseChatMeta(item) ?? []);
}

// ─────────────────────────────
// 置き場を問わない入口。両方（ブラウザと ComfyUI）に置いた会話は、両方を読み書きする
// ─────────────────────────────

/** その置き場にある会話の一覧の項目を読む */
export function listChatsIn(place: ChatPlace): Promise<ChatMeta[]> {
  return place.kind === 'browser' ? listBrowser() : listComfy(place.baseUrl);
}

/** 一覧の 1 件と、どこに置いてあるか */
export interface PlacedChatMeta extends ChatMeta {
  readonly place: ChatPlace;
}

/**
 * ブラウザと、つないでいる ComfyUI の会話をまとめた一覧。**内部識別子（会話の id）が同じものは
 * 1 件にまとめ**、両方にあれば置き場を両方にし、項目は最後に変えた時刻の新しい方を使う
 */
export async function listAllChats(comfyUrl: string | null): Promise<PlacedChatMeta[]> {
  const browser = await listBrowser().catch(() => []);
  const comfy = comfyUrl === null ? [] : await listComfy(comfyUrl).catch(() => []);
  const merged = new Map<string, PlacedChatMeta>();
  for (const meta of browser) merged.set(meta.id, { ...meta, place: BROWSER_PLACE });
  for (const meta of comfy) {
    if (comfyUrl === null) break;
    const local = merged.get(meta.id);
    const newer = local === undefined || meta.updatedAt > local.updatedAt ? meta : local;
    merged.set(meta.id, { ...newer, place: placeFrom(local !== undefined, comfyUrl) });
  }
  return [...merged.values()];
}

/** 会話を読む。無ければ null。両方に置いた会話は、最後に変えた時刻の新しい方を返す */
export async function loadChatFrom(id: string, place: ChatPlace): Promise<Chat | null> {
  if (place.kind === 'comfy') return loadComfy(place.baseUrl, id);
  const raw = await browserChatTables().chats.get(id);
  const local = storedChat(raw);
  if (place.kind === 'browser') return local;
  const remote = await loadComfy(place.baseUrl, id);
  if (local === null || remote === null) return local ?? remote;
  return remote.updatedAt > local.updatedAt ? remote : local;
}

/**
 * 置き場の 1 件をそのまま読む（壊れた会話の書き出し）。無ければ null
 */
export async function loadRawChat(id: string, place: ChatPlace): Promise<unknown> {
  if (inBrowser(place)) {
    const raw = await browserChatTables().chats.get(id);
    if (raw !== undefined) return raw;
  }
  const comfyUrl = comfyUrlOf(place);
  return comfyUrl === null ? null : comfyPort().chats.fetchChat(comfyUrl, id);
}

/** 書く。両方なら、ブラウザに書いてから ComfyUI に書く */
export async function saveChatTo(id: string, chat: Chat, place: ChatPlace): Promise<void> {
  if (inBrowser(place)) await saveBrowser(id, chat);
  const comfyUrl = comfyUrlOf(place);
  if (comfyUrl !== null) await saveComfy(comfyUrl, id, chat);
}

/** その置き場から会話を消す（両方に置いた会話は両方から） */
export async function removeChatFrom(id: string, place: ChatPlace): Promise<void> {
  const comfyUrl = comfyUrlOf(place);
  if (comfyUrl !== null) await comfyPort().chats.removeChat(comfyUrl, id);
  if (!inBrowser(place)) return;
  const { chats, metas } = browserChatTables();
  await metas.delete(id);
  await chats.delete(id);
}

/** 書けなかった理由が、置き場の容量の不足か */
export function isFullError(error: unknown, place: ChatPlace): boolean {
  if (place.kind !== 'browser' && comfyPort().chats.isFull(error)) return true;
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}
