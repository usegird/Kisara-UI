import { GitFork, Pencil, PenLine, RefreshCw, Trash2, Undo2 } from 'lucide-react';

import { canWriteReply } from '@/chat/tool-calls';
import type { Candidate, ChatMessage } from '@/chat/types';
import { MessageReceivedButton } from '@/components/llm/message/ReceivedDialog';
import { ResponseStatsButton } from '@/components/llm/message/ResponseStats';
import { MessageSentRequestButton } from '@/components/llm/message/SentRequestDialog';
import { StepSwitch } from '@/components/llm/message/StepSwitch';
import { WorkflowRunMenu } from '@/components/llm/message/ToolCallCard';
import { CopyButton } from '@/components/ui/copy-button';
import { t } from '@/i18n';
import type { GenerateFailure } from '@/store/run/workflow-tool-run';
import { useChatStore } from '@/store/use-chat-store';

// ─────────────────────────────
// 会話の 1 件のメッセージの操作。アイコンの行（候補の切り替え・写す・戻す・送った中身・直す・
// 生成し直す・フォーク・ワークフロー・消す）と、本文を書かせるボタン。押したことはメッセージの部品へ返す。
// ─────────────────────────────

const ICON_BUTTON = `text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-6
  items-center justify-center rounded disabled:pointer-events-none disabled:opacity-40`;

/** 操作のアイコンの行の props */
export interface MessageActionsProps {
  readonly chatId: string;
  readonly message: ChatMessage;
  /** 写す本文 */
  readonly content: string;
  readonly last: boolean;
  readonly canGenerate: boolean;
  readonly canRollback: boolean;
  /** 応答の情報があるか（アイコンを出す） */
  readonly hasStats: boolean;
  readonly statsOpen: boolean;
  /** 選んだワークフローの呼び出しを作らせている間 */
  readonly generating: boolean;
  readonly onStep: (delta: number) => void;
  readonly onRollback: () => void;
  readonly onStatsToggle: () => void;
  readonly onEdit: () => void;
  readonly onFork: () => void;
  readonly onGenerateStart: (name: string) => void;
  readonly onGenerateEnd: (failure: GenerateFailure | null) => void;
  readonly onDelete: () => void;
}

/** 操作のアイコンの行。焦点か指を置いたときに出す */
export function MessageActions({
  chatId,
  message,
  content,
  last,
  canGenerate,
  canRollback,
  hasStats,
  statsOpen,
  generating,
  onStep,
  onRollback,
  onStatsToggle,
  onEdit,
  onFork,
  onGenerateStart,
  onGenerateEnd,
  onDelete,
}: MessageActionsProps): React.ReactElement {
  const user = message.role === 'user';
  return (
    <div
      className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within/message:opacity-100
            group-hover/message:opacity-100"
    >
      {message.candidates.length > 1 ? (
        <StepSwitch index={message.selected} count={message.candidates.length} onStep={onStep} />
      ) : null}
      <CopyButton text={content} label={t('llm.chat.copy')} iconOnly frameless />
      {/* 生成はせずに会話をここの手前まで戻し、本文を入力欄へ写す */}
      {user ? (
        <button
          type="button"
          className={ICON_BUTTON}
          disabled={!canRollback}
          aria-label={t('llm.chat.rollback')}
          title={t('llm.chat.rollback')}
          onClick={onRollback}
        >
          <Undo2 className="size-3.5" aria-hidden />
        </button>
      ) : null}
      {user ? (
        <MessageSentRequestButton chatId={chatId} messageId={message.id} className={ICON_BUTTON} />
      ) : (
        <MessageReceivedButton chatId={chatId} messageId={message.id} className={ICON_BUTTON} />
      )}
      {hasStats ? (
        <ResponseStatsButton open={statsOpen} className={ICON_BUTTON} onToggle={onStatsToggle} />
      ) : null}
      <button
        type="button"
        className={ICON_BUTTON}
        aria-label={t('llm.chat.edit')}
        title={t('llm.chat.edit')}
        onClick={onEdit}
      >
        <Pencil className="size-3.5" aria-hidden />
      </button>
      {!user && last ? <RegenerateButton chatId={chatId} disabled={!canGenerate} /> : null}
      {/* 元の会話は変えず、この応答までの写しを新しいタブで開く */}
      {user ? null : (
        <button
          type="button"
          className={ICON_BUTTON}
          disabled={!canRollback}
          aria-label={t('llm.chat.fork')}
          title={t('llm.chat.fork')}
          onClick={onFork}
        >
          <GitFork className="size-3.5" aria-hidden />
        </button>
      )}
      {user ? null : (
        <WorkflowRunMenu
          chatId={chatId}
          messageId={message.id}
          className={ICON_BUTTON}
          disabled={!canGenerate || generating}
          onStart={onGenerateStart}
          onEnd={onGenerateEnd}
        />
      )}
      <button
        type="button"
        className={ICON_BUTTON}
        aria-label={t('llm.chat.delete')}
        title={t('llm.chat.delete')}
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** 本文を書かせるボタンの props */
export interface WriteReplyButtonProps {
  readonly message: ChatMessage;
  readonly candidate: Candidate | undefined;
  readonly last: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
}

/** 呼び出しだけを返した最後の応答に、同じ候補で本文を書かせる。ほかの発言には出さない */
export function WriteReplyButton({
  message,
  candidate,
  last,
  disabled,
  onClick,
}: WriteReplyButtonProps): React.ReactElement | null {
  if (message.role !== 'assistant' || !last || !canWriteReply(candidate)) return null;
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center
              gap-1 rounded px-1.5 py-0.5 text-xs disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
      title={t('llm.tool.writeReplyHint')}
      onClick={onClick}
    >
      <PenLine className="size-3.5" aria-hidden />
      {t('llm.tool.writeReply')}
    </button>
  );
}

/**
 * 生成し直す。入力欄に文があれば、その文を指示にして今の候補を作り直す。どちらになるかを
 * 名前で示す
 */
function RegenerateButton({
  chatId,
  disabled,
}: {
  readonly chatId: string;
  readonly disabled: boolean;
}): React.ReactElement {
  const withDraft = useChatStore((state) => (state.drafts[chatId] ?? '').trim().length > 0);
  const label = withDraft ? t('llm.chat.regenerateWithDraft') : t('llm.chat.regenerate');
  const onRegenerateClick = (): void => useChatStore.getState().regenerate(chatId);
  return (
    <button
      type="button"
      className={ICON_BUTTON}
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onRegenerateClick}
    >
      <RefreshCw className="size-3.5" aria-hidden />
    </button>
  );
}
