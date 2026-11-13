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

// ─────────────────────────────
// 残した会話の出し入れ（開く・消す・名前を変える・複製する・クリアする）。
// 会話の左の列から呼ぶ（フォークは会話の画面から）。
// ─────────────────────────────

/**
 * ブラウザの会話の一覧（会話の左の列に出す）。ComfyUI の控えは一覧に出さない
 * （戻すのは設定のタブの「会話を戻す」）
 */
export function listBrowserChats(): Promise<PlacedChatMeta[]> {
  return listAllChats(null);
}

/** 会話の中身。開いていればその中身、無ければ置き場から読む */
export async function chatOf(id: string, place: ChatPlace): Promise<Chat | null> {
  const loaded = useChatStore.getState().chats[id];
  if (loaded !== undefined) {
    await flushChat(id);
    return loaded;
  }
  return loadChatFrom(id, place);
}

/** このブラウザのタブで開いているか */
function isOpenHere(id: string): boolean {
  return useTabsStore.getState().tabs.some((tab) => tab.chatId === id);
}

export { chatsOpenElsewhere, openElsewhere };

/**
 * 会話を開いた結果。ほかのブラウザのタブで開いている会話は開かない（`elsewhere`。鍵で見分ける）
 */
export type OpenResult = 'opened' | 'elsewhere' | 'missing' | 'broken' | 'failed';

/**
 * 替えてよい会話のタブ（アクティブな会話のタブで、受け取り中でない）。無ければ null
 * （受け取り中の会話を手放すと受け取りが止まるため）
 */
function replaceableTab(): string | null {
  const { tabs, activeId } = useTabsStore.getState();
  const active = tabs.find((tab) => tab.id === activeId);
  if (active?.kind !== 'chat' || active.chatId === undefined) return null;
  const chat = useChatStore.getState().chats[active.chatId];
  return chat !== undefined && isStreaming(chat) ? null : active.id;
}

/** 開いた会話を、このタブに替えて出すか新しいタブ（空のタブならそれ）に出す */
function showChat(id: string, place: ChatPlace, here: boolean): void {
  const tabId = here ? replaceableTab() : null;
  if (tabId === null) useTabsStore.getState().openExistingChat(id, place);
  else useTabsStore.getState().replaceChat(tabId, id, place);
}

/**
 * 会話を開く。このブラウザのタブで開いていればそのタブへ移る。`here` なら、アクティブな会話のタブの
 * 会話をその会話に替える（会話の左の列。受け取り中なら新しいタブ）
 */
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
  // 控えだけの会話は書いたことにしない（書き込みの仕組みがブラウザに写す）
  if (inBrowser(place)) markChatWritten(id, chat, place);
  useChatStore.getState().put(id, chat, place);
  showChat(id, place, options.here === true);
  return 'opened';
}

/**
 * 新しい会話を始める（会話の左の列）。接続の設定とモデルは全体のものを使い、このタブを替える。
 * 今の会話にメッセージが無くても押すたびに新しく作る。受け取り中なら新しいタブで始める
 */
export function startNewChatHere(): void {
  const id = useChatStore.getState().add();
  // 置き場は最後に選んだ保存先（会話のストアが作るときに決める）
  showChat(id, useChatStore.getState().places[id] ?? BROWSER_PLACE, true);
}

/** 会話を変える操作の結果。ほかのブラウザのタブで開いている会話は変えない（`elsewhere`） */
export type ChangeResult = 'done' | 'elsewhere' | 'streaming' | 'broken' | 'full' | 'failed';

/**
 * 会話を消す。開いているタブも閉じる。ブラウザから消し、ComfyUI の控えは残す
 * （片付けはストレージの管理）
 */
export async function deleteChat(id: string): Promise<ChangeResult> {
  if (await openElsewhere(id)) return 'elsewhere';
  for (const tab of useTabsStore.getState().tabs.filter((item) => item.chatId === id)) {
    useTabsStore.getState().closeTab(tab.id);
  }
  // 閉じたときの書き残しを済ませてから消す（消した後に書き戻さない）
  await settleChatWrites();
  forgetPendingBackup(id);
  try {
    await removeChatFrom(id, BROWSER_PLACE);
  } catch {
    return 'failed';
  }
  releaseChat(id);
  // 空いた分で、書けなかった会話を書き直す
  retryUnsavedChats();
  void checkStorageUsage(true);
  useChatLibraryStore.getState().refresh();
  return 'done';
}

/**
 * ComfyUI の控えの会話をまとめてブラウザに写す（設定のタブ）。id で突き合わせ、ブラウザに
 * 無ければ足し、控えの方が新しければ置き換える。このブラウザのタブで開いている会話と、ほかの
 * ブラウザのタブで開いている会話は写さない（開いている中身を外から書き換えない）。`only` を渡すとその id の
 * 1 件だけを写す（ストレージの管理）
 */
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
      // 設定の会話の上限を超える控えは写さない
      if (overRestoreLimit('chat', meta.size)) {
        tooLarge += 1;
        continue;
      }
      // 壊れた控えは写さない
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

/** 名前を変える。開いていれば開いている会話を変える（書くのは書き込みの仕組み） */
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

/** 複製の名前のもと（一覧に出す名前と同じ決まり） */
function copyBase(chat: Chat): string {
  const name = chat.name.trim();
  if (name.length > 0) return name;
  const head = headName(chatHead(chat));
  return head.length > 0 ? head : t('llm.chat.untitled');
}

/**
 * 会話を新しい id でブラウザに写す（開かない）。名前は「のコピー」を添え、時刻は写した時刻。
 * 受け取り中の候補は止めたものとして写す
 */
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

/**
 * 開いている会話の `assistant` の応答までを残した写しを新しい id でブラウザに作り、新しいタブで開いて
 * 移る（フォーク）。元の会話は変えない
 */
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

/**
 * 会話の発言と要約を消す（一覧には残す）。開いていれば開いている会話を変える（書くのは書き込みの
 * 仕組み）。受け取り中とほかのブラウザのタブで開いている会話はクリアしない
 */
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
      // 壊れた会話は、名前だけを読み取れれば残した空の会話で置き換える
      if (!(error instanceof BrokenChatError)) throw error;
      return { ...freshChat(), name: brokenName(await loadRawChat(id, place)) };
    });
    if (chat === null) return 'failed';
    const cleared = { ...clearedChat(chat, newShortId), updatedAt: Date.now() };
    await saveChatTo(id, cleared, place);
    // 壊れていたのでタブに出せなかった会話は、クリアした中身で出す
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

/** 壊れた会話の 1 件から読み取れる名前。読めなければ空 */
export function brokenName(raw: unknown): string {
  if (!isRecord(raw)) return '';
  const chat = isRecord(raw.chat) ? raw.chat : raw;
  return typeof chat.name === 'string' ? chat.name : '';
}
