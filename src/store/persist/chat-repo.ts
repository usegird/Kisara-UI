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

export interface ChatTable {
  readonly get: (key: string) => Promise<unknown>;
  readonly put: (key: string, value: unknown) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
  readonly keys: () => Promise<string[]>;
}

export interface BrowserChatTables {
  readonly chats: ChatTable;
  readonly metas: ChatTable;
}

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

export function createMemoryChatTables(): BrowserChatTables {
  return { chats: memoryTable(), metas: memoryTable() };
}

let tables: BrowserChatTables | null = null;

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
  }
  tables = createMemoryChatTables();
  return tables;
}

export function installBrowserChatTables(next: BrowserChatTables | null): void {
  tables = next;
}

interface StoredChat {
  readonly chat: Chat;
  readonly savedAt: number;
}

export class BrokenChatError extends Error {}

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
  const keys = new Set(await chats.keys());
  return [...found.values()].filter((meta) => keys.has(meta.id));
}

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

export function listChatsIn(place: ChatPlace): Promise<ChatMeta[]> {
  return place.kind === 'browser' ? listBrowser() : listComfy(place.baseUrl);
}

export interface PlacedChatMeta extends ChatMeta {
  readonly place: ChatPlace;
}

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

export async function loadChatFrom(id: string, place: ChatPlace): Promise<Chat | null> {
  if (place.kind === 'comfy') return loadComfy(place.baseUrl, id);
  const raw = await browserChatTables().chats.get(id);
  const local = storedChat(raw);
  if (place.kind === 'browser') return local;
  const remote = await loadComfy(place.baseUrl, id);
  if (local === null || remote === null) return local ?? remote;
  return remote.updatedAt > local.updatedAt ? remote : local;
}

export async function loadRawChat(id: string, place: ChatPlace): Promise<unknown> {
  if (inBrowser(place)) {
    const raw = await browserChatTables().chats.get(id);
    if (raw !== undefined) return raw;
  }
  const comfyUrl = comfyUrlOf(place);
  return comfyUrl === null ? null : comfyPort().chats.fetchChat(comfyUrl, id);
}

export async function saveChatTo(id: string, chat: Chat, place: ChatPlace): Promise<void> {
  if (inBrowser(place)) await saveBrowser(id, chat);
  const comfyUrl = comfyUrlOf(place);
  if (comfyUrl !== null) await saveComfy(comfyUrl, id, chat);
}

export async function removeChatFrom(id: string, place: ChatPlace): Promise<void> {
  const comfyUrl = comfyUrlOf(place);
  if (comfyUrl !== null) await comfyPort().chats.removeChat(comfyUrl, id);
  if (!inBrowser(place)) return;
  const { chats, metas } = browserChatTables();
  await metas.delete(id);
  await chats.delete(id);
}

export function isFullError(error: unknown, place: ChatPlace): boolean {
  if (place.kind !== 'browser' && comfyPort().chats.isFull(error)) return true;
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}
