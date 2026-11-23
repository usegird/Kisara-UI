import { isStreaming, selectedCandidate } from '@/chat/edit';
import { findAction, type PlaybookSendAction } from '@/chat/playbook';
import { candidatesFromText, type Candidate } from '@/chat/playbook-text';
import { useChatPlaybook } from '@/hooks/chat/use-chat-playbook';
import { useChatStore } from '@/store/use-chat-store';

const ASKED_FROM_END = -2;

export interface PlaybookResponse {
  readonly action: PlaybookSendAction;
  readonly messageId: string;
  readonly text: string;
  readonly candidates: readonly Candidate[] | null;
}

function useLastText(chatId: string): { readonly id: string; readonly text: string } {
  const id = useChatStore((state) => {
    const chat = state.chats[chatId];
    if (chat === undefined || isStreaming(chat)) return '';
    const last = chat.messages.at(-1);
    return last?.role === 'assistant' ? last.id : '';
  });
  const text = useChatStore((state) => {
    const last = state.chats[chatId]?.messages.at(-1);
    return id === '' || last === undefined ? '' : (selectedCandidate(last)?.content ?? '');
  });
  return { id, text };
}

export function usePlaybookResponse(chatId: string): PlaybookResponse | null {
  const { id, text } = useLastText(chatId);
  const actionId = useChatStore((state) => {
    const messages = state.chats[chatId]?.messages ?? [];
    const asked = messages.at(ASKED_FROM_END);
    return id === '' || asked?.role !== 'user' ? '' : (asked.instruction?.action ?? '');
  });
  const playbook = useChatPlaybook(chatId)?.playbook;
  if (actionId === '' || text.length === 0 || playbook === undefined) return null;
  const action = findAction(playbook, actionId);
  if (action?.kind !== 'send' || action.use === undefined) return null;
  return {
    action,
    messageId: id,
    text,
    candidates: action.use === 'send' ? candidatesFromText(text) : null,
  };
}
