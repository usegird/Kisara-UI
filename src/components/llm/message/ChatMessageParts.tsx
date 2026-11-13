import { cva } from 'class-variance-authority';

import { selectedCandidate } from '@/chat/edit';
import { splitComments } from '@/chat/macros';
import { summaryRange } from '@/chat/summary';
import { isNearInputLimit } from '@/chat/tokens';
import type { Candidate, ChatMessage } from '@/chat/types';
import { CitationList } from '@/components/llm/message/CitationList';
import { formatLlmFailure } from '@/components/llm/message/failure-text';
import { MarkdownText } from '@/components/llm/message/MarkdownText';
import { ReceivingIndicator } from '@/components/llm/message/ReceivingIndicator';
import type { useResponseStats } from '@/components/llm/message/response-figures';
import { SummarizeButton } from '@/components/llm/prompt/ChatSummaryField';
import { useInputLimit } from '@/hooks/chat/use-input-limit';
import { t } from '@/i18n';
import { entryKeyOf } from '@/lib/text-entry';
import { useChatStore } from '@/store/use-chat-store';

// ─────────────────────────────
// 会話の 1 件のメッセージの描く部分。本文・思考・終わりの印・要約を促す知らせ・編集の欄。
// 購読と表示の状態は ChatMessageItem が持つ。例外は最後の 1 件にだけ出す知らせの購読。
// ─────────────────────────────
// ─────────────────────────────

const bubble = cva('max-w-full min-w-0 text-sm leading-relaxed break-words', {
  variants: {
    role: {
      user: 'bg-muted rounded-2xl px-3 py-2',
      assistant: 'px-1 py-1',
    },
  },
});

/** 受け取り中の測った値 */
type LiveStats = ReturnType<typeof useResponseStats>;

/** 思考の本文の props */
export interface ReasoningProps {
  readonly candidate: Candidate | undefined;
  /** 画面に出す文の置き換え */
  readonly show: (text: string) => string;
}

/** 思考の本文。開閉の行にし、文字のまま出す。思考が無ければ出さない */
export function Reasoning({ candidate, show }: ReasoningProps): React.ReactElement | null {
  if (candidate === undefined || candidate.reasoning.length === 0) return null;
  return (
    <details className="text-muted-foreground max-w-full px-1 text-xs">
      <summary className="cursor-pointer select-none">{t('llm.chat.reasoning')}</summary>
      <p className="mt-1 border-l-2 pl-2 whitespace-pre-wrap">{show(candidate.reasoning)}</p>
    </details>
  );
}

/** 本文の props */
export interface MessageBodyProps {
  readonly message: ChatMessage;
  readonly candidate: Candidate | undefined;
  /** 画面に出す本文（置き換えを掛けたもの） */
  readonly content: string;
  readonly streaming: boolean;
  readonly stats: LiveStats;
  /** 直している本文。直していなければ null */
  readonly editing: string | null;
  readonly onEditChange: (value: string) => void;
  readonly onEditSave: () => void;
  readonly onEditCancel: () => void;
}

/**
 * 本文。プレイブックの指示は開閉の行、ほかは吹き出し（`user`）か枠の無い本文（`assistant`）で、
 * 直している間は編集の欄。直していなければ本文の下に出典を並べる
 */
export function MessageBody({
  message,
  candidate,
  content,
  streaming,
  stats,
  editing,
  onEditChange,
  onEditSave,
  onEditCancel,
}: MessageBodyProps): React.ReactElement {
  if (editing !== null) {
    return (
      <MessageEditor
        value={editing}
        onChange={onEditChange}
        onSave={onEditSave}
        onCancel={onEditCancel}
      />
    );
  }
  const citations =
    candidate?.citations === undefined ? null : <CitationList citations={candidate.citations} />;
  if (message.instruction?.direction === true) {
    return (
      <>
        <DirectionMark content={content} />
        {citations}
      </>
    );
  }
  return (
    <>
      <div className={bubble({ role: message.role })}>
        <SentImages images={candidate?.images} />
        {message.role === 'assistant' ? (
          <CommentedText text={content} streaming={streaming} />
        ) : (
          <MarkdownText text={content} />
        )}
        {/* 受け取り中は回る印と、送ってからの経過時間 */}
        {streaming ? (
          <div className="mt-1">
            <ReceivingIndicator
              since={stats?.sentAt}
              tooling={stats?.tooling === true}
              results={candidate?.citations?.length ?? 0}
            />
          </div>
        ) : null}
      </div>
      {citations}
    </>
  );
}

/**
 * 応答の本文。注記（本文の外の話）は書かれた位置に、思考と同じ畳んだ枠で出す
 */
