import { FileJson } from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { shortenDataUrl } from '@/components/llm/message/data-url-text';
import { CopyButton } from '@/components/ui/copy-button';
import { DialogFrame } from '@/components/ui/dialog';
import { dialogControl } from '@/components/ui/dialog-control';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/use-chat-store';
import { responseKey } from '@/store/use-response-stats-store';
import {
  callRequestKey,
  useSentRequestsStore,
  type SentRequest,
} from '@/store/use-sent-requests-store';

const CHOICE_CLASS = cn(dialogControl({ kind: 'choice' }), 'min-w-0 py-1');

interface SentRequestEntry {
  readonly request: SentRequest;
  readonly label: string;
}

export interface MessageSentRequestButtonProps {
  readonly chatId: string;
  readonly messageId: string;
  readonly className: string;
}

function useReply(
  chatId: string,
  messageId: string,
): { readonly id: string; readonly count: number; readonly selected: number } | null {
  return useChatStore(
    useShallow((state) => {
      const messages = state.chats[chatId]?.messages ?? [];
      const next = messages[messages.findIndex((item) => item.id === messageId) + 1];
      return next?.role === 'assistant'
        ? { id: next.id, count: next.candidates.length, selected: next.selected }
        : null;
    }),
  );
}

export function MessageSentRequestButton({
  chatId,
  messageId,
  className,
}: MessageSentRequestButtonProps): React.ReactElement | null {
  const reply = useReply(chatId, messageId);
  const requests = useSentRequestsStore(
    useShallow((state) =>
      reply === null
        ? []
        : Array.from(
            { length: reply.count },
            (_, index) => state.byKey[responseKey(chatId, reply.id, index)],
          ),
    ),
  );
  if (reply === null || requests.every((request) => request === undefined)) return null;
  const entries = requests.flatMap((request, index) =>
    request === undefined
      ? []
      : [
          {
            request,
            label: t('llm.sentRequest.candidate', {
              index: String(index + 1),
              time: new Date(request.at).toLocaleTimeString(),
            }),
          },
        ],
  );
  return (
    <SentRequestOpener
      className={className}
      entries={entries}
      initial={requests[reply.selected]?.id ?? null}
    />
  );
}

export interface CallSentRequestButtonProps {
  readonly chatId: string;
  readonly callId: string;
  readonly className: string;
}

export function CallSentRequestButton({
  chatId,
  callId,
  className,
}: CallSentRequestButtonProps): React.ReactElement | null {
  const request = useSentRequestsStore((state) => state.byKey[callRequestKey(chatId, callId)]);
  if (request === undefined) return null;
  const entries = [{ request, label: new Date(request.at).toLocaleTimeString() }];
  return <SentRequestOpener className={className} entries={entries} initial={null} />;
}

function SentRequestOpener({
  className,
  entries,
  initial,
}: {
  readonly className: string;
  readonly entries: readonly SentRequestEntry[];
  readonly initial: number | null;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={t('llm.sentRequest.open')}
        title={t('llm.sentRequest.open')}
        onClick={() => setOpen(true)}
      >
        <FileJson className="size-3.5" aria-hidden />
      </button>
      <DialogFrame
        id="llm-sent-request"
        size="lg"
        movable
        modal={false}
        embeddable={false}
        open={open}
        onOpenChange={setOpen}
        title={t('llm.sentRequest.title')}
      >
        {open ? <SentRequestBody entries={entries} initial={initial} /> : null}
      </DialogFrame>
    </>
  );
}

function SentRequestBody({
  entries,
  initial,
}: {
  readonly entries: readonly SentRequestEntry[];
  readonly initial: number | null;
}): React.ReactElement | null {
  const [chosen, setChosen] = useState<number | null>(null);
  const find = (id: number | null) => entries.find((entry) => entry.request.id === id);
  const shown = (find(chosen) ?? find(initial) ?? entries[0])?.request;
  if (shown === undefined) return null;
  const pretty = JSON.stringify(JSON.parse(shown.body), shortenDataUrl, 2);
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
            <option key={entry.request.id} value={entry.request.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <CopyButton
          className="ml-auto"
          text={shown.body}
          label={t('llm.sentRequest.copy')}
          iconOnly
        />
      </div>
      <pre
        className="bg-muted/50 m-2 min-h-0 flex-1 overflow-auto rounded-md p-2 font-mono text-3xs
          whitespace-pre-wrap"
      >
        {pretty}
      </pre>
    </div>
  );
}
