import { FileDown } from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { CopyButton } from '@/components/ui/copy-button';
import { DialogFrame } from '@/components/ui/dialog';
import { dialogControl } from '@/components/ui/dialog-control';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/use-chat-store';
import { useReceivedStore, type ReceivedBody } from '@/store/use-received-store';
import { responseKey } from '@/store/use-response-stats-store';

const CHOICE_CLASS = cn(dialogControl({ kind: 'choice' }), 'min-w-0 py-1');

interface ReceivedEntry {
  readonly body: ReceivedBody;
  readonly label: string;
}

function useCandidates(
  chatId: string,
  messageId: string,
): { readonly count: number; readonly selected: number } {
  return useChatStore(
    useShallow((state) => {
      const message = state.chats[chatId]?.messages.find((item) => item.id === messageId);
      return { count: message?.candidates.length ?? 0, selected: message?.selected ?? 0 };
    }),
  );
}

export function MessageReceivedButton({
  chatId,
  messageId,
  className,
}: {
  readonly chatId: string;
  readonly messageId: string;
  readonly className: string;
}): React.ReactElement | null {
  const { count, selected } = useCandidates(chatId, messageId);
  const bodies = useReceivedStore(
    useShallow((state) =>
      Array.from(
        { length: count },
        (_, index) => state.byKey[responseKey(chatId, messageId, index)],
      ),
    ),
  );
  const [open, setOpen] = useState(false);
  if (bodies.every((body) => body === undefined)) return null;
  const entries = bodies.flatMap((body, index) =>
    body === undefined
      ? []
      : [
          {
            body,
            label: t('llm.sentRequest.candidate', {
              index: String(index + 1),
              time: new Date(body.at).toLocaleTimeString(),
            }),
          },
        ],
  );
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={t('llm.received.open')}
        title={t('llm.received.open')}
        onClick={() => setOpen(true)}
      >
        <FileDown className="size-3.5" aria-hidden />
      </button>
      <DialogFrame
        id="llm-received"
        size="lg"
        movable
        modal={false}
        embeddable={false}
        open={open}
        onOpenChange={setOpen}
        title={t('llm.received.title')}
      >
        {open ? (
          <ReceivedBodyView entries={entries} initial={bodies[selected]?.id ?? null} />
        ) : null}
      </DialogFrame>
    </>
  );
}

function ReceivedBodyView({
  entries,
  initial,
}: {
  readonly entries: readonly ReceivedEntry[];
  readonly initial: number | null;
}): React.ReactElement | null {
  const [chosen, setChosen] = useState<number | null>(null);
  const find = (id: number | null) => entries.find((entry) => entry.body.id === id);
  const shown = (find(chosen) ?? find(initial) ?? entries[0])?.body;
  if (shown === undefined) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-2 pt-2">
        <select
          className={CHOICE_CLASS}
          value={shown.id}
          aria-label={t('llm.sentRequest.choose')}
          onChange={(event) => setChosen(Number(event.target.value))}
        >
          {entries.map((entry) => (
            <option key={entry.body.id} value={entry.body.id}>
              {entry.label}
            </option>
          ))}
        </select>
        {shown.truncated ? (
          <span className="text-muted-foreground text-xs">{t('llm.received.truncated')}</span>
        ) : null}
        <CopyButton className="ml-auto" text={shown.text} label={t('llm.received.copy')} iconOnly />
      </div>
      <pre
        className="bg-muted/50 m-2 min-h-0 flex-1 overflow-auto rounded-md p-2 font-mono text-3xs
          whitespace-pre-wrap"
      >
        {shown.text}
      </pre>
    </div>
  );
}
