import { serializeConversations } from '@/chat/conversation-file';
import { CHAT_FILE_MAX_BYTES, readChatFile } from '@/chat/import';
import { BROWSER_PLACE, type Chat, type ChatPlace } from '@/chat/types';
import { t } from '@/i18n';
import { downloadText } from '@/lib/download';
import { escapeFileName } from '@/lib/file-name';
import { isTooLarge } from '@/lib/file-size';
import { newShortId } from '@/lib/id';
import { brokenName, chatOf, openChat } from '@/store/chat/chat-library';
import { BrokenChatError, isFullError, loadRawChat, saveChatTo } from '@/store/persist/chat-repo';
import { checkStorageUsage, ensurePersisted } from '@/store/persist/storage-estimate';
import { useChatLibraryStore } from '@/store/use-chat-library-store';

// ─────────────────────────────
// 残した会話の書き出しと、ファイルからの読み込み。会話の左の列から呼ぶ。
// ─────────────────────────────

function exportName(chat: Chat): string {
  const name = chat.name.trim();
  return escapeFileName(name.length > 0 ? name : t('llm.chat.untitled'));
}

/**
 * 会話を書き出す（ChatGPT の形）
 */
export async function exportChat(id: string, place: ChatPlace): Promise<boolean> {
  let chat: Chat | null;
  try {
    chat = await chatOf(id, place);
  } catch (error) {
    if (!(error instanceof BrokenChatError)) return false;
    // 壊れた会話は、置き場の 1 件を直さずにそのまま書き出す
    const raw = await loadRawChat(id, place).catch(() => null);
    if (raw === null) return false;
    downloadText(
      JSON.stringify(raw),
      `${escapeFileName(brokenName(raw) || id)}.broken.json`,
      'application/json',
    );
    return true;
  }
  if (chat === null) return false;
  downloadText(
    serializeConversations([{ id, chat }]),
    `${exportName(chat)}.json`,
    'application/json',
  );
  return true;
}

/** 会話のファイルを読み込んだ結果 */
export interface ImportResult {
  /** 読み込んでブラウザに置いた会話の id */
  readonly added: readonly string[];
  readonly skipped: number;
  readonly dropped: number;
  /** 容量の不足で途中で止めた */
  readonly full: boolean;
  /** 読めない形のファイル */
  readonly unreadable: boolean;
  /** 大きすぎて読まなかった（上限は CHAT_FILE_MAX_BYTES） */
  readonly tooLarge?: boolean;
}

/**
 * 会話のファイルを読み込み、新しい id でブラウザに置く。1 つならこのタブで開き、
 * 2 つ以上ならダイアログをブラウザの側で開く
 */
export async function importChatFile(file: File): Promise<ImportResult> {
  // 丸ごと読む前に大きさを見る（巨大なファイルで画面を止めない）
  if (isTooLarge(file, CHAT_FILE_MAX_BYTES)) {
    return { added: [], skipped: 0, dropped: 0, full: false, unreadable: true, tooLarge: true };
  }
  const parsed = readChatFile(await file.text(), file.name, Date.now());
  if (parsed === null) {
    return { added: [], skipped: 0, dropped: 0, full: false, unreadable: true };
  }
  const added: string[] = [];
  let skipped = parsed.skipped;
  let full = false;
  for (const chat of parsed.chats) {
    const id = newShortId();
    const filled: Chat = chat;
    try {
      await saveChatTo(id, filled, BROWSER_PLACE);
      added.push(id);
    } catch (error) {
      if (isFullError(error, BROWSER_PLACE)) {
        full = true;
        break;
      }
      skipped += 1;
    }
  }
  if (added.length > 0) {
    void ensurePersisted();
    void checkStorageUsage(true);
  }
  useChatLibraryStore.getState().refresh();
  // 最初の 1 つを開き、左の列にブラウザの一覧を出す（2 つ以上ならそこから選ぶ）
  const [first] = added;
  if (first !== undefined) {
    if (added.length > 1) useChatLibraryStore.getState().openList();
    await openChat(first, BROWSER_PLACE);
  }
  return { added, skipped, dropped: parsed.dropped, full, unreadable: false };
}
