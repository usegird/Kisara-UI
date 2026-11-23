import { clearedChat } from '@/chat/card-greeting';
import { forkedChat, isStreaming } from '@/chat/edit';
import { chatHead, headName } from '@/chat/meta';
import { settleInterrupted } from '@/chat/stream-receive';
import { BROWSER_PLACE, inBrowser, type Chat, type ChatPlace } from '@/chat/types';
import { t } from '@/i18n';
import { isRecord } from '@/lib/guards';
import { newShortId } from '@/lib/id';
import {
  chatsOpenElsewhere,
  claimChat,
  openElsewhere,
  releaseChat,
} from '@/store/persist/chat-locks';
import {
  connectedComfyUrl,
  flushChat,
  forgetPendingBackup,
  markChatWritten,
  retryUnsavedChats,
  settleChatWrites,
} from '@/store/persist/chat-persist';
import {
  BrokenChatError,
  isFullError,
  listAllChats,
  listChatsIn,
  loadChatFrom,
  loadRawChat,
  removeChatFrom,
  saveChatTo,
  type PlacedChatMeta,
} from '@/store/persist/chat-repo';
import { freshChat } from '@/store/persist/chat-restore';
import { withTooLarge, type RestoreResult } from '@/store/persist/library-backup';
import { overRestoreLimit } from '@/store/persist/restore-limit';
import { checkStorageUsage, ensurePersisted } from '@/store/persist/storage-estimate';
import { useChatLibraryStore } from '@/store/use-chat-library-store';
import { useChatStore } from '@/store/use-chat-store';
import { useTabsStore } from '@/store/use-tabs-store';

export function listBrowserChats(): Promise<PlacedChatMeta[]> {
  return listAllChats(null);
}

export async function chatOf(id: string, place: ChatPlace): Promise<Chat | null> {
  const loaded = useChatStore.getState().chats[id];
  if (loaded !== undefined) {
    await flushChat(id);
    return loaded;
  }
  return loadChatFrom(id, place);
}

function isOpenHere(id: string): boolean {
  return useTabsStore.getState().tabs.some((tab) => tab.chatId === id);
}

export { chatsOpenElsewhere, openElsewhere };

export type OpenResult = 'opened' | 'elsewhere' | 'missing' | 'broken' | 'failed';

function replaceableTab(): string | null {
  const { tabs, activeId } = useTabsStore.getState();
  const active = tabs.find((tab) => tab.id === activeId);
  if (active?.kind !== 'chat' || active.chatId === undefined) return null;
  const chat = useChatStore.getState().chats[active.chatId];
  return chat !== undefined && isStreaming(chat) ? null : active.id;
}

function showChat(id: string, place: ChatPlace, here: boolean): void {
  const tabId = here ? replaceableTab() : null;
  if (tabId === null) useTabsStore.getState().openExistingChat(id, place);
  else useTabsStore.getState().replaceChat(tabId, id, place);
}

export async function openChat(
  id: string,
  place: ChatPlace,
  options: { readonly here?: boolean } = {},
): Promise<OpenResult> {
  if (isOpenHere(id)) {
    useTabsStore.getState().openExistingChat(id);
    return 'opened';
  }
  if (!(await claimChat(id))) return 'elsewhere';
  let chat: Chat | null;
  try {
    chat = await loadChatFrom(id, place);
  } catch (error) {
    releaseChat(id);
    return error instanceof BrokenChatError ? 'broken' : 'failed';
  }
  if (chat === null) {
    releaseChat(id);
    return 'missing';
  }
  if (inBrowser(place)) markChatWritten(id, chat, place);
  useChatStore.getState().put(id, chat, place);
  showChat(id, place, options.here === true);
  return 'opened';
}

export function startNewChatHere(): void {
  const id = useChatStore.getState().add();
  showChat(id, useChatStore.getState().places[id] ?? BROWSER_PLACE, true);
}

export type ChangeResult = 'done' | 'elsewhere' | 'streaming' | 'broken' | 'full' | 'failed';

export async function deleteChat(id: string): Promise<ChangeResult> {
  if (await openElsewhere(id)) return 'elsewhere';
  for (const tab of useTabsStore.getState().tabs.filter((item) => item.chatId === id)) {
    useTabsStore.getState().closeTab(tab.id);
  }
  await settleChatWrites();
  forgetPendingBackup(id);
  try {
    await removeChatFrom(id, BROWSER_PLACE);
  } catch {
    return 'failed';
  }
  releaseChat(id);
  retryUnsavedChats();
  void checkStorageUsage(true);
  useChatLibraryStore.getState().refresh();
  return 'done';
}

