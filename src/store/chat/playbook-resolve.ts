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

// ─────────────────────────────
// 会話のプレイブックの定義を引く。会話は参照（標準か自分のものかと id）と
// 今のフェーズだけを持ち、写しは持たない。標準は今の画面の言語の文言の表から、自分のものは一覧から、
// その都度いちばん新しいものを引く。見つからなければ（自分のものを消した）プレイブックは無いものとする
// ─────────────────────────────

/** 参照の指す定義。見つからなければ undefined */
function resolvePlaybookRef(
  ref: Pick<ChatPlaybookRef, 'origin' | 'id'>,
  own: Readonly<Record<string, OwnPlaybook>> = usePlaybooksStore.getState().playbooks,
): Playbook | undefined {
  if (ref.origin === 'own') return own[ref.id]?.playbook;
  const shape = BUILTIN_PLAYBOOKS.find((item) => item.id === ref.id);
  return shape === undefined ? undefined : resolvePlaybook(shape, tPath);
}

/** 会話のプレイブック（引いた定義と今のフェーズ）。選んでいないか、定義が見つからなければ undefined */
export function chatPlaybookOf(
  chat: Pick<Chat, 'playbook'> | undefined,
  own?: Readonly<Record<string, OwnPlaybook>>,
): ChatPlaybook | undefined {
  const ref = chat?.playbook;
  if (ref === undefined) return undefined;
  const playbook = resolvePlaybookRef(ref, own);
  return playbook === undefined ? undefined : { playbook, phase: ref.phase };
}
