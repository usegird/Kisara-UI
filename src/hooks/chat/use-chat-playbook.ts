import type { ChatPlaybook } from '@/chat/playbook';
import { chatPlaybookOf } from '@/store/chat/playbook-resolve';
import { useChatStore } from '@/store/use-chat-store';
import { usePlaybooksStore } from '@/store/use-playbooks-store';

export function useChatPlaybook(chatId: string): ChatPlaybook | undefined {
  const ref = useChatStore((state) => state.chats[chatId]?.playbook);
  const own = usePlaybooksStore((state) => state.playbooks);
  return ref === undefined ? undefined : chatPlaybookOf({ playbook: ref }, own);
}
