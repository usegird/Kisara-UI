import { useChatStore } from '@/store/use-chat-store';
import { usePlaybookPanelStore } from '@/store/use-playbook-panel-store';
import { usePromptAdvisorStore } from '@/store/use-prompt-advisor-store';

export function useSideCards(chatId: string): boolean {
  const advisor = usePromptAdvisorStore((state) =>
    Object.values(state.sessions).some((session) => session.chatId === chatId),
  );
  const playbook = useChatStore((state) => state.chats[chatId]?.playbook !== undefined);
  const playbookOpen = usePlaybookPanelStore((state) => state.open[chatId] === true);
  return advisor || playbook || playbookOpen;
}
