import { isStreaming } from '@/chat/edit';
import { BROWSER_PLACE, EMPTY_CHAT, type Chat, type ChatPlace } from '@/chat/types';
import { newShortId } from '@/lib/id';
import { trimBaseUrl } from '@/lib/url-history';
import { claimChat } from '@/store/persist/chat-locks';
import { BrokenChatError, loadChatFrom, saveChatTo } from '@/store/persist/chat-repo';
import { checkStorageUsage } from '@/store/persist/storage-estimate';
import { useChatStore } from '@/store/use-chat-store';
import { connectedComfyUrl } from '@/store/use-connection-store';
import { useTabsStore } from '@/store/use-tabs-store';

function sameComfyUrl(a: string, b: string): boolean {
  return trimBaseUrl(a) === trimBaseUrl(b);
}

export function freshChat(): Chat {
  const now = Date.now();
  return {
    ...EMPTY_CHAT,
    createdAt: now,
    updatedAt: now,
  };
}

type Loaded =
  | { readonly kind: 'chat'; readonly chat: Chat | null }
  | { readonly kind: 'broken' }
  | { readonly kind: 'failed' };

async function loadBrowserChat(chatId: string): Promise<Loaded> {
  try {
    return { kind: 'chat', chat: await loadChatFrom(chatId, BROWSER_PLACE) };
  } catch (error) {
    return { kind: error instanceof BrokenChatError ? 'broken' : 'failed' };
  }
}

async function copyToNewChat(tabId: string, chatId: string): Promise<void> {
  const loaded = await loadBrowserChat(chatId);
  if (loaded.kind !== 'chat') {
    useChatStore.getState().setPending(chatId, { kind: loaded.kind });
    return;
  }
  const source = loaded.chat ?? freshChat();
  const copyId = newShortId();
  await claimChat(copyId);
  const now = Date.now();
  const copy = { ...source, createdAt: now, updatedAt: now };
  useTabsStore.getState().setTabChat(tabId, copyId);
  useChatStore.getState().put(copyId, copy, BROWSER_PLACE);
  try {
    await saveChatTo(copyId, copy, BROWSER_PLACE);
  } catch {
  }
}

async function loadComfyChat(chatId: string, baseUrl: string, both: boolean): Promise<void> {
  const store = useChatStore.getState();
  if (!(await claimChat(chatId))) {
    store.setPending(chatId, { kind: 'elsewhere' });
    return;
  }
  store.setPending(chatId, { kind: 'loading' });
  try {
    const place: ChatPlace = both ? { kind: 'both', baseUrl } : { kind: 'comfy', baseUrl };
    const chat = await loadChatFrom(chatId, place);
    if (chat === null) useChatStore.getState().setPending(chatId, { kind: 'missing' });
    else useChatStore.getState().put(chatId, chat, place);
  } catch (error) {
    useChatStore
      .getState()
      .setPending(
        chatId,
        error instanceof BrokenChatError ? { kind: 'broken' } : { kind: 'waiting', baseUrl, both },
      );
  }
}

export async function loadWaitingChats(): Promise<void> {
  const current = connectedComfyUrl();
  if (current === null) return;
  for (const [chatId, pending] of Object.entries(useChatStore.getState().pending)) {
    if (pending.kind === 'waiting' && sameComfyUrl(pending.baseUrl, current)) {
      await loadComfyChat(chatId, pending.baseUrl, pending.both === true);
    }
  }
}

export async function reconcileBothChats(): Promise<void> {
  const current = connectedComfyUrl();
  if (current === null) return;
  for (const [chatId, place] of Object.entries(useChatStore.getState().places)) {
    if (place.kind !== 'both' || !sameComfyUrl(place.baseUrl, current)) continue;
    const local = useChatStore.getState().chats[chatId];
    if (local === undefined || isStreaming(local)) continue;
    try {
      const remote = await loadChatFrom(chatId, { kind: 'comfy', baseUrl: place.baseUrl });
      if (remote !== null && remote.updatedAt > local.updatedAt) {
        useChatStore.getState().put(chatId, remote, place);
      }
    } catch {
    }
  }
}

export async function restoreChats(): Promise<void> {
  for (const tab of useTabsStore.getState().tabs) {
    if (tab.kind !== 'chat' || tab.chatId === undefined) continue;
    const chatId = tab.chatId;
    if (tab.chatComfyUrl !== undefined && tab.chatBoth !== true) {
      useChatStore.getState().setPending(chatId, { kind: 'waiting', baseUrl: tab.chatComfyUrl });
      continue;
    }
    if (tab.chatComfyUrl !== undefined) await restoreBothChat(chatId, tab.chatComfyUrl);
    else await restoreBrowserChat(tab.id, chatId);
  }
  if (Object.keys(useChatStore.getState().chats).length > 0) void checkStorageUsage(true);
}

async function restoreBothChat(chatId: string, baseUrl: string): Promise<void> {
  const loaded = (await claimChat(chatId)) ? await loadBrowserChat(chatId) : null;
  if (loaded?.kind === 'broken') {
    useChatStore.getState().setPending(chatId, { kind: 'broken' });
    return;
  }
  const local = loaded?.kind === 'chat' ? loaded.chat : null;
  const place: ChatPlace = { kind: 'both', baseUrl };
  if (local === null) {
    useChatStore.getState().setPending(chatId, { kind: 'waiting', baseUrl, both: true });
  } else {
    useChatStore.getState().put(chatId, local, place);
  }
}

async function restoreBrowserChat(tabId: string, chatId: string): Promise<void> {
  if (!(await claimChat(chatId))) {
    await copyToNewChat(tabId, chatId);
    return;
  }
  const loaded = await loadBrowserChat(chatId);
  if (loaded.kind === 'chat') useChatStore.getState().put(chatId, loaded.chat ?? freshChat());
  else useChatStore.getState().setPending(chatId, { kind: loaded.kind });
}
