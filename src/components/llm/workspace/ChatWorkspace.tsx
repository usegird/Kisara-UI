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

const logArea = cva('min-h-0 flex-1 pr-(--chat-pad-r) pl-(--chat-pad-l)', {
  variants: {
    empty: {
      true: 'flex flex-col justify-end overflow-hidden',
      false: 'overflow-y-auto [container-type:size]',
    },
  },
});
const EMPTY_TEXT = 'text-muted-foreground pb-2 text-center text-sm';

export interface ChatWorkspaceProps {
  readonly chatId: string;
}

export function ChatWorkspace({ chatId }: ChatWorkspaceProps): React.ReactElement {
  useWorkflowToolsLoad();
  useChatViewerSync(chatId);
  const ready = !useOffline();
  const loaded = useChatStore((state) => state.chats[chatId] !== undefined);
  const pending = useChatStore((state) => state.pending[chatId]);
  const requested = useLlmConnectDialogStore((state) => state.requested);
  const dismissed = useLlmConnectDialogStore((state) => state.dismissed);
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
          <ChatBody chatId={chatId} />
          <LlmConnectDialog open={requested} onClose={onConnectClose} />
        </>
      )}
      <LlmBudgetDialog />
    </ErrorBoundary>
  );
}

function useOffline(): boolean {
  const { profileId } = useLlmTarget();
  const offline = useLlmProfilesStore((state) => {
    const profile = state.profiles.find((item) => item.id === profileId);
    if (profile === undefined || profile.baseUrl.trim().length === 0) return true;
    const check = state.checks[profile.id];
    if (check?.kind === 'ok' || check?.kind === 'checking') return false;
    return check !== undefined || wasAutoChecked(profile.id);
  });
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
  const tail = useChatStore((state) => {
    const last = state.chats[chatId]?.messages.at(-1);
    const candidate = last === undefined ? undefined : selectedCandidate(last);
    return (candidate?.content.length ?? 0) + (candidate?.reasoning.length ?? 0);
  });
  const streaming = useChatStore((state) => {
    const chat = state.chats[chatId];
    return chat !== undefined && isStreaming(chat);
  });
  const [confirmFrom, setConfirmFrom] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const [logRoot, setLogRoot] = useState<HTMLDivElement | null>(null);
  const attachLog = (element: HTMLDivElement | null): void => {
    log.current = element;
    setLogRoot(element);
  };
  const atBottom = useRef(true);
  const logWindow = useSettingsStore((state) => state.chatLogWindow);
  const { start, end, attachTopMark, attachBottomMark, attachList } = useMessageWindow(
    ids.length,
    { size: logWindow },
    chatId,
    logRoot,
  );
  const shown = start === 0 && end === ids.length ? ids : ids.slice(start, end);

  useEffect(() => {
    const element = log.current;
    if (element !== null && atBottom.current) element.scrollTop = element.scrollHeight;
  }, [tail, ids.length]);

  const rollback = (messageId: string): void => {
    const chat = useChatStore.getState().chats[chatId];
    if (chat !== undefined && hasMessagesAfter(chat, messageId)) setConfirmFrom(messageId);
    else useChatStore.getState().rollback(chatId, messageId);
  };

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
            aria-busy={streaming}
            onScroll={onLogScroll}
          >
            <div ref={attachTopMark} aria-hidden />
            <div
              ref={attachList}
              className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-2 pb-[19px]"
            >
              {ids.length === 0 ? (
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
