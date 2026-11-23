import { useState } from 'react';

import type { ChatPlaybook, PlaybookAction, PlaybookSendAction } from '@/chat/playbook';
import type { Candidate } from '@/chat/playbook-text';
import { playbookLink } from '@/components/llm/playbook/playbook-link';
import { usePlaybookAction } from '@/components/llm/playbook/use-playbook-action';
import type { PlaybookResponse } from '@/components/llm/playbook/use-playbook-response';
import { t } from '@/i18n';

function CandidatePicker({
  chatId,
  state,
  response,
  candidates,
  onCancel,
}: {
  readonly chatId: string;
  readonly state: ChatPlaybook;
  readonly response: PlaybookResponse;
  readonly candidates: readonly Candidate[];
  readonly onCancel: () => void;
}): React.ReactElement {
  const control = usePlaybookAction(chatId);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const chosen = candidates.filter((_, index) => picked.has(index));
  const sendTo = response.action.sendTo;
  const found =
    sendTo === undefined
      ? null
      : state.playbook.phases.flatMap((phase) => phase.actions).find((item) => item.id === sendTo);
  const target = sendTargetOf(found);
  const toggle = (index: number): void => {
    const next = new Set(picked);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setPicked(next);
  };
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-muted-foreground mb-1 text-xs">{t('llm.playbook.candidates')}</legend>
      <ul className="flex flex-col gap-0.5">
        {candidates.map((item, index) => (
          <li key={`${index}:${item.title}`}>
            <label className="hover:bg-muted flex items-start gap-2 rounded-md px-1 py-0.5 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={picked.has(index)}
                aria-label={t('llm.playbook.pickOne', { title: item.title })}
                onChange={() => toggle(index)}
              />
              <span className="flex min-w-0 flex-col">
                <span>{item.title}</span>
                {item.body.length > 0 ? (
                  <span className="text-muted-foreground text-xs whitespace-pre-wrap">
                    {item.body}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <button
          type="button"
          className={playbookLink({ primary: true })}
          disabled={
            chosen.length === 0 ||
            target === undefined ||
            (target !== null && !control.enabled(target))
          }
          onClick={() => {
            if (target !== undefined) control.runWith(target, chosen);
          }}
        >
          {t('llm.playbook.pickAndSend', {
            name: target === null ? t('llm.playbook.continueSend') : (target?.name ?? ''),
          })}
        </button>
        <button type="button" className={playbookLink()} onClick={onCancel}>
          {t('llm.playbook.pickCancel')}
        </button>
      </div>
    </fieldset>
  );
}

export function PlaybookResponseUse({
  chatId,
  state,
  response,
  onCancel,
}: {
  readonly chatId: string;
  readonly state: ChatPlaybook;
  readonly response: PlaybookResponse | null;
  readonly onCancel: () => void;
}): React.ReactElement | null {
  if (response === null) return null;
  if (response.candidates === null) {
    return (
      <p role="alert" className="text-destructive text-xs">
        {t('llm.playbook.candidatesFailed')}
      </p>
    );
  }
  return (
    <CandidatePicker
      key={response.messageId}
      chatId={chatId}
      state={state}
      response={response}
      candidates={response.candidates}
      onCancel={onCancel}
    />
  );
}

function sendTargetOf(
  found: PlaybookAction | null | undefined,
): PlaybookSendAction | null | undefined {
  if (found === null) return null;
  return found?.kind === 'send' ? found : undefined;
}
