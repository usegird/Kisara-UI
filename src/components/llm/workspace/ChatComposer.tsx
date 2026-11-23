import { Paperclip } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { isStreaming } from '@/chat/edit';
import { LlmModelButton } from '@/components/llm/dialogs/LlmModelDialog';
import { composerInputId } from '@/components/llm/playbook/use-playbook-action';
import { useCloudConsent, type CloudConsent } from '@/components/llm/side-panel/use-cloud-consent';
import { ChatSaveNotice } from '@/components/llm/workspace/ChatSaveNotice';
import {
  AttachedImages,
  DirectionBox,
  NoteBox,
  SendButton,
} from '@/components/llm/workspace/ComposerParts';
import { useSendState } from '@/components/llm/workspace/use-send-state';
import { WebSearchToggle } from '@/components/llm/workspace/WebSearchToggle';
import { useEmbedAnchor } from '@/components/ui/embed-anchors';
import { useLlmTarget } from '@/hooks/chat/use-llm-target';
import { t } from '@/i18n';
import { readAttachedImage } from '@/lib/image-attach';
import { isComposingKey } from '@/lib/text-entry';
import { llmKeyPort } from '@/store/ports/llm-key-port';
import { refreshLorePreview, useChatStore } from '@/store/use-chat-store';
import { useLlmConnectDialogStore } from '@/store/use-llm-connect-dialog-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

const TALL_LINES = 3.5;

const SHOW_ATTACH = false as boolean;

const NO_IMAGES: readonly string[] = [];

export interface ChatComposerProps {
  readonly chatId: string;
}

