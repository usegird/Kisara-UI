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

// ─────────────────────────────
// `user` の発言とワークフローの呼び出しの欄の送った中身のアイコンと、LLM に送った要求の本文を出す
// ダイアログ。画面では画像の data URL を縮め、写すのは送った本文そのまま。
// ─────────────────────────────

const CHOICE_CLASS = cn(dialogControl({ kind: 'choice' }), 'min-w-0 py-1');

/** ダイアログで選べる 1 件 */
interface SentRequestEntry {
  readonly request: SentRequest;
  readonly label: string;
}

/** `user` の発言の送った中身のアイコンの props */
export interface MessageSentRequestButtonProps {
  readonly chatId: string;
  /** `user` の発言 */
  readonly messageId: string;
  readonly className: string;
}

/** 続く応答の id と候補の数・選んでいる候補。続くのが応答でなければ null */
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

/**
 * `user` の発言のアイコン。続く応答を受け取るために送った要求を候補ごとに出し、既定は選んでいる候補。
 * このページで送っていなければ出さない
 */
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

/** ワークフローの呼び出しの欄の送った中身のアイコンの props */
export interface CallSentRequestButtonProps {
  readonly chatId: string;
  /** 「ワークフローを実行」で作らせた呼び出しの id */
  readonly callId: string;
  readonly className: string;
}

/** ワークフローの呼び出しの欄のアイコン。作らせたときに送った要求を出す。このページで作らせていなければ出さない */
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

/** アイコンと、押すと開くダイアログ */
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
        // 長い JSON を中で送るので、高さの決まった大きさにする
        size="lg"
        movable
        modal={false}
        // 会話のタブには嵌める列が無いので、いつも自由移動で出す
        embeddable={false}
        open={open}
        onOpenChange={setOpen}
        title={t('llm.sentRequest.title')}
      >
        {/* 開くたびに既定の 1 件から始めたいので、中身は開いている間だけ置く */}
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
  /** 既定で出す要求の id。無ければ先頭 */
  readonly initial: number | null;
}): React.ReactElement | null {
  // 選んだ要求。無い（null）ときは既定
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
