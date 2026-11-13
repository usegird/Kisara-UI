import { useShallow } from 'zustand/react/shallow';

import { isStreaming } from '@/chat/edit';
import { chatHead, headName } from '@/chat/meta';
import { t } from '@/i18n';
import { useChatStore } from '@/store/use-chat-store';
import { useTabsStore, type TabLabel } from '@/store/use-tabs-store';

// ─────────────────────────────
// 会話のタブの見出し。会話は置き場に残るので、閉じるときに確かめない（未保存の印を立てない）。
// ─────────────────────────────

/** 会話のタブの名前・名前が空のときの代わり・受け取り中の印を返す */
export function useChatTabLabel(id: string): TabLabel {
  const chatId = useTabsStore((state) => state.tabs.find((tab) => tab.id === id)?.chatId);
  return useChatStore(
    useShallow((state): TabLabel => {
      const chat = chatId === undefined ? undefined : state.chats[chatId];
      const fallback = chat === undefined ? '' : headName(chatHead(chat));
      return {
        name: chat?.name ?? '',
        dirty: false,
        fallbackName: fallback.length > 0 ? fallback : t('llm.chat.untitled'),
        busy: chat !== undefined && isStreaming(chat),
      };
    }),
  );
}
