import { useChatStore } from '@/store/use-chat-store';
import { usePlaybookPanelStore } from '@/store/use-playbook-panel-store';
import { usePromptAdvisorStore } from '@/store/use-prompt-advisor-store';

// ─────────────────────────────
// 会話の画面の右上（アバターの列の上端）にカードを重ねているか。
// ─────────────────────────────

/**
 * 構成の相談かプレイブックのカードが 1 枚でもあるか。呼び出し側は、ある間カードの側に余白を取る。
 */
export function useSideCards(chatId: string): boolean {
  const advisor = usePromptAdvisorStore((state) =>
    Object.values(state.sessions).some((session) => session.chatId === chatId),
  );
  const playbook = useChatStore((state) => state.chats[chatId]?.playbook !== undefined);
  const playbookOpen = usePlaybookPanelStore((state) => state.open[chatId] === true);
  return advisor || playbook || playbookOpen;
}
