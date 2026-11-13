import { cva } from 'class-variance-authority';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { hasMessagesAfter, isStreaming, selectedCandidate } from '@/chat/edit';
import { formatChangeResult } from '@/components/llm/chat-list/library-text';
import { LlmBudgetDialog } from '@/components/llm/dialogs/LlmBudgetDialog';
import { LlmConnectDialog } from '@/components/llm/dialogs/LlmConnectDialog';
import { ChatMessageItem } from '@/components/llm/message/ChatMessageItem';
import { isNearBottom } from '@/components/llm/message/log-scroll';
import { useChatViewerSync } from '@/components/llm/workspace/chat-viewer';
import { ChatComposer } from '@/components/llm/workspace/ChatComposer';
import { ChatImageLayout } from '@/components/llm/workspace/ChatImageLayout';
import { ChatPendingNotice } from '@/components/llm/workspace/ChatSaveNotice';
import { useSendState } from '@/components/llm/workspace/use-send-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { toastError } from '@/components/ui/toast-manager';
import { useLlmTarget } from '@/hooks/chat/use-llm-target';
import { useMessageWindow } from '@/hooks/chat/use-message-window';
import { useWorkflowToolsLoad } from '@/hooks/chat/use-workflow-tools-load';
import { t } from '@/i18n';
import { forkChat } from '@/store/chat/chat-library';
import { useChatStore } from '@/store/use-chat-store';
import { useLlmConnectDialogStore } from '@/store/use-llm-connect-dialog-store';
import { useLlmProfilesStore, wasAutoChecked } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 会話のタブの本体。列に分けず、会話のログと入力欄を縦に積む。アバターの置き場は ChatImageLayout が持つ。
// ─────────────────────────────

// 会話が始まる前は、上（ログ。中身は下に寄せる）と下（空き）を同じ高さにして間に入力欄を挟み、縦の中央に置く。
// ログは大きさの基準（container）にする（ワークフローの結果の画像の高さの上限をログの高さから決めるため）
// 左右に置いたアバターの幅だけ、内側に余白を取る（ChatImageLayout。スクロールバーは外枠の端のまま）
const logArea = cva('min-h-0 flex-1 pr-(--chat-pad-r) pl-(--chat-pad-l)', {
  variants: {
    empty: {
      true: 'flex flex-col justify-end overflow-hidden',
      false: 'overflow-y-auto [container-type:size]',
    },
  },
});
const EMPTY_TEXT = 'text-muted-foreground pb-2 text-center text-sm';

/** 会話のタブの本体の props */
export interface ChatWorkspaceProps {
  readonly chatId: string;
}

/**
 * 会話の画面。つないでいないときも画面はそのまま出し、接続の案内はダイアログで重ねる。中身をまだ持って
 * いない会話（ComfyUI につないでいない・ほかのブラウザのタブで開いている）は、その理由を出す
 */
export function ChatWorkspace({ chatId }: ChatWorkspaceProps): React.ReactElement {
  // 呼べるワークフローの定義を、会話のタブを出したときに読む
  useWorkflowToolsLoad();
  // 会話の画像で開いたビューワーの並びを、画像が増えるたびに取り直す
  useChatViewerSync(chatId);
  const ready = !useOffline();
  const loaded = useChatStore((state) => state.chats[chatId] !== undefined);
  const pending = useChatStore((state) => state.pending[chatId]);
  // 接続の案内を出すか。つないでいないと決まったら、まだ一度も閉じていなければ自動で出す。
  // 再接続のボタンで頼まれたら、つないでいても出す（どちらもページ全体で持つ。会話を替えても同じ）。
  // 自動で出したものも頼まれたものと同じにし、つながっても閉じない（閉じるのは ×・Esc・会話を始める）
  const requested = useLlmConnectDialogStore((state) => state.requested);
  const dismissed = useLlmConnectDialogStore((state) => state.dismissed);
  // つないでいないという接続の状態（外のもの）を、ダイアログを出す頼みに写す
  useEffect(() => {
    if (!ready && !dismissed) useLlmConnectDialogStore.getState().open();
  }, [ready, dismissed]);
  const onConnectClose = (): void => useLlmConnectDialogStore.getState().close();
  return (
    <ErrorBoundary label={t('llm.chat.boundary')} resetKey={chatId}>
      {!loaded ? (
        <ChatPendingNotice pending={pending} />
      ) : (
        <>
          {/* 会話の画面はつないでいなくてもそのまま出し、接続の案内はダイアログで重ねる */}
          <ChatBody chatId={chatId} />
          <LlmConnectDialog open={requested} onClose={onConnectClose} />
        </>
      )}
      {/* 要求の量が閾値を超えたら、続けるかを確かめる */}
      <LlmBudgetDialog />
    </ErrorBoundary>
  );
}

/**
 * つないでいないと決まったか。接続の設定（ベース URL つき）が無い・接続に失敗した・切断したとき。
 * つながっている・つないでいる途中・まだ自動で試していない（これから試す）間は false
 * （開いた直後に接続の案内のダイアログを出してすぐ閉じない）。モデルは入力欄の横で選ぶので問わない
 */
function useOffline(): boolean {
  const { profileId } = useLlmTarget();
  const offline = useLlmProfilesStore((state) => {
    const profile = state.profiles.find((item) => item.id === profileId);
    if (profile === undefined || profile.baseUrl.trim().length === 0) return true;
    const check = state.checks[profile.id];
    if (check?.kind === 'ok' || check?.kind === 'checking') return false;
    return check !== undefined || wasAutoChecked(profile.id);
  });
  // ページを開いてから 1 回だけ自動でつなぐ（外の通信との同期）
  useLayoutEffect(() => {
    if (profileId !== null) useLlmProfilesStore.getState().autoCheck(profileId);
  }, [profileId]);
  return offline;
}

