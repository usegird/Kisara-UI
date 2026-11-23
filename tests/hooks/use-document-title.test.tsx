// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useDocumentTitle } from '@/hooks/shell/use-document-title';
import { useChatStore } from '@/store/use-chat-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useTabsStore } from '@/store/use-tabs-store';

import { chat, chatMessage } from '../helpers/llm';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

function renderTitle(): void {
  renderHook(() => useDocumentTitle(useTabsStore((state) => state.activeId)));
}

describe('ブラウザのタブの題名', () => {
  it('ワークフローは付けた名前、無ければ種類', () => {
    act(() => {
      useTabsStore.getState().addTab();
      useGraphStore.getState().setName('');
    });
    renderTitle();
    expect(document.title).toBe('ワークフロー - KisaraUI');

    act(() => useGraphStore.getState().setName('anima'));
    expect(document.title).toBe('anima - KisaraUI');
  });

  it('名前の無い会話は、最初の発言の頭を出さず「会話」とだけ出す', () => {
    act(() => {
      useChatStore.setState({ chats: { c1: chat([chatMessage('m1', 'user', ['秘密の話の頭'])]) } });
      useTabsStore.getState().addChatTab('c1');
    });
    renderTitle();
    expect(document.title).toBe('会話 - KisaraUI');
  });
});