export async function restoreChats(only?: string): Promise<RestoreResult> {
  const baseUrl = connectedComfyUrl();
  if (baseUrl === null) return { added: 0, updated: 0, failed: true };
  const comfy: ChatPlace = { kind: 'comfy', baseUrl };
  let added = 0;
  let updated = 0;
  let tooLarge = 0;
  try {
    const [local, remote] = await Promise.all([listChatsIn(BROWSER_PLACE), listChatsIn(comfy)]);
    const times = new Map(local.map((meta) => [meta.id, meta.updatedAt]));
    const newer = remote.filter(
      (meta) =>
        (only === undefined || meta.id === only) &&
        (times.get(meta.id) ?? -Infinity) < meta.updatedAt,
    );
    const elsewhere = await chatsOpenElsewhere(newer.map((meta) => meta.id));
    for (const meta of newer) {
      if (useChatStore.getState().chats[meta.id] !== undefined || elsewhere.has(meta.id)) continue;
      if (overRestoreLimit('chat', meta.size)) {
        tooLarge += 1;
        continue;
      }
      const chat = await loadChatFrom(meta.id, comfy).catch((error: unknown) => {
        if (error instanceof BrokenChatError) return null;
        throw error;
      });
      if (chat === null) continue;
      await saveChatTo(meta.id, chat, BROWSER_PLACE);
      if (times.has(meta.id)) updated += 1;
      else added += 1;
    }
  } catch {
    return { added, updated, failed: true, ...withTooLarge(tooLarge) };
  } finally {
    useChatLibraryStore.getState().refresh();
  }
  if (added > 0) void ensurePersisted();
  return { added, updated, failed: false, ...withTooLarge(tooLarge) };
}

export async function renameChat(
  id: string,
  place: ChatPlace,
  name: string,
): Promise<ChangeResult> {
  if (useChatStore.getState().chats[id] !== undefined) {
    useChatStore.getState().update(id, { name });
    useChatLibraryStore.getState().refresh();
    return 'done';
  }
  if (await openElsewhere(id)) return 'elsewhere';
  try {
    const chat = await loadChatFrom(id, place);
    if (chat === null) return 'failed';
    await saveChatTo(id, { ...chat, name, updatedAt: Date.now() }, place);
  } catch (error) {
    return isFullError(error, place) ? 'full' : 'failed';
  }
  useChatLibraryStore.getState().refresh();
  return 'done';
}

function copyBase(chat: Chat): string {
  const name = chat.name.trim();
  if (name.length > 0) return name;
  const head = headName(chatHead(chat));
  return head.length > 0 ? head : t('llm.chat.untitled');
}

export async function duplicateChat(id: string, place: ChatPlace): Promise<ChangeResult> {
  try {
    const chat = await chatOf(id, place);
    if (chat === null) return 'failed';
    const now = Date.now();
    const copy: Chat = {
      ...settleInterrupted(chat),
      name: t('llm.sidebar.copyName', { name: copyBase(chat) }),
      createdAt: now,
      updatedAt: now,
    };
    await saveChatTo(newShortId(), copy, BROWSER_PLACE);
  } catch (error) {
    if (error instanceof BrokenChatError) return 'broken';
    return isFullError(error, BROWSER_PLACE) ? 'full' : 'failed';
  }
  void ensurePersisted();
  void checkStorageUsage(true);
  useChatLibraryStore.getState().refresh();
  return 'done';
}

export async function forkChat(id: string, messageId: string): Promise<ChangeResult> {
  const chat = useChatStore.getState().chats[id];
  if (chat === undefined) return 'failed';
  if (isStreaming(chat)) return 'streaming';
  const forked = forkedChat(chat, messageId);
  if (forked === null) return 'failed';
  const now = Date.now();
  const copy: Chat = {
    ...forked,
    name: t('llm.chat.forkName', { name: copyBase(chat) }),
    createdAt: now,
    updatedAt: now,
  };
  const forkId = newShortId();
  try {
    await saveChatTo(forkId, copy, BROWSER_PLACE);
  } catch (error) {
    return isFullError(error, BROWSER_PLACE) ? 'full' : 'failed';
  }
  void ensurePersisted();
  void checkStorageUsage(true);
  useChatLibraryStore.getState().refresh();
  return (await openChat(forkId, BROWSER_PLACE)) === 'opened' ? 'done' : 'failed';
}

export async function clearChat(id: string, place: ChatPlace): Promise<ChangeResult> {
  const open = useChatStore.getState().chats[id];
  if (open !== undefined) {
    if (isStreaming(open)) return 'streaming';
    useChatStore.getState().clear(id);
    useChatLibraryStore.getState().refresh();
    return 'done';
  }
  if (await openElsewhere(id)) return 'elsewhere';
  try {
    const chat = await loadChatFrom(id, place).catch(async (error: unknown) => {
      if (!(error instanceof BrokenChatError)) throw error;
      return { ...freshChat(), name: brokenName(await loadRawChat(id, place)) };
    });
    if (chat === null) return 'failed';
    const cleared = { ...clearedChat(chat, newShortId), updatedAt: Date.now() };
    await saveChatTo(id, cleared, place);
    if (useChatStore.getState().pending[id]?.kind === 'broken' && (await claimChat(id))) {
      useChatStore.getState().setPending(id, null);
      markChatWritten(id, cleared, place);
      useChatStore.getState().put(id, cleared, place);
    }
  } catch (error) {
    return isFullError(error, place) ? 'full' : 'failed';
  }
  useChatLibraryStore.getState().refresh();
  return 'done';
}

export function brokenName(raw: unknown): string {
  if (!isRecord(raw)) return '';
  const chat = isRecord(raw.chat) ? raw.chat : raw;
  return typeof chat.name === 'string' ? chat.name : '';
}
