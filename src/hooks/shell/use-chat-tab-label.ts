import { useShallow } from 'zustand/react/shallow';

import { isStreaming } from '@/chat/edit';
import { chatHead, headName } from '@/chat/meta';
import { t } from '@/i18n';
import { useChatStore } from '@/store/use-chat-store';
import { useTabsStore, type TabLabel } from '@/store/use-tabs-store';

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
