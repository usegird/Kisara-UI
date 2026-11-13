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

// ─────────────────────────────
// 開いていた会話の読み戻し。読めない・書けないは異常とせず、開かないか空から始める。
// ─────────────────────────────

/** 2 つの接続先が同じか。前後の空白と末尾の `/` は見ない */
function sameComfyUrl(a: string, b: string): boolean {
  return trimBaseUrl(a) === trimBaseUrl(b);
}

/** 中身の無い会話（書く前に読み込み直した新しい会話） */
export function freshChat(): Chat {
  const now = Date.now();
  return {
    ...EMPTY_CHAT,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * ブラウザの会話を読んだ結果。読めなければ、開かない理由
 */
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

/** 複製したブラウザのタブが同じ会話を開いている。中身を新しい id へ写して別の会話にする */
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
    // 書けなければ、次に変えたときに書く
  }
}

/**
 * ComfyUI に置いた会話を読む（つないでいる接続先が同じとき）。無ければ無いことを出す。
 * 両方に置いた会話は、両方を読んで新しい方を使う
 */
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

/** 中身を持っていない ComfyUI の会話のうち、つないでいる接続先のものを読む */
export async function loadWaitingChats(): Promise<void> {
  const current = connectedComfyUrl();
  if (current === null) return;
  for (const [chatId, pending] of Object.entries(useChatStore.getState().pending)) {
    if (pending.kind === 'waiting' && sameComfyUrl(pending.baseUrl, current)) {
      await loadComfyChat(chatId, pending.baseUrl, pending.both === true);
    }
  }
}

/**
 * 両方に置いた会話のうち、つないだ ComfyUI の方が新しいもの（別の端末で直したなど）を、
 * ComfyUI の中身に替える（食い違えば新しい方）
 */
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
      // 読めなければ手元のまま続ける
    }
  }
}

/**
 * 並びに載った会話の中身を読み戻す（描く前）。並びは session-restore.ts が先に戻しておく。
 * ブラウザの会話で中身が無いものは空から始める（壊れた・読み込めなかったものは開かない）。ComfyUI の会話は
 * つないでから読む
 */
export async function restoreChats(): Promise<void> {
  for (const tab of useTabsStore.getState().tabs) {
    if (tab.kind !== 'chat' || tab.chatId === undefined) continue;
    const chatId = tab.chatId;
    // ComfyUI だけに置いた会話は、つないでから読む
    if (tab.chatComfyUrl !== undefined && tab.chatBoth !== true) {
      useChatStore.getState().setPending(chatId, { kind: 'waiting', baseUrl: tab.chatComfyUrl });
      continue;
    }
    if (tab.chatComfyUrl !== undefined) await restoreBothChat(chatId, tab.chatComfyUrl);
    else await restoreBrowserChat(tab.id, chatId);
  }
  if (Object.keys(useChatStore.getState().chats).length > 0) void checkStorageUsage(true);
}

/** 両方に置いた会話は、ブラウザの分ですぐ始め、つないだら新しい方に合わせる */
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

/** ブラウザだけに置いた会話を読む。ほかのブラウザのタブが開いていれば写しを開く */
async function restoreBrowserChat(tabId: string, chatId: string): Promise<void> {
  if (!(await claimChat(chatId))) {
    await copyToNewChat(tabId, chatId);
    return;
  }
  const loaded = await loadBrowserChat(chatId);
  // 壊れた会話と読み込めなかった会話は、空の会話で始めない（上書きしない）
  if (loaded.kind === 'chat') useChatStore.getState().put(chatId, loaded.chat ?? freshChat());
  else useChatStore.getState().setPending(chatId, { kind: loaded.kind });
}
