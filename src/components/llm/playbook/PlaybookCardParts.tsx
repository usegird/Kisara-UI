import { cva } from 'class-variance-authority';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { OutlineView, PlaybookAction } from '@/chat/playbook';
import { currentStep, nextStep, outlineSteps, prevStep, stepTitle } from '@/chat/playbook-outline';
import {
  ICON_BUTTON,
  PLAYBOOK_TOGGLE,
  playbookLink,
} from '@/components/llm/playbook/playbook-link';
import { PlaybookStepList } from '@/components/llm/playbook/PlaybookOutline';
import { usePlaybookAction } from '@/components/llm/playbook/use-playbook-action';
import { t } from '@/i18n';
import { useChatStore } from '@/store/use-chat-store';

// ─────────────────────────────
// プレイブックのカードの部品（操作のリンク・縮めたときの段の行・末尾のアウトライン）。
// ─────────────────────────────

/** 縮めたカードの段の行の文字。「n/m 選択済み」は 1 文字ほど字下げする */
const foldedLine = cva('min-w-0 flex-1 truncate pr-1 text-xs', {
  variants: { indent: { true: 'pl-[1em]', false: 'pl-1' } },
});

/** 操作のリンク（構成の相談を開く・次の段へ）。名前で出し、次の段への主の操作は文字を太くする */
export function PlaybookActionLink({
  chatId,
  action,
  primary,
}: {
  readonly chatId: string;
  readonly action: PlaybookAction;
  readonly primary: boolean;
}): React.ReactElement {
  const control = usePlaybookAction(chatId);
  // 構成の相談を開く操作は「› コマンド」と同じ書式で出し、指したときにサブセッションを開くことを添える
  if (action.kind === 'consult') {
    return (
      <button
        type="button"
        className={PLAYBOOK_TOGGLE}
        disabled={!control.enabled(action)}
        title={t('llm.playbook.subSession')}
        onClick={() => control.run(action)}
      >
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        {action.name}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={playbookLink({ primary })}
      disabled={!control.enabled(action)}
      onClick={() => control.run(action)}
    >
      {action.name}
    </button>
  );
}

/**
 * 縮めたカードの末尾の段の行。有効な段が 1 つなら ‹ {i}/{n} {題} › で段を移り（読むだけのフェーズでは
 * 移れない）、そうでなければ {有効な数}/{n} 選択済み。段が無ければ出さない
 */
export function FoldedStep({
  chatId,
  view,
}: {
  readonly chatId: string;
  readonly view: OutlineView;
}): React.ReactElement | null {
  const count = useChatStore((state) => {
    const chat = state.chats[chatId];
    return chat === undefined ? 0 : outlineSteps(chat).length;
  });
  const picked = useChatStore((state) => {
    const chat = state.chats[chatId];
    return chat === undefined ? 0 : outlineSteps(chat).filter((entry) => entry.enabled).length;
  });
  const current = useChatStore((state) => {
    const chat = state.chats[chatId];
    return chat === undefined ? null : currentStep(chat);
  });
  const title = useChatStore((state) => {
    const chat = state.chats[chatId];
    const at = chat === undefined ? null : currentStep(chat);
    const step = chat === undefined || at === null ? undefined : outlineSteps(chat)[at];
    return step === undefined ? '' : stepTitle(step) || t('llm.playbook.untitled');
  });
  if (count === 0) return null;
  const one = picked === 1 && current !== null;
  const movable = one && view !== 'readonly';
  const edit = useChatStore.getState().updatePlaybookChat;
  return (
    <div
      role="group"
      className="mt-1 flex items-center gap-1 rounded-b-md border-t px-1.5 py-1"
      aria-label={t('llm.playbook.outline')}
    >
      {movable ? (
        <button
          type="button"
          className={ICON_BUTTON}
          disabled={current <= 0}
          aria-label={t('llm.playbook.stepPrev')}
          title={t('llm.playbook.stepPrev')}
          onClick={() => edit(chatId, prevStep)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      ) : null}
      <p className={foldedLine({ indent: !one })} aria-live="polite">
        {one
          ? t('llm.playbook.stepAt', { i: String(current + 1), n: String(count), title })
          : t('llm.playbook.picked', { i: String(picked), n: String(count) })}
      </p>
      {movable ? (
        <button
          type="button"
          className={ICON_BUTTON}
          disabled={current >= count - 1}
          aria-label={t('llm.playbook.stepNext')}
          title={t('llm.playbook.stepNext')}
          onClick={() => edit(chatId, nextStep)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/**
 * プレイブックのカードの末尾のアウトライン。どのフェーズでも、縮めずに段の一覧を出す（段が無ければ
 * 出さない）。見出しの行は置かない
 */
export function OutlineSection({
  chatId,
  view,
}: {
  readonly chatId: string;
  readonly view: OutlineView;
}): React.ReactElement | null {
  const count = useChatStore((state) => {
    const chat = state.chats[chatId];
    return chat === undefined ? 0 : outlineSteps(chat).length;
  });
  if (count === 0) return null;
  return (
    // カードの末尾の区切り。角はカードの下の角に合わせる
    <div
      role="group"
      className="overflow-hidden rounded-b-md border-t px-1.5 py-1"
      aria-label={t('llm.playbook.outline')}
    >
      <PlaybookStepList chatId={chatId} view={view} />
    </div>
  );
}
