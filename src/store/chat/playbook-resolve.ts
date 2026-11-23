import {
  BUILTIN_PLAYBOOKS,
  resolvePlaybook,
  type ChatPlaybook,
  type ChatPlaybookRef,
  type Playbook,
} from '@/chat/playbook';
import type { Chat } from '@/chat/types';
import { tPath } from '@/i18n';
import { usePlaybooksStore, type OwnPlaybook } from '@/store/use-playbooks-store';

function resolvePlaybookRef(
  ref: Pick<ChatPlaybookRef, 'origin' | 'id'>,
  own: Readonly<Record<string, OwnPlaybook>> = usePlaybooksStore.getState().playbooks,
): Playbook | undefined {
  if (ref.origin === 'own') return own[ref.id]?.playbook;
  const shape = BUILTIN_PLAYBOOKS.find((item) => item.id === ref.id);
  return shape === undefined ? undefined : resolvePlaybook(shape, tPath);
}

export function chatPlaybookOf(
  chat: Pick<Chat, 'playbook'> | undefined,
  own?: Readonly<Record<string, OwnPlaybook>>,
): ChatPlaybook | undefined {
  const ref = chat?.playbook;
  if (ref === undefined) return undefined;
  const playbook = resolvePlaybookRef(ref, own);
  return playbook === undefined ? undefined : { playbook, phase: ref.phase };
}
