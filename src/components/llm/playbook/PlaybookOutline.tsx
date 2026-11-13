import { cva } from 'class-variance-authority';
import { Circle, CircleDot } from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { LoreEntry } from '@/chat/lore';
import type { OutlineView } from '@/chat/playbook';
import {
  currentStep,
  editStep,
  outlineSteps,
  stepTitle,
  toggleStep,
  withStep,
} from '@/chat/playbook-outline';
import { PLAYBOOK_FIELD } from '@/components/llm/playbook/playbook-link';
import { t } from '@/i18n';
import { useChatStore } from '@/store/use-chat-store';

// ─────────────────────────────
// アウトラインの一覧。アウトラインの辞書の項目を段として 1 行ずつ並べる。
// ─────────────────────────────

/** 行。有効な段は地の色を付ける */
const entryRow = cva('flex items-start gap-1.5 rounded-md px-1 py-0.5', {
  variants: { current: { true: 'bg-muted', false: '' } },
});

const ICON_BUTTON = 'text-muted-foreground hover:text-foreground mt-0.5 shrink-0';

/** アウトラインの段の一覧。有効な段に印を付け、題を押すと題と本文の欄を開く */
export function PlaybookStepList({
  chatId,
  view,
}: {
  readonly chatId: string;
  /** 段の選び方。読むだけなら印は押せず、題を押すと本文を文字のまま出す */
  readonly view: OutlineView;
}): React.ReactElement {
  const steps = useChatStore(
    useShallow((state) => {
      const chat = state.chats[chatId];
      return chat === undefined ? [] : outlineSteps(chat);
    }),
  );
  const current = useChatStore((state) => {
    const chat = state.chats[chatId];
    return chat === undefined ? null : currentStep(chat);
  });
  const [open, setOpen] = useState<number | null>(null);

  const edit = useChatStore.getState().updatePlaybookChat;
  const row = (entry: LoreEntry, index: number): React.ReactElement => {
    const isCurrent = index === current;
    const expanded = open === index;
    const title = stepTitle(entry) || t('llm.playbook.untitled');
    return (
      <div className={entryRow({ current: entry.enabled })}>
        {view === 'single' ? (
          <button
            type="button"
            className={ICON_BUTTON}
            aria-pressed={isCurrent}
            aria-label={
              isCurrent ? t('llm.playbook.currentMark') : t('llm.playbook.makeCurrent', { title })
            }
            title={isCurrent ? t('llm.playbook.currentMark') : undefined}
            onClick={() => edit(chatId, (chat) => withStep(chat, index))}
          >
            {isCurrent ? (
              <CircleDot className="size-3.5" aria-hidden />
            ) : (
              <Circle className="size-3.5" aria-hidden />
            )}
          </button>
        ) : (
          // いくつでも選べるならチェック。読むだけでも、どの段が有効かを見せるために出す（押せない）
          <input
            type="checkbox"
            className="mt-1 shrink-0"
            checked={entry.enabled}
            disabled={view === 'readonly'}
            aria-label={t('llm.playbook.pickStep', { title })}
            onChange={() => edit(chatId, (chat) => toggleStep(chat, index))}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <button
            type="button"
            className="truncate text-left text-sm hover:underline"
            aria-expanded={expanded}
            onClick={() => setOpen(expanded ? null : index)}
          >
            {title}
          </button>
          {!expanded ? null : view === 'readonly' ? (
            <p className="text-muted-foreground text-xs break-words whitespace-pre-wrap">
              {entry.content}
            </p>
          ) : (
            <StepFields chatId={chatId} entry={entry} index={index} />
          )}
        </div>
      </div>
    );
  };

  return (
    <ol className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
      {steps.map((entry, index) => (
        // 段は辞書の項目の並びで id を持たず、ここでは並べ替えない（並べ替えは辞書のダイアログ）。
        // 題を打つたびに行を作り直さないよう、並びの位置で見分ける
        <li key={`step-${String(index)}`}>{row(entry, index)}</li>
      ))}
    </ol>
  );
}

/** 開いた段の題と本文の欄。打つたびにアウトラインの辞書の項目を直す */
function StepFields({
  chatId,
  entry,
  index,
}: {
  readonly chatId: string;
  readonly entry: LoreEntry;
  readonly index: number;
}): React.ReactElement {
  const edit = (change: Partial<Pick<LoreEntry, 'comment' | 'content'>>): void =>
    useChatStore.getState().updatePlaybookChat(chatId, (chat) => editStep(chat, index, change));
  return (
    <>
      <input
        className={PLAYBOOK_FIELD}
        value={entry.comment}
        aria-label={t('llm.playbook.itemTitle')}
        onChange={(event) => edit({ comment: event.target.value })}
      />
      <textarea
        className={`${PLAYBOOK_FIELD}field-sizing-content min-h-[3lh] resize-none`}
        value={entry.content}
        aria-label={t('llm.playbook.itemBody')}
        onChange={(event) => edit({ content: event.target.value })}
      />
    </>
  );
}