function CommentedText({
  text,
  streaming,
}: {
  readonly text: string;
  readonly streaming: boolean;
}): React.ReactElement {
  const segments = splitComments(text, streaming);
  if (segments.every((segment) => segment.kind === 'text')) return <MarkdownText text={text} />;
  return (
    <div className="flex flex-col gap-2">
      {segments.map((segment) =>
        // 本文の頭からの位置を鍵にする（並べ替えず、受け取り中は後ろだけが伸びる）
        segment.kind === 'text' ? (
          <MarkdownText key={segment.start} text={segment.text} />
        ) : (
          <details key={segment.start} className="text-muted-foreground max-w-full text-xs">
            <summary className="cursor-pointer select-none">{t('llm.chat.comment')}</summary>
            <p className="mt-1 border-l-2 pl-2 whitespace-pre-wrap">{segment.text}</p>
          </details>
        ),
      )}
    </div>
  );
}

/** 送った画像。無ければ出さない */
function SentImages({
  images,
}: {
  readonly images: readonly string[] | undefined;
}): React.ReactElement | null {
  if (images === undefined || images.length === 0) return null;
  return (
    <ul className="mb-1 flex flex-wrap gap-1">
      {images.map((url, index) => (
        <li key={url}>
          <img
            src={url}
            alt={t('llm.chat.sentImage', { index: index + 1 })}
            className="max-h-40 max-w-full rounded-lg"
          />
        </li>
      ))}
    </ul>
  );
}

/** 上限に収めるため古い履歴を外して送った候補には、要約を促す（受け取り中は出さない） */
export function TrimmedNotice({
  chatId,
  trimmed,
}: {
  readonly chatId: string;
  /** 外した件数。外していなければ無し */
  readonly trimmed: number | undefined;
}): React.ReactElement | null {
  if (trimmed === undefined) return null;
  return (
    <div className="text-muted-foreground flex max-w-full flex-col items-start gap-0.5 px-1 text-xs">
      <p>{t('llm.summary.trimmed', { count: trimmed })}</p>
      <SummarizeButton chatId={chatId} />
    </div>
  );
}

/**
 * 最後の応答の使った数が送れる上限に近ければ、外す前に要約を促す。縮める発言が無ければ出さない。
 * 上限の購読はこの部品だけに置く（最後の 1 件のほかのメッセージに購読を足さない）
 */
export function NearLimitNotice({
  chatId,
  candidate,
}: {
  readonly chatId: string;
  readonly candidate: Candidate | undefined;
}): React.ReactElement | null {
  const { limit } = useInputLimit();
  const summarizable = useChatStore((store) => {
    const chat = store.chats[chatId];
    return chat !== undefined && summaryRange(chat) !== null;
  });
  if (!summarizable || !isNearInputLimit(candidate, limit)) return null;
  return (
    <div className="text-muted-foreground flex max-w-full flex-col items-start gap-0.5 px-1 text-xs">
      <p>{t('llm.summary.nearLimit')}</p>
      <SummarizeButton chatId={chatId} />
    </div>
  );
}

/**
 * プレイブックの指示の発言。吹き出しにせず、思考と同じ開閉の行にする。本文は画面に出す置き換えを
 * 掛けたもの（持つ本文は置き換える前のまま）
 */
function DirectionMark({ content }: { readonly content: string }): React.ReactElement {
  return (
    <details className="text-muted-foreground max-w-full px-1 text-xs">
      <summary className="cursor-pointer text-right select-none">
        {t('llm.playbook.directionMark')}
      </summary>
      <p className="mt-1 border-r-2 pr-2 text-left whitespace-pre-wrap">{content}</p>
    </details>
  );
}

/** 中断・失敗したの印。失敗には原因と、最後のメッセージならもう一度のボタン */
export function MessageEnd({
  message,
  canRetry,
  onRetry,
}: {
  readonly message: ChatMessage;
  readonly canRetry: boolean;
  readonly onRetry: () => void;
}): React.ReactElement | null {
  const end = selectedCandidate(message)?.end;
  if (end?.kind === 'stopped') {
    return <p className="text-muted-foreground px-1 text-xs">{t('llm.chat.stopped')}</p>;
  }
  if (end?.kind !== 'failed') return null;
  return (
    <div
      role="alert"
      className="border-destructive/40 bg-destructive/10 text-destructive flex max-w-full flex-wrap
        items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
    >
      <span className="min-w-0 flex-1">{formatLlmFailure(end.failure)}</span>
      {canRetry ? (
        <button
          type="button"
          className="border-destructive/40 hover:bg-destructive/15 rounded border px-2 py-0.5"
          onClick={onRetry}
        >
          {t('llm.chat.retry')}
        </button>
      ) : null}
    </div>
  );
}

function MessageEditor({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}): React.ReactElement {
  const onEditorChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void =>
    onChange(event.target.value);
  const onEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const key = entryKeyOf(event);
    if (key === 'commit' && !event.shiftKey) {
      event.preventDefault();
      onSave();
    } else if (key === 'cancel') {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    <textarea
      autoFocus
      className="border-input bg-background field-sizing-content max-h-96 min-h-16 w-full rounded-md
        border px-2 py-1.5 text-sm"
      value={value}
      aria-label={t('llm.chat.editField')}
      title={t('llm.chat.editHint')}
      onChange={onEditorChange}
      onKeyDown={onEditorKeyDown}
    />
  );
}