function useSendable(chatId: string): boolean {
  return useSendState(chatId) === 'ready';
}

function ChatBody({ chatId }: { readonly chatId: string }): React.ReactElement {
  const ids = useChatStore(
    useShallow((state) => state.chats[chatId]?.messages.map((message) => message.id) ?? []),
  );
  const sendable = useSendable(chatId);
  // 末尾の本文の長さ。受け取るたびに増えるので、下へ送るきっかけに使う
  const tail = useChatStore((state) => {
    const last = state.chats[chatId]?.messages.at(-1);
    const candidate = last === undefined ? undefined : selectedCandidate(last);
    return (candidate?.content.length ?? 0) + (candidate?.reasoning.length ?? 0);
  });
  // ロールバックは受け取り中は受け付けない（始まりと終わりでだけ変わる）
  const streaming = useChatStore((state) => {
    const chat = state.chats[chatId];
    return chat !== undefined && isStreaming(chat);
  });
  const [confirmFrom, setConfirmFrom] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  // 両端の目印の見張りの基準（ログの欄）。置かれたら見張り直すので state にも持つ
  const [logRoot, setLogRoot] = useState<HTMLDivElement | null>(null);
  const attachLog = (element: HTMLDivElement | null): void => {
    log.current = element;
    setLogRoot(element);
  };
  const atBottom = useRef(true);
  // 一度に描く発言の範囲。会話を替えたら新しい方からやり直す
  const logWindow = useSettingsStore((state) => state.chatLogWindow);
  const { start, end, attachTopMark, attachBottomMark, attachList } = useMessageWindow(
    ids.length,
    { size: logWindow },
    chatId,
    logRoot,
  );
  const shown = start === 0 && end === ids.length ? ids : ids.slice(start, end);

  // 末尾を見ているときだけ追いかける（画面の送りという外の仕組みとの同期）
  useEffect(() => {
    const element = log.current;
    if (element !== null && atBottom.current) element.scrollTop = element.scrollHeight;
  }, [tail, ids.length]);

  // 後ろに会話があるときだけ、捨ててよいかを確かめる
  const rollback = (messageId: string): void => {
    const chat = useChatStore.getState().chats[chatId];
    if (chat !== undefined && hasMessagesAfter(chat, messageId)) setConfirmFrom(messageId);
    else useChatStore.getState().rollback(chatId, messageId);
  };

  // 元の会話は変えないので確かめない。写せなかったときだけ知らせる
  const fork = (messageId: string): void => {
    void forkChat(chatId, messageId).then((result) => {
      const text = formatChangeResult(result);
      if (text !== null) toastError(text);
    });
  };

  const onLogScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    atBottom.current = isNearBottom(event.currentTarget);
  };
  const onRollbackConfirm = (): void => {
    if (confirmFrom !== null) useChatStore.getState().rollback(chatId, confirmFrom);
    setConfirmFrom(null);
  };
  const onRollbackCancel = (): void => setConfirmFrom(null);

  return (
    <>
      <ChatImageLayout
        chatId={chatId}
        log={
          <div
            ref={attachLog}
            className={logArea({ empty: ids.length === 0 })}
            role="log"
            aria-label={t('llm.chat.log')}
            // 受け取り中は読み上げを待たせ、書き終えてから 1 回読ませる（1 字ずつ読ませない）
            aria-busy={streaming}
            onScroll={onLogScroll}
          >
            {/* 両端の目印。見えたらその向きへ足す。端まで描いていても、反対の端が
                見えているかの判定に置く。並びの間隔に入れないよう並びの外に高さ 0 で置く */}
            <div ref={attachTopMark} aria-hidden />
            {/* 入力欄の上の余白は、ここの下の余白と入力欄の上の余白の合計（前の 8 割） */}
            <div
              ref={attachList}
              className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-2 pb-[19px]"
            >
              {ids.length === 0 ? (
                // 下の文との間は、入力欄の上の余白（29px）と揃える（並びの間隔 16px に 13px を足す）
                <h2 className="mb-[13px] text-center text-4xl font-semibold">
                  {t('llm.chat.hello')}
                </h2>
              ) : null}
              {ids.length === 0 ? <p className={EMPTY_TEXT}>{t('llm.chat.empty')}</p> : null}
              {shown.map((id, index) => (
                <ChatMessageItem
                  key={id}
                  chatId={chatId}
                  messageId={id}
                  last={start + index === ids.length - 1}
                  canGenerate={sendable}
                  canRollback={!streaming}
                  onRollback={rollback}
                  onFork={fork}
                />
              ))}
            </div>
            {/* 末尾の目印（先頭の目印と同じ） */}
            <div ref={attachBottomMark} aria-hidden />
          </div>
        }
        composer={<ChatComposer chatId={chatId} />}
        after={ids.length === 0 ? <div className="flex-1" aria-hidden /> : null}
      />

      <ConfirmDialog
        open={confirmFrom !== null}
        title={t('llm.chat.confirmRollback.title')}
        description={t('llm.chat.confirmRollback.description')}
        confirmLabel={t('llm.chat.rollback')}
        onConfirm={onRollbackConfirm}
        onCancel={onRollbackCancel}
      />
    </>
  );
}
