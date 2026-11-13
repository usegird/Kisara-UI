import { cva } from 'class-variance-authority';
import { KeyRound, Plug, SendHorizontal, Square, Unplug, X } from 'lucide-react';

import { COMMENT_CLOSE, COMMENT_OPEN } from '@/chat/macros';
import { DIRECTION_CLOSE, DIRECTION_OPEN } from '@/chat/playbook-text';
import type { SendState } from '@/components/llm/workspace/use-send-state';
import { t } from '@/i18n';
import { useChatStore } from '@/store/use-chat-store';
import { useLlmConnectDialogStore } from '@/store/use-llm-connect-dialog-store';

// ─────────────────────────────
// 会話の入力欄の中の部品。添えた画像、送る・止めるボタン、プレイブックの操作の注記と指示の枠。
// 打ちかけの本文と送る手続きは ChatComposer が持つ（注記と指示の枠は自分の欄だけを購読する）。
// ─────────────────────────────

/**
 * 送るボタン。送れるときは青、つないでいないときは接続断のアイコンを赤、
 * モデルだけを選んでいないときは接続のアイコンを青、キーが要るのに無いときは鍵のアイコンを青で出す
 */
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

/**
 * 送れない理由を片付ける手のボタンの、アイコンと名前（押すと起きること）と説明
 */
const PROMPT_BUTTONS = {
  connect: { Icon: Unplug, label: 'llm.onboarding.title', title: 'llm.chat.cannotSend' },
  model: { Icon: Plug, label: 'llm.modelPicker.title', title: 'llm.chat.chooseModel' },
  key: { Icon: KeyRound, label: 'llm.connection.enterKey', title: 'llm.chat.setKeyFirst' },
} as const;

/** 添えた画像と、1 枚ずつ外すボタン。添えていなければ出さない */
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

/**
 * 送る・止めるボタン。受け取り中は止める、つないでいない間は接続断のアイコン（押すと接続の案内）、
 * つながっていてモデルを選んでいない間は接続のアイコン（押すとモデルを選ぶ）、ほかは送る
 */
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
  /** 送る中身が無い */
  readonly empty: boolean;
  readonly onStop: () => void;
  readonly onSend: () => void;
  /** モデルを選ぶダイアログを開く */
  readonly onChooseModel: () => void;
  /** API キーの入力の窓を開く */
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
    // 送れない理由を 1 手で片付けられる間は、その手のアイコンにし、本文が無くても押せる
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

/**
 * 注記の枠。プレイブックの操作の指示に添えた送らない注記を、入力欄の中の上に読むだけで出す。
 * 上下の `<comment>` の行は指示の枠と同じく直せない文字。送らず、送るか × で外す
 */
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

/**
 * 入力欄の上の指示の枠。プレイブックの操作で入れた指示を、打った文と分けて直せる欄に出す。
 * 送るときに囲む `<direction>` の行は直せない文字で出す。× で外す
 */
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
