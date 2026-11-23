import { headName } from '@/chat/meta';
import type { ChatMeta, ChatPlace } from '@/chat/types';
import { toastError } from '@/components/ui/toast-manager';
import { t } from '@/i18n';

export interface ListedChat extends ChatMeta {
  readonly place: ChatPlace;
}

export function chatNameOf(item: ChatMeta): string {
  if (item.name.trim().length > 0) return item.name.trim();
  const head = headName(item.head);
  return head.length > 0 ? head : t('llm.chat.untitled');
}

export function notify(text: string | null): void {
  if (text === null) return;
  toastError(text);
}