export function ChatComposer({ chatId }: ChatComposerProps): React.ReactElement {
  const draft = useChatStore((state) => state.drafts[chatId] ?? '');
  const images = useChatStore((state) => state.draftImages[chatId] ?? NO_IMAGES);
  const streaming = useChatStore((state) => {
    const chat = state.chats[chatId];
    return chat !== undefined && isStreaming(chat);
  });
  const sendState = useSendState(chatId);
  const sendable = sendState === 'ready';
  const store = useChatStore.getState();
  const boxed = useChatStore((state) => state.draftDirections[chatId] !== undefined);
  const empty = draft.trim().length === 0 && images.length === 0 && !boxed;
  const fileInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const attachChatColumn = useEmbedAnchor('chatColumn');
  const [modelOpen, setModelOpen] = useState(false);
  const { profileId } = useLlmTarget();
  const consent = useCloudConsent();

  useEffect(() => {
    const element = input.current;
    if (element === null) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const style = getComputedStyle(element);
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const lines = (element.scrollHeight - padding) / parseFloat(style.lineHeight);
        const tall = String(lines > TALL_LINES);
        if (element.dataset.tall !== tall) element.dataset.tall = tall;
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const attach = async (files: readonly File[]): Promise<void> => {
    const read = await Promise.all(files.map(readAttachedImage));
    store.addDraftImages(
      chatId,
      read.filter((url): url is string => url !== null),
    );
  };

  const send = (): void => {
    if (sendState === 'connect' && !empty) useLlmConnectDialogStore.getState().open();
    if (sendState === 'model' && !empty) setModelOpen(true);
    if (sendState === 'key' && !empty) openKeyEntry(profileId, consent.confirmFor);
    if (!sendable) return;
    const first = (useChatStore.getState().chats[chatId]?.messages.length ?? 0) === 0;
    if (first && typeof document.startViewTransition === 'function') {
      document.startViewTransition(() => flushSync(() => store.send(chatId)));
    } else {
      store.send(chatId);
    }
  };

  const onDraftChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void =>
    store.setDraft(chatId, event.target.value);
  const onDraftBlur = (): void => refreshLorePreview(chatId);
  const onDraftKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (isComposingKey(event)) return;
    if (event.key === 'Escape' && streaming) {
      event.preventDefault();
      store.stop(chatId);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };
  const onAttachClick = (): void => fileInput.current?.click();
  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    void attach([...(event.target.files ?? [])]);
    event.target.value = '';
  };
  const onRemoveImage = (index: number): void => store.removeDraftImage(chatId, index);
  const onStop = (): void => store.stop(chatId);

  return (
    <div className="pr-(--chat-pad-r) pl-(--chat-pad-l)">
      <div className="mx-auto max-w-3xl px-4 pt-2 empty:hidden">
        <ChatSaveNotice chatId={chatId} />
      </div>
      <div
        ref={attachChatColumn}
        className="relative mx-auto max-w-3xl px-4 pt-[10px] pb-column-bottom"
      >
        <div
          className="bg-muted/60 focus-within:bg-muted focus-within:outline-ring relative
            focus-within:outline-1 rounded-[calc(var(--radius-base)*2)]"
          style={{ viewTransitionName: 'chat-composer' }}
        >
          <AttachedImages images={images} onRemove={onRemoveImage} />
          <NoteBox chatId={chatId} />
          <DirectionBox chatId={chatId} />
          <textarea
            ref={input}
            id={composerInputId(chatId)}
            className="field-sizing-content block max-h-48 min-h-[calc(3lh+13px)] w-full
              resize-none bg-transparent px-[13px] pt-[13px] pb-0 text-sm outline-none
              data-[tall=true]:pb-[5px]"
            rows={3}
            value={draft}
            aria-label={t('llm.chat.input')}
            placeholder={t('llm.chat.inputPlaceholder')}
            onChange={onDraftChange}
            onBlur={onDraftBlur}
            onKeyDown={onDraftKeyDown}
          />
          <div className="-mt-[10px] flex items-start justify-between gap-1 px-3 pt-0 pb-1.5">
            {SHOW_ATTACH ? (
              <>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground hover:bg-background/60 inline-flex
                h-6 w-8 items-center justify-center rounded-md"
                  aria-label={t('llm.chat.attach')}
                  title={t('llm.chat.attach')}
                  onClick={onAttachClick}
                >
                  <Paperclip className="size-4" aria-hidden />
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={onFileChange}
                />
              </>
            ) : null}
            <div className="ml-auto flex items-start gap-1">
              <WebSearchToggle scope="chat" />
              <ComposerModel
                open={modelOpen}
                onOpenChange={setModelOpen}
                attention={sendState === 'model'}
              />
              <SendButton
                streaming={streaming}
                sendState={sendState}
                empty={empty}
                onStop={onStop}
                onSend={send}
                onChooseModel={() => setModelOpen(true)}
                onSetKey={() => openKeyEntry(profileId, consent.confirmFor)}
              />
              {consent.dialog}
            </div>
          </div>
        </div>
        <p
          className="text-muted-foreground absolute inset-x-0 bottom-0 flex h-column-bottom items-center
            justify-center text-[11px] leading-none"
        >
          {t('llm.chat.aiNotice')}
        </p>
      </div>
    </div>
  );
}

function ComposerModel({
  open,
  onOpenChange,
  attention,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly attention: boolean;
}): React.ReactElement {
  const { profileId, model } = useLlmTarget();
  const onModelChange = (next: string): void =>
    useSettingsStore.getState().setLlmTarget({ model: next });
  return (
    <LlmModelButton
      profileId={profileId}
      value={model}
      onValueChange={onModelChange}
      open={open}
      onOpenChange={onOpenChange}
      attention={attention}
    />
  );
}

function openKeyEntry(profileId: string | null, confirmFor: CloudConsent['confirmFor']): void {
  const profile = useLlmProfilesStore.getState().profiles.find((item) => item.id === profileId);
  if (profile === undefined || profile.baseUrl.trim().length === 0) return;
  confirmFor(profile.baseUrl, () => {
    if (llmKeyPort().openEntry(profile.baseUrl) !== 'opened') {
      useLlmConnectDialogStore.getState().open();
    }
  });
}
