import { cva } from 'class-variance-authority';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { PlaybookPhase, PlaybookSendAction } from '@/chat/playbook';
import { PLAYBOOK_TOGGLE, playbookLink } from '@/components/llm/playbook/playbook-link';
import { usePlaybookAction } from '@/components/llm/playbook/use-playbook-action';
import { t } from '@/i18n';

// ─────────────────────────────
// プレイブックのカードの開閉する段（「› コマンド」）。初めは閉じる。
// ─────────────────────────────

/** 開閉の三角 */
const fold = cva('size-3.5 shrink-0 transition-transform', {
  variants: { open: { true: 'rotate-90', false: '' } },
});

/** コマンドのリンク 1 つ。`action` が null なら続きを書く。押したら `onDone` で一覧を閉じる */
function CommandLink({
  chatId,
  action,
  onDone,
}: {
  readonly chatId: string;
  readonly action: PlaybookSendAction | null;
  readonly onDone: () => void;
}): React.ReactElement {
  const control = usePlaybookAction(chatId);
  return (
    <li>
      <button
        type="button"
        className={playbookLink()}
        disabled={action === null ? !control.directable : !control.enabled(action)}
        onClick={() => {
          if (action === null) control.runWith(null, []);
          else control.run(action);
          onDone();
        }}
      >
        {action === null ? t('llm.playbook.continueSend') : action.name}
      </button>
    </li>
  );
}

/**
 * 「› コマンド」。送るの操作をリンクで並べ、押すと指示の枠に入れる。並べるものが無ければ出さない
 */
export function PlaybookCommands({
  chatId,
  phase,
  standing,
}: {
  readonly chatId: string;
  readonly phase: PlaybookPhase;
  readonly standing: readonly PlaybookSendAction[];
}): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const proceed = phase.kind === 'proceed';
  const sends = phase.actions.filter(
    (action): action is PlaybookSendAction => action.kind === 'send',
  );
  const commands: readonly (PlaybookSendAction | null)[] = [
    ...(proceed ? [null] : []),
    ...sends,
    ...(proceed ? standing : []),
  ];
  if (commands.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className={PLAYBOOK_TOGGLE}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronRight className={fold({ open })} aria-hidden />
        {t('llm.playbook.commands')}
      </button>
      {open ? (
        <ul className="flex flex-col gap-1 pl-5">
          {commands.map((action) => (
            <CommandLink
              key={action?.id ?? ''}
              chatId={chatId}
              action={action}
              onDone={() => setOpen(false)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
