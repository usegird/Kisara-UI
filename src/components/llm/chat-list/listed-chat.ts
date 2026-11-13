import { headName } from '@/chat/meta';
import type { ChatMeta, ChatPlace } from '@/chat/types';
import { toastError } from '@/components/ui/toast-manager';
import { t } from '@/i18n';

// ─────────────────────────────
// 会話の一覧の 1 件と、行の名前・操作の失敗の知らせ。
// ─────────────────────────────

/** 一覧の 1 件。置き場の項目に置き場を添える */
export interface ListedChat extends ChatMeta {
  readonly place: ChatPlace;
}

/** 行に出す名前。名前が無ければ本文の頭、それも無ければ既定の名前 */
export function chatNameOf(item: ChatMeta): string {
  if (item.name.trim().length > 0) return item.name.trim();
  const head = headName(item.head);
  return head.length > 0 ? head : t('llm.chat.untitled');
}

/** 操作の失敗の文を知らせる。失敗でなければ（null）何もしない */
export function notify(text: string | null): void {
  if (text === null) return;
  toastError(text);
}
