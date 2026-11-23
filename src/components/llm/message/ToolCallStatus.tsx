import { Play, RotateCw, Workflow } from 'lucide-react';
import { useState } from 'react';

import type { ToolCallState } from '@/chat/types';
import { formatLlmFailure } from '@/components/llm/message/failure-text';
import { STATE_TEXT } from '@/components/llm/message/tool-call-runs';
import {
  disclosure,
  rerunButton,
  rerunIcon,
  stateLine,
} from '@/components/llm/message/tool-call-style';
import { Generation } from '@/components/llm/message/ToolCallDetails';
import { t } from '@/i18n';
import type { LlmFailure } from '@/port/llm-port';
import type { ToolCallAttempt } from '@/store/use-chat-store';
import { useExecutionStore } from '@/store/use-execution-store';

export type GenerateRow =
  | { readonly kind: 'generating'; readonly name: string }
  | {
      readonly kind: 'failed';
      readonly name: string;
      readonly failure: LlmFailure;
      readonly attempt?: ToolCallAttempt | undefined;
    };

export function ToolCallStateText({
  state,
  name,
}: {
  readonly state: ToolCallState;
  readonly name: string;
}): React.ReactElement {
  const progress = useExecutionStore((store) =>
    state.kind === 'queued' && store.status === 'running' && store.promptId === state.promptId
      ? store.progress
      : null,
  );
  const text =
    progress === null
      ? t(STATE_TEXT[state.kind])
      : t('llm.tool.queuedProgress', { value: progress.value, max: progress.max });
  return <>{t('llm.tool.summary', { state: text, name: name || '…' })}</>;
}

export function ToolCallGenerateRow({
  chatId,
  row,
}: {
  readonly chatId: string;
  readonly row: GenerateRow | null;
}): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  if (row === null) return null;
  const failed = row.kind === 'failed';
  const state = t(failed ? 'llm.tool.failed' : 'llm.tool.receiving');
  const onToggleClick = (): void => setOpen(!open);
  return (
    <section
      className="flex w-full flex-col gap-2 text-xs"
      aria-label={t('llm.tool.card', { name: row.name })}
    >
      <div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={stateLine({ failed })}
            aria-expanded={failed ? open : undefined}
            disabled={!failed}
            onClick={onToggleClick}
          >
            <Play className={disclosure({ open: failed && open })} aria-hidden />
            <Workflow className="size-3.5 shrink-0" aria-hidden />
            {t('llm.tool.summary', { state, name: row.name })}
          </button>
          {failed ? null : (
            <span className={rerunButton({ busy: true })} aria-hidden>
              <RotateCw className={rerunIcon({ busy: true })} />
            </span>
          )}
        </div>
        {failed && open ? <FailedDetails chatId={chatId} row={row} /> : null}
      </div>
    </section>
  );
}

function FailedDetails({
  chatId,
  row,
}: {
  readonly chatId: string;
  readonly row: Extract<GenerateRow, { kind: 'failed' }>;
}): React.ReactElement {
  const { attempt } = row;
  return (
    <div className="mt-1 flex flex-col gap-1 border-l-2 pl-2">
      {attempt === undefined ? null : (
        <Generation chatId={chatId} callId={attempt.id} generation={attempt.generation} />
      )}
      <p className={stateLine({ failed: true })}>
        {formatLlmFailure(row.failure)}
      </p>
      {attempt === undefined || attempt.text.trim().length === 0 ? null : (
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">{t('llm.tool.replyText')}</span>
          <p className="max-h-40 overflow-auto break-words whitespace-pre-wrap">{attempt.text}</p>
        </div>
      )}
    </div>
  );
}
