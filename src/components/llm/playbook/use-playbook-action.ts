import { isStreaming } from '@/chat/edit';
import { commentsOf, stripComments } from '@/chat/macros';
import type { PlaybookAction, PlaybookConsultAction, PlaybookSendAction } from '@/chat/playbook';
import {
  nextStep,
  PLAYBOOK_BOOK,
  PLAYBOOK_BOOK_ID,
  playbookBook,
  withNextStepTitle,
} from '@/chat/playbook-outline';
import { directionOf, pickedText, type Candidate } from '@/chat/playbook-text';
import { useSendState } from '@/components/llm/workspace/use-send-state';
import { t } from '@/i18n';
import { replaceFieldText } from '@/lib/insert-at-caret';
import { chatPlaybookOf } from '@/store/chat/playbook-resolve';
import { useChatStore } from '@/store/use-chat-store';
import { usePromptAdvisorStore } from '@/store/use-prompt-advisor-store';

// ─────────────────────────────
// プレイブックの操作。カードの主の操作と欄の操作で同じ動きにする。送る操作は指示の枠に入れるだけで送らない。
// ─────────────────────────────

/** 会話の入力欄の id */
export function composerInputId(chatId: string): string {
  return `chat-input-${chatId}`;
}

/** プレイブックのカードの id（始めるアイコンから焦点を移す先） */
export function playbookCardId(chatId: string): string {
  return `playbook-card-${chatId}`;
}

/** プレイブックの操作を押せるかと、押したときの手続き */
interface PlaybookActionControl {
  /** 押せるか */
  readonly enabled: (action: PlaybookAction) => boolean;
  readonly run: (action: PlaybookAction) => void;
  /**
   * 選んだ候補を指示に添えて送る。`action` が null なら続けるの指示
   */
  readonly runWith: (action: PlaybookSendAction | null, picked: readonly Candidate[]) => void;
  /** 「続きを書く」を押せるか（つなげば送れる。受け取り中は、終われば送れるので押せる） */
  readonly directable: boolean;
}

/** プレイブックの辞書（##playbook）が消されていれば空の 1 冊を足し直してから、その名前を返す */
function ensureOutline(chatId: string): string | null {
  const store = useChatStore.getState();
  const chat = store.chats[chatId];
  if (chat === undefined || chat.playbook === undefined) return null;
  if (playbookBook(chat) === undefined) {
    store.update(chatId, {
      lorebooks: [
        ...(chat.lorebooks ?? []),
        { id: PLAYBOOK_BOOK_ID, name: PLAYBOOK_BOOK, entries: [] },
      ],
    });
  }
  return PLAYBOOK_BOOK;
}

/** 相談の操作で、その勘所を入れた構成の相談を開く */
function consult(chatId: string, action: PlaybookConsultAction): void {
  const advisor =
    chatPlaybookOf(useChatStore.getState().chats[chatId])?.playbook.advisor ?? 'blank';
  const outline = action.outline ? ensureOutline(chatId) : null;
  usePromptAdvisorStore.getState().start(chatId, {
    use: advisor,
    visible: action.greeting,
    guide: action.instruction,
    outline,
  });
}

/**
 * その会話のプレイブックの操作を返す。相談の操作は勘所を入れた構成の相談を開き、次へはアウトラインの
 * 辞書の項目の有効を切り替える
 */
export function usePlaybookAction(chatId: string): PlaybookActionControl {
  const sendState = useSendState(chatId);
  const streaming = useChatStore((state) => {
    const chat = state.chats[chatId];
    return chat !== undefined && isStreaming(chat);
  });
  const canNext = useChatStore((state) => {
    const chat = state.chats[chatId];
    return chat !== undefined && nextStep(chat) !== null;
  });
  // 生成し直すで作り直せるのは最後の `assistant` だけ
  const canRevise = useChatStore(
    (state) => state.chats[chatId]?.messages.at(-1)?.role === 'assistant',
  );

  const enabled = (action: PlaybookAction): boolean => {
    if (action.kind === 'consult') return true;
    // 送る操作は指示の枠に入れるだけで、送るのは受け取り後の送るボタンなので、受け取り中も押せる
    if (action.kind === 'send' && action.revise !== true) return true;
    if (streaming) return false;
    if (action.kind === 'next') return canNext;
    // 入力欄に入れる操作は、作り直せる発言があるときだけ
    return canRevise;
  };

  /**
   * 指示を入力欄の上の指示の枠に入れ、どの操作かを覚える（送らない。送るのは会話の送るボタン）。
   * `action` が null なら続きを書くの指示
   */
  const fill = (action: PlaybookSendAction | null, picked: readonly Candidate[]): void => {
    const store = useChatStore.getState();
    const playbook = chatPlaybookOf(store.chats[chatId])?.playbook;
    if (playbook === undefined) return;
    const instruction = action === null ? playbook.continue : instructionOf(action);
    const parts = [stripComments(instruction), pickedText(picked, playbook.labels.picked)];
    store.fillDirection(chatId, parts, directionOf(action));
    putNote(instruction);
    replaceInput('');
  };

  /**
   * 入力欄の文を置き換える（コマンドを押したら入力欄は空にする）。人が打ったのと同じ編集として入れるので、
   * Ctrl+Z で前の文に戻せる。欄が無ければ打ちかけだけを書き換える
   */
  const replaceInput = (text: string): void => {
    const field = document.getElementById(composerInputId(chatId));
    if (!(field instanceof HTMLTextAreaElement) || !replaceFieldText(field, text)) {
      useChatStore.getState().setDraft(chatId, text);
    }
  };

  /**
   * 指示文に添えた送らない注記（`<comment>`）は、注記の枠に出す
   */
  const putNote = (instruction: string): void => {
    const notes = commentsOf(instruction);
    useChatStore.getState().setDraftNote(chatId, notes.length === 0 ? null : notes.join('\n\n'));
  };

  /**
   * 操作の指示文。`{{nextStep}}` は入れたときの次の段の題にする
   */
  const instructionOf = (action: PlaybookSendAction): string => {
    const chat = useChatStore.getState().chats[chatId];
    return chat === undefined
      ? action.instruction
      : withNextStepTitle(action.instruction, chat, t('llm.playbook.noNextStep'));
  };

  /**
   * 直前の本文を作り直す指示を入力欄に入れる。入力欄の文は置き換え（Ctrl+Z で戻せる）、
   * 前の操作の指示の枠は外す（生成し直すは枠を使わない）。添えた注記は注記の枠に出す。
   * 作り直すのは利用者が生成し直すを押したとき
   */
  const fillInput = (action: PlaybookSendAction): void => {
    const instruction = instructionOf(action);
    useChatStore.getState().clearDirection(chatId);
    replaceInput(stripComments(instruction));
    putNote(instruction);
  };

  const run = (action: PlaybookAction): void => {
    if (!enabled(action)) return;
    const store = useChatStore.getState();
    if (action.kind === 'consult') consult(chatId, action);
    else if (action.kind === 'next') store.updatePlaybookChat(chatId, nextStep);
    else if (action.revise === true) fillInput(action);
    else fill(action, []);
  };

  const runWith = (action: PlaybookSendAction | null, picked: readonly Candidate[]): void =>
    fill(action, picked);

  // 受け取り中の「待つ」は終われば送れるので押せる（ほかの「待つ」は置き場の容量で送れないとき）
  return { enabled, run, runWith, directable: streaming || sendState !== 'wait' };
}
