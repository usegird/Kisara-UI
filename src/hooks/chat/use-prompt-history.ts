import { useState } from 'react';

import type { PromptComposition } from '@/chat/types';
import { historyKeyOf, isTextEntry } from '@/lib/text-entry';
import { useChatStore } from '@/store/use-chat-store';

const LIMIT = 50;

interface PromptHistory {
  readonly chatId: string;
  readonly undo: readonly PromptComposition[];
  readonly redo: readonly PromptComposition[];
}

interface PromptHistoryControls {
  readonly record: () => void;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

export function usePromptHistory(chatId: string): PromptHistoryControls {
  const [history, setHistory] = useState<PromptHistory>({ chatId, undo: [], redo: [] });
  const current: PromptHistory =
    history.chatId === chatId ? history : { chatId, undo: [], redo: [] };
  if (current !== history) setHistory(current);
  const prompt = (): PromptComposition | undefined => useChatStore.getState().chats[chatId]?.prompt;

  const record = (): void => {
    const now = prompt();
    if (now === undefined) return;
    setHistory({ chatId, undo: [...current.undo, now].slice(-LIMIT), redo: [] });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    const direction = historyKeyOf(event);
    if (direction === null || isTextEntry(event.target)) return;
    const now = prompt();
    const target = (direction === 'undo' ? current.undo : current.redo).at(-1);
    if (now === undefined || target === undefined) return;
    event.preventDefault();
    useChatStore.getState().updatePrompt(chatId, () => target);
    setHistory(
      direction === 'undo'
        ? { chatId, undo: current.undo.slice(0, -1), redo: [...current.redo, now] }
        : { chatId, undo: [...current.undo, now], redo: current.redo.slice(0, -1) },
    );
  };

  return { record, onKeyDown };
}
