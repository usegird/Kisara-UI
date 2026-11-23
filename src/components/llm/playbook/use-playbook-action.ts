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

export function composerInputId(chatId: string): string {
  return `chat-input-${chatId}`;
}

export function playbookCardId(chatId: string): string {
  return `playbook-card-${chatId}`;
}

interface PlaybookActionControl {
  readonly enabled: (action: PlaybookAction) => boolean;
  readonly run: (action: PlaybookAction) => void;
  readonly runWith: (action: PlaybookSendAction | null, picked: readonly Candidate[]) => void;
  readonly directable: boolean;
}

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
  const canRevise = useChatStore(
    (state) => state.chats[chatId]?.messages.at(-1)?.role === 'assistant',
  );

  const enabled = (action: PlaybookAction): boolean => {
    if (action.kind === 'consult') return true;
    if (action.kind === 'send' && action.revise !== true) return true;
    if (streaming) return false;
    if (action.kind === 'next') return canNext;
    return canRevise;
  };

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

  const replaceInput = (text: string): void => {
    const field = document.getElementById(composerInputId(chatId));
    if (!(field instanceof HTMLTextAreaElement) || !replaceFieldText(field, text)) {
      useChatStore.getState().setDraft(chatId, text);
    }
  };

  const putNote = (instruction: string): void => {
    const notes = commentsOf(instruction);
    useChatStore.getState().setDraftNote(chatId, notes.length === 0 ? null : notes.join('\n\n'));
  };

  const instructionOf = (action: PlaybookSendAction): string => {
    const chat = useChatStore.getState().chats[chatId];
    return chat === undefined
      ? action.instruction
      : withNextStepTitle(action.instruction, chat, t('llm.playbook.noNextStep'));
  };

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

  return { enabled, run, runWith, directable: streaming || sendState !== 'wait' };
}
