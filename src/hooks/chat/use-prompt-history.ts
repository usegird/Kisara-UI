import { useState } from 'react';

import type { PromptComposition } from '@/chat/types';
import { historyKeyOf, isTextEntry } from '@/lib/text-entry';
import { useChatStore } from '@/store/use-chat-store';

// ─────────────────────────────
// プロンプトの項目を足す・消す操作の取り消し。会話の構成全体を、会話ごとに画面の中だけで控える。
// ─────────────────────────────

/**
 * 控える手の上限（古いものから捨てる）。
 */
const LIMIT = 50;

interface PromptHistory {
  readonly chatId: string;
  readonly undo: readonly PromptComposition[];
  readonly redo: readonly PromptComposition[];
}

/** 控える手続きと、取り消し・やり直しのキーの受け口 */
interface PromptHistoryControls {
  /** 足す・消す直前に呼ぶ。今の構成を控え、やり直しの控えを捨てる */
  readonly record: () => void;
  /** プロンプトのタブの枠の keydown に渡す */
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

/** 取り消し・やり直しのキー。どちらでもなければ null */
/** 会話のプロンプトの構成を控え、取り消し・やり直しのキーで戻す。文字の入力欄の中では取らない */
export function usePromptHistory(chatId: string): PromptHistoryControls {
  const [history, setHistory] = useState<PromptHistory>({ chatId, undo: [], redo: [] });
  // 会話を替えたら控えを捨てる（描く間に合わせる）
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
