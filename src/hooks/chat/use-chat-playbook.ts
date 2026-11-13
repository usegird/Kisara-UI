import type { ChatPlaybook } from '@/chat/playbook';
import { chatPlaybookOf } from '@/store/chat/playbook-resolve';
import { useChatStore } from '@/store/use-chat-store';
import { usePlaybooksStore } from '@/store/use-playbooks-store';

// ─────────────────────────────
// 画面で使う会話のプレイブック（引いた定義と今のフェーズ）。
// ─────────────────────────────

/**
 * 会話のプレイブックを引いて返す。会話の参照と自分のプレイブックの一覧の変わり目で引き直すので、
 * 自分のものを直せば選んでいる会話にもすぐ効く。
 */
export function useChatPlaybook(chatId: string): ChatPlaybook | undefined {
  const ref = useChatStore((state) => state.chats[chatId]?.playbook);
  const own = usePlaybooksStore((state) => state.playbooks);
  return ref === undefined ? undefined : chatPlaybookOf({ playbook: ref }, own);
}
