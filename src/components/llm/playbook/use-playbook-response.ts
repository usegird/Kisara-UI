import { isStreaming, selectedCandidate } from '@/chat/edit';
import { findAction, type PlaybookSendAction } from '@/chat/playbook';
import { candidatesFromText, type Candidate } from '@/chat/playbook-text';
import { useChatPlaybook } from '@/hooks/chat/use-chat-playbook';
import { useChatStore } from '@/store/use-chat-store';

// ─────────────────────────────
// プレイブックの応答の使い道を効かせるための、最後の応答とそれを求めた操作。受け取り中は無い。
// ─────────────────────────────

/** 送った指示の発言の位置（後ろから。最後は返事） */
const ASKED_FROM_END = -2;

/** 受け取り終えた最後の `assistant` の応答と、手前の `user` の発言が記録した操作 */
export interface PlaybookResponse {
  /** 応答を求めた操作（写しから引く） */
  readonly action: PlaybookSendAction;
  /** 応答の発言の id（選びかけを捨てる目印） */
  readonly messageId: string;
  readonly text: string;
  /** 使い道が候補のとき、読めた候補（読めなければ null） */
  readonly candidates: readonly Candidate[] | null;
}

/** 受け取り終えた最後の応答の本文（無ければ空） */
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

/** 最後の応答と、使い道を持つ操作。操作で求めた応答でなければ null */
export function usePlaybookResponse(chatId: string): PlaybookResponse | null {
  const { id, text } = useLastText(chatId);
  const actionId = useChatStore((state) => {
    const messages = state.chats[chatId]?.messages ?? [];
    const asked = messages.at(ASKED_FROM_END);
    return id === '' || asked?.role !== 'user' ? '' : (asked.instruction?.action ?? '');
  });
  // 会話は参照だけを持つので、定義を引いて操作を探す
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
