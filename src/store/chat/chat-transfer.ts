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

function exportName(chat: Chat): string {
  const name = chat.name.trim();
  return escapeFileName(name.length > 0 ? name : t('llm.chat.untitled'));
}

export async function exportChat(id: string, place: ChatPlace): Promise<boolean> {
  let chat: Chat | null;
  try {
    chat = await chatOf(id, place);
  } catch (error) {
    if (!(error instanceof BrokenChatError)) return false;
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

export interface ImportResult {
  readonly added: readonly string[];
  readonly skipped: number;
  readonly dropped: number;
  readonly full: boolean;
  readonly unreadable: boolean;
  readonly tooLarge?: boolean;
}

export async function importChatFile(file: File): Promise<ImportResult> {
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
  const [first] = added;
  if (first !== undefined) {
    if (added.length > 1) useChatLibraryStore.getState().openList();
    await openChat(first, BROWSER_PLACE);
  }
  return { added, skipped, dropped: parsed.dropped, full, unreadable: false };
}
