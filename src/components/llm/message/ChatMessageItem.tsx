import { cva } from 'class-variance-authority';
import { useState } from 'react';

import { chatNameSources } from '@/chat/chat-sources';
import { selectedCandidate } from '@/chat/edit';
import { applyMacros } from '@/chat/macros';
import type { Candidate, ChatMessage } from '@/chat/types';
import { MessageActions, WriteReplyButton } from '@/components/llm/message/ChatMessageActions';
import {
  MessageBody,
  MessageEnd,
  NearLimitNotice,
  Reasoning,
  TrimmedNotice,
} from '@/components/llm/message/ChatMessageParts';
import {
  buildResponseFigures,
  liveTiming,
  useResponseStats,
} from '@/components/llm/message/response-figures';
import { ResponseStatsPanel } from '@/components/llm/message/ResponseStats';
import type { ArgumentEdits, ShownRun, ShownRuns } from '@/components/llm/message/tool-call-runs';
import { ToolCallList } from '@/components/llm/message/ToolCallCard';
import { ToolCallImages } from '@/components/llm/message/ToolCallImages';
import { ToolCallGenerateRow, type GenerateRow } from '@/components/llm/message/ToolCallStatus';
import { RenderProbe } from '@/components/ui/render-probe';
import { t } from '@/i18n';
import type { GenerateFailure } from '@/store/run/workflow-tool-run';
import { useChatStore } from '@/store/use-chat-store';

// ─────────────────────────────
// 会話の 1 件のメッセージ。購読はこのメッセージだけにする（受け取り中の 1 件だけが描き直される）。
// 編集中の本文はこの部品だけが持つ。
// ─────────────────────────────

const row = cva('group/message flex flex-col gap-1 rounded-md outline-none focus-visible:ring-2', {
  variants: { role: { user: 'items-end', assistant: 'items-start' } },
});

/** 会話の 1 件のメッセージの props */
export interface ChatMessageItemProps {
  readonly chatId: string;
  readonly messageId: string;
  /** 最後のメッセージか（生成し直しは最後の `assistant` だけ） */
  readonly last: boolean;
  /** 送れるか（接続の設定とモデルがあり、受け取り中でない） */
  readonly canGenerate: boolean;
  /** ロールバックできるか（会話が受け取り中でない） */
  readonly canRollback: boolean;
  readonly onRollback: (messageId: string) => void;
  /** この応答までの写しを新しいタブで開く（フォーク。押せるのはロールバックと同じとき） */
  readonly onFork: (messageId: string) => void;
}

/**
 * `user` は右寄せの吹き出し、`assistant` は枠の無い本文で描き、操作は焦点か指を置いたときに出す。
 * 本文は Markdown、思考の本文と編集中の欄は文字のまま
 */
