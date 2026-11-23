// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { removePromptItem } from '@/chat/prompt';
import { usePromptHistory } from '@/hooks/chat/use-prompt-history';
import { useChatStore } from '@/store/use-chat-store';

import { chat } from '../helpers/llm';

afterEach(cleanup);

beforeEach(() => {
  useChatStore.setState({ chats: { c1: chat() } });
});

function press(key: string, shiftKey = false): React.KeyboardEvent<HTMLElement> {
  const target = document.createElement('div');
  return {
    key,
    shiftKey,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    target,
    preventDefault: () => {},
  } as unknown as React.KeyboardEvent<HTMLElement>;
}

const ids = (): string[] =>
  useChatStore.getState().chats.c1?.prompt.items.map((item) => item.id) ?? [];

describe('プロンプトの取り消し', () => {
  it('消す前に控え、Ctrl+Z で戻し、Ctrl+Y でやり直す', () => {
    const { result } = renderHook(() => usePromptHistory('c1'));
    const before = ids();
    act(() => {
      result.current.record();
      useChatStore.getState().updatePrompt('c1', (prompt) => removePromptItem(prompt, 'tone'));
    });
    expect(ids()).not.toContain('tone');
    act(() => result.current.onKeyDown(press('z')));
    expect(ids()).toEqual(before);
    act(() => result.current.onKeyDown(press('y')));
    expect(ids()).not.toContain('tone');
  });

  it('文字の入力欄の中では取らない', () => {
    const { result } = renderHook(() => usePromptHistory('c1'));
    act(() => {
      result.current.record();
      useChatStore.getState().updatePrompt('c1', (prompt) => removePromptItem(prompt, 'tone'));
    });
    const event = { ...press('z'), target: document.createElement('textarea') };
    act(() => result.current.onKeyDown(event));
    expect(ids()).not.toContain('tone');
  });
});
