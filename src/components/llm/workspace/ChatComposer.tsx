import { Paperclip } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { isStreaming } from '@/chat/edit';
import { LlmModelButton } from '@/components/llm/dialogs/LlmModelDialog';
import { composerInputId } from '@/components/llm/playbook/use-playbook-action';
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

// ─────────────────────────────
// 会話の入力欄と送る・止めるボタン。打ちかけの本文はタブの控え（会話のストア）に持つ。
// 入力欄の中の上に、プレイブックの操作の注記と指示の枠を出す。
// ─────────────────────────────

/** 本文がこの行数を超えたら下に余白を足す（3 行と 4 行の間で、行の高さの端数に左右されない） */
const TALL_LINES = 3.5;

/**
 * 入力欄に添付のボタンを出すか。今は出さない（送る中身・置き場・吹き出しの表示は残す）
 */
const SHOW_ATTACH = false as boolean;

const NO_IMAGES: readonly string[] = [];

/** 入力欄の props */
export interface ChatComposerProps {
  readonly chatId: string;
}

/** 入力欄と送る・止めるボタン。打ちかけの本文はタブの控え（会話のストア）に持つ */
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
  // 指示の枠があれば、打ちかけが空でも送れる（枠を囲んで送る）
  const boxed = useChatStore((state) => state.draftDirections[chatId] !== undefined);
  const empty = draft.trim().length === 0 && images.length === 0 && !boxed;
  const fileInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const attachChatColumn = useEmbedAnchor('chatColumn');
  // モデルを選ぶダイアログ。モデルの欄と送るボタン（モデルを選んでいない間）の両方から開く
  const [modelOpen, setModelOpen] = useState(false);
  const { profileId } = useLlmTarget();

  // 本文が 4 行以上（折り返しを含む）になったら、下に 5px の余白を足す。3 行までは最小の高さに収まり
  // 高さが変わらないので、高さが変わったときだけ数え直す（打った・消した・幅が変わった）。
  // 足した余白は差し引いて数えるので、付け外しで行き来しない。余白の付け外しは大きさを変えるので、
  // 知らせの中では書かず次のフレームに回す（同じフレームで知らせが重なると ResizeObserver が失敗を出す）
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

  /**
   * 選んだファイルのうち画像だけを読み、打ちかけに添える
   */
  const attach = async (files: readonly File[]): Promise<void> => {
    const read = await Promise.all(files.map(readAttachedImage));
    store.addDraftImages(
      chatId,
      read.filter((url): url is string => url !== null),
    );
  };

  /**
   * 送る。最初の 1 通は入力欄が中央から下へ移るので、ブラウザの View Transitions で動かす
   * （描き替えを同期で済ませてから、前後の位置の間を補間させる。持たないブラウザではそのまま移る）
   */
  const send = (): void => {
    // つないでいない間は接続の案内、つながっていてモデルを選んでいない間はモデルを選ぶダイアログを出す
    if (sendState === 'connect' && !empty) useLlmConnectDialogStore.getState().open();
    if (sendState === 'model' && !empty) setModelOpen(true);
    if (sendState === 'key' && !empty) openKeyEntry(profileId);
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
  // 追加辞書の見込みは改行したとき（setDraft）と焦点が外れたときに作り直す（送るときは送る前に行う）
  const onDraftBlur = (): void => refreshLorePreview(chatId);
  const onDraftKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // 文字の変換中の Enter は送らず、Esc は受け取りを止めない
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
    // 同じファイルを続けて選んでも知らせが来るよう空にする
    event.target.value = '';
  };
  const onRemoveImage = (index: number): void => store.removeDraftImage(chatId, index);
  const onStop = (): void => store.stop(chatId);

  return (
    <div className="pr-(--chat-pad-r) pl-(--chat-pad-l)">
      <div className="mx-auto max-w-3xl px-4 pt-2 empty:hidden">
        <ChatSaveNotice chatId={chatId} />
      </div>
      {/* 入力欄の枠（薄い地の色）の中で、本文の下の 1 行の右端にモデルの欄と送るボタンを置く
          （余白は詰める）。中央から下へ移るときは、この枠を View Transitions で動かす */}
      {/* この段の右端から右を、画像ビューワーを重ねる範囲にする */}
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
          {/* 10px 持ち上げ、その分だけ枠も低くする（本文の欄に重なってよい）。下の余白は 6px。
              左端に添付のボタン（今は出さない）、右端にモデルの欄と送るボタン */}
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
                onSetKey={() => openKeyEntry(profileId)}
              />
            </div>
          </div>
        </div>
        {/* 枠の下の余白の中に、応答が AI の生成であることを常に出す（EU AI 法 第50条。余白の高さは変えない） */}
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

/**
 * 入力欄の横のモデルの欄。押すとダイアログで選ぶ（一覧に無い名前も使える）
 */
function ComposerModel({
  open,
  onOpenChange,
  attention,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly attention: boolean;
}): React.ReactElement {
  // モデルは全体で 1 つ。替えるとどの会話にも効く
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

/**
 * 選んでいる接続の設定の API キーの入力の窓を開く。開けなければ（ゲートウェイがまだ・ポップアップを止められた）
 * 接続の案内を出し、そこで理由を見せる
 */
function openKeyEntry(profileId: string | null): void {
  const profile = useLlmProfilesStore.getState().profiles.find((item) => item.id === profileId);
  if (profile === undefined || profile.baseUrl.trim().length === 0) return;
  // ポップアップは利用者の操作の中でしか開けないので、押した手続き（Enter を含む）の中で開く
  if (llmKeyPort().openEntry(profile.baseUrl) !== 'opened') {
    useLlmConnectDialogStore.getState().open();
  }
}