export function ChatMessageItem({
  chatId,
  messageId,
  last,
  canGenerate,
  canRollback,
  onRollback,
  onFork,
}: ChatMessageItemProps): React.ReactElement | null {
  const message = useChatStore((state) =>
    state.chats[chatId]?.messages.find((item) => item.id === messageId),
  );
  const [editing, setEditing] = useState<string | null>(null);
  // 応答の情報を開いているか
  const [statsOpen, setStatsOpen] = useState(false);
  // ワークフローの呼び出しの、表示している実行と直した引数（保存しない）
  const [shownRuns, setShownRuns] = useState<ShownRuns>(new Map());
  const [argumentEdits, setArgumentEdits] = useState<ArgumentEdits>(new Map());
  // 選んだワークフローの呼び出しを LLM に作らせている行・作らせられなかった行（保存しない）
  const [generateRow, setGenerateRow] = useState<GenerateRow | null>(null);
  const generating = generateRow?.kind === 'generating';
  const stats = useResponseStats(chatId, messageId, message?.selected ?? 0);
  // 画面に出す文の置き換え（送るときと同じ置き換えに、戻すの行を値へ戻すのを足す）
  const character = useChatStore((state) => state.chats[chatId]?.character ?? null);
  const persona = useChatStore((state) => state.chats[chatId]?.persona ?? null);
  if (message === undefined) return null;

  const names = chatNameSources(character, persona);
  const show = (text: string): string => applyMacros(text, names, 'show');
  const candidate = selectedCandidate(message);
  const content = show(contentOf(candidate));
  const streaming = isStreamingCandidate(candidate);
  const toolCalls = candidate?.toolCalls;
  // 受け取り終えた候補は残った記録、受け取り中は測っている途中の値
  const figures = figuresOf(message, candidate, stats);
  const roleName = t(message.role === 'user' ? 'llm.chat.user' : 'llm.chat.assistant');
  const store = useChatStore.getState();

  const step = (delta: number): void =>
    store.selectCandidate(chatId, message.id, message.selected + delta);
  const onArticleKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget || message.candidates.length < 2) return;
    if (event.key === 'ArrowLeft') step(-1);
    else if (event.key === 'ArrowRight') step(1);
    else return;
    event.preventDefault();
  };
  const onEditSave = (): void => {
    if (editing === null) return;
    store.updateMessage(chatId, message.id, editing);
    setEditing(null);
  };
  const onEditCancel = (): void => setEditing(null);
  const onRetry = (): void => store.retry(chatId);
  const onRollbackClick = (): void => onRollback(message.id);
  const onStatsToggle = (): void => setStatsOpen(!statsOpen);
  const onEditClick = (): void => setEditing(candidate?.content ?? '');
  const onForkClick = (): void => onFork(message.id);
  const onGenerateStart = (name: string): void => setGenerateRow({ kind: 'generating', name });
  // 作らせた呼び出しは呼び出しの並びに入るので行を外し、作らせられなければ失敗の行にする
  const onGenerateEnd = (result: GenerateFailure | null): void => {
    const name = generateRow?.kind === 'generating' ? generateRow.name : '';
    setGenerateRow(
      result === null || result.failure.kind === 'stopped'
        ? null
        : { kind: 'failed', name, failure: result.failure, attempt: result.attempt },
    );
  };
  const onDeleteClick = (): void => store.removeMessage(chatId, message.id);
  const onShowRun = (callId: string, shown: ShownRun): void =>
    setShownRuns(new Map(shownRuns).set(callId, shown));
  const onArgumentEdit = (callId: string, name: string, value: string): void =>
    setArgumentEdits(
      new Map(argumentEdits).set(callId, new Map(argumentEdits.get(callId)).set(name, value)),
    );
  const onRerun = (callId: string, shown: ShownRun): void => {
    // 受け取るまで今の画像を出したままにする（受け取ったら最後の実行に切り替わる）
    setShownRuns(new Map(shownRuns).set(callId, shown));
    const edits = new Map(argumentEdits);
    edits.delete(callId);
    setArgumentEdits(edits);
  };
  const onWriteReply = (): void => store.writeReply(chatId);

  return (
    // 受け取り中の 1 件だけが描き直されることを数える
    <RenderProbe id="ChatMessage">
      <article
        className={row({ role: message.role })}
        aria-label={t('llm.chat.message', { role: roleName })}
        tabIndex={0}
        onKeyDown={onArticleKeyDown}
      >
        <Reasoning candidate={candidate} show={show} />

        <MessageBody
          message={message}
          candidate={candidate}
          content={content}
          streaming={streaming}
          stats={stats}
          editing={editing}
          onEditChange={setEditing}
          onEditSave={onEditSave}
          onEditCancel={onEditCancel}
        />

        <MessageEnd message={message} onRetry={onRetry} canRetry={last && canGenerate} />

        <TrimmedNotice chatId={chatId} trimmed={trimmedOf(candidate, streaming)} />

        {isNearLimitShown(message, last, streaming, candidate) ? (
          <NearLimitNotice chatId={chatId} candidate={candidate} />
        ) : null}

        {isActionsShown(editing, streaming) ? (
          <MessageActions
            chatId={chatId}
            message={message}
            content={content}
            last={last}
            canGenerate={canGenerate}
            canRollback={canRollback}
            hasStats={figures.length > 0}
            statsOpen={statsOpen}
            generating={generating}
            onStep={step}
            onRollback={onRollbackClick}
            onStatsToggle={onStatsToggle}
            onEdit={onEditClick}
            onFork={onForkClick}
            onGenerateStart={onGenerateStart}
            onGenerateEnd={onGenerateEnd}
            onDelete={onDeleteClick}
          />
        ) : null}

        {isStatsShown(statsOpen, figures, streaming) ? (
          <ResponseStatsPanel figures={figures} />
        ) : null}

        {/* 操作のアイコンの行の下に、画像の欄、呼び出しの状態の行の順 */}
        <ToolCallImages
          chatId={chatId}
          messageId={message.id}
          calls={toolCalls ?? []}
          shown={shownRuns}
          onShow={onShowRun}
        />
        {toolCalls === undefined ? null : (
          <ToolCallList
            chatId={chatId}
            messageId={message.id}
            calls={toolCalls}
            shown={shownRuns}
            edits={argumentEdits}
            onEdit={onArgumentEdit}
            onRerun={onRerun}
          />
        )}
        {/* 「ワークフローを実行」で作らせている行は、受け取り中の呼び出しと同じく並びの後ろに出す */}
        <ToolCallGenerateRow chatId={chatId} row={generateRow} />
        <WriteReplyButton
          message={message}
          candidate={candidate}
          last={last}
          disabled={!canGenerate}
          onClick={onWriteReply}
        />
      </article>
    </RenderProbe>
  );
}

/** 候補の本文。候補が無ければ空 */
function contentOf(candidate: Candidate | undefined): string {
  return candidate?.content ?? '';
}

function isStreamingCandidate(candidate: Candidate | undefined): boolean {
  return candidate?.end.kind === 'streaming';
}

/** 応答の情報の数値。`assistant` の発言だけ。受け取り終えた候補は残った記録で、受け取り中は測った値 */
function figuresOf(
  message: ChatMessage,
  candidate: Candidate | undefined,
  stats: ReturnType<typeof useResponseStats>,
): ReturnType<typeof buildResponseFigures> {
  if (message.role !== 'assistant') return [];
  const timing = candidate?.timing ?? liveTiming(stats, candidate?.usage);
  return buildResponseFigures(candidate?.usage, timing, candidate?.billing);
}

/** 古い履歴を外して送った件数。受け取り中は出さない */
function trimmedOf(candidate: Candidate | undefined, streaming: boolean): number | undefined {
  return streaming ? undefined : candidate?.trimmed;
}

/**
 * 上限に近い知らせを出し得るか。最後の `assistant` で、受け取り中でなく、外した知らせが無いとき
 */
function isNearLimitShown(
  message: ChatMessage,
  last: boolean,
  streaming: boolean,
  candidate: Candidate | undefined,
): boolean {
  return message.role === 'assistant' && last && !streaming && candidate?.trimmed === undefined;
}

/** 操作のアイコンの行を出すか（直している間・受け取り中は出さない） */
function isActionsShown(editing: string | null, streaming: boolean): boolean {
  return editing === null && !streaming;
}

/** 応答の情報の中身を出すか（開いていて、数値があり、受け取り終えた） */
function isStatsShown(
  statsOpen: boolean,
  figures: readonly unknown[],
  streaming: boolean,
): boolean {
  return statsOpen && figures.length > 0 && !streaming;
}
