import { cva } from 'class-variance-authority';
import { KeyRound, Plug, SendHorizontal, Square, Unplug, X } from 'lucide-react';

import { COMMENT_CLOSE, COMMENT_OPEN } from '@/chat/macros';
import { DIRECTION_CLOSE, DIRECTION_OPEN } from '@/chat/playbook-text';
import type { SendState } from '@/components/llm/workspace/use-send-state';
import { t } from '@/i18n';
import { useChatStore } from '@/store/use-chat-store';
import { useLlmConnectDialogStore } from '@/store/use-llm-connect-dialog-store';

const sendButton = cva(
  `hover:bg-background/60 inline-flex h-6 w-8 items-center justify-center rounded-md
    disabled:opacity-40`,
  {
    variants: {
      state: {
        ready: 'text-tool-active',
        connect: 'text-destructive',
        model: 'text-tool-active',
        key: 'text-tool-active',
        idle: 'text-muted-foreground',
      },
    },
  },
);

const PROMPT_BUTTONS = {
  connect: { Icon: Unplug, label: 'llm.onboarding.title', title: 'llm.chat.cannotSend' },
  model: { Icon: Plug, label: 'llm.modelPicker.title', title: 'llm.chat.chooseModel' },
  key: { Icon: KeyRound, label: 'llm.connection.enterKey', title: 'llm.chat.setKeyFirst' },
} as const;

export function AttachedImages({
  images,
  onRemove,
}: {
  readonly images: readonly string[];
  readonly onRemove: (index: number) => void;
}): React.ReactElement | null {
  if (images.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2 px-[13px] pt-[13px]">
      {images.map((url, index) => {
        const onRemoveClick = (): void => onRemove(index);
        return (
          <li key={url} className="relative">
            <img
              src={url}
              alt={t('llm.chat.attachedImage', { index: index + 1 })}
              className="h-16 rounded-md"
            />
            <button
              type="button"
              className="bg-background text-foreground hover:bg-muted absolute -top-1.5 -right-1.5
                      inline-flex size-5 items-center justify-center rounded-full border shadow-sm"
              aria-label={t('llm.chat.removeImage', { index: index + 1 })}
              title={t('llm.chat.removeImage', { index: index + 1 })}
              onClick={onRemoveClick}
            >
              <X className="size-3" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function SendButton({
  streaming,
  sendState,
  empty,
  onStop,
  onSend,
  onChooseModel,
  onSetKey,
}: {
  readonly streaming: boolean;
  readonly sendState: SendState;
  readonly empty: boolean;
  readonly onStop: () => void;
  readonly onSend: () => void;
  readonly onChooseModel: () => void;
  readonly onSetKey: () => void;
}): React.ReactElement {
  if (streaming) {
    return (
      <button
        type="button"
        className="text-foreground hover:bg-background/60 inline-flex h-6 w-8 items-center
                  justify-center rounded-md"
        aria-label={t('llm.chat.stop')}
        title={t('llm.chat.stop')}
        onClick={onStop}
      >
        <Square className="size-4" aria-hidden />
      </button>
    );
  }
  if (sendState === 'connect' || sendState === 'model' || sendState === 'key') {
    const prompt = PROMPT_BUTTONS[sendState];
    const handlers = {
      connect: () => useLlmConnectDialogStore.getState().open(),
      model: onChooseModel,
      key: onSetKey,
    };
    return (
      <button
        type="button"
        className={sendButton({ state: sendState })}
        aria-label={t(prompt.label)}
        title={t(prompt.title)}
        onClick={handlers[sendState]}
      >
        <prompt.Icon className="size-4" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      className={sendButton({ state: sendState === 'ready' && !empty ? 'ready' : 'idle' })}
      disabled={empty || sendState === 'wait'}
      aria-label={t('llm.chat.send')}
      title={t('llm.chat.send')}
      onClick={onSend}
    >
      <SendHorizontal className="size-4" aria-hidden />
    </button>
  );
}

export function NoteBox({ chatId }: { readonly chatId: string }): React.ReactElement | null {
  const note = useChatStore((state) => state.draftNotes[chatId]);
  if (note === undefined) return null;
  const onNoteRemove = (): void => useChatStore.getState().setDraftNote(chatId, null);
  return (
    <div
      role="note"
      aria-label={t('llm.playbook.noteBox')}
      className="text-muted-foreground relative mx-[13px] mt-[13px] rounded-md border border-dashed
        px-2 py-1"
    >
      <span className="block font-mono text-xs select-none" aria-hidden>
        {COMMENT_OPEN}
      </span>
      <p className="pr-6 text-xs whitespace-pre-wrap">{note}</p>
      <span className="block font-mono text-xs select-none" aria-hidden>
        {COMMENT_CLOSE}
      </span>
      <button
        type="button"
        className="hover:text-foreground hover:bg-background absolute top-1 right-1 inline-flex
          size-5 items-center justify-center rounded"
        aria-label={t('llm.playbook.noteRemove')}
        title={t('llm.playbook.noteRemove')}
        onClick={onNoteRemove}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function DirectionBox({ chatId }: { readonly chatId: string }): React.ReactElement | null {
  const text = useChatStore((state) => state.draftDirections[chatId]?.text);
  if (text === undefined) return null;
  const store = useChatStore.getState();
  const onDirectionChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void =>
    store.setDirectionText(chatId, event.target.value);
  const onDirectionRemove = (): void => store.clearDirection(chatId);
  return (
    <div
      role="group"
      aria-label={t('llm.playbook.directionBox')}
      className="bg-muted/60 relative mx-[13px] mt-[13px] rounded-md border px-2 py-1"
    >
      <span className="text-muted-foreground block font-mono text-xs select-none" aria-hidden>
        {DIRECTION_OPEN}
      </span>
      <textarea
        className="field-sizing-content block max-h-40 min-h-[1lh] w-full resize-none bg-transparent
          pr-6 text-sm outline-none"
        value={text}
        aria-label={t('llm.playbook.directionBox')}
        onChange={onDirectionChange}
      />
      <span className="text-muted-foreground block font-mono text-xs select-none" aria-hidden>
        {DIRECTION_CLOSE}
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground hover:bg-background absolute top-1
          right-1 inline-flex size-5 items-center justify-center rounded"
        aria-label={t('llm.playbook.directionRemove')}
        title={t('llm.playbook.directionRemove')}
        onClick={onDirectionRemove}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
