// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ToolCallRecord } from '@/chat/types';
import { openChatImage, useChatViewerSync } from '@/components/llm/workspace/chat-viewer';
import { useChatStore } from '@/store/use-chat-store';
import { useViewerStore } from '@/store/use-viewer-store';

import { chat, chatMessage, toolCallMessage } from '../helpers/llm';

afterEach(() => {
  cleanup();
  useViewerStore.getState().close();
  useChatStore.setState({ chats: {} });
});

function drawn(id: string, filename: string): ToolCallRecord {
  return {
    id,
    name: 'make_image',
    arguments: '{}',
    state: { kind: 'done', images: [{ filename, subfolder: '', type: 'output' }] },
  };
}

const first = chat([
  chatMessage('u1', 'user', ['draw']),
  toolCallMessage('a1', [drawn('c1', 'a.png')]),
]);

describe('会話の画像のビューワー', () => {
  it('開いている間に会話の画像が増えたら、並びを取り直す（新しいものが先）', () => {
    useChatStore.setState({ chats: { k1: first } });
    renderHook(() => useChatViewerSync('k1'));
    openChatImage('k1', 'a1:c1:0', { filename: 'a.png', subfolder: '', type: 'output' });
    expect(useViewerStore.getState().tasks).toHaveLength(1);

    const grown = chat([...first.messages, toolCallMessage('a2', [drawn('c2', 'b.png')])]);
    act(() => useChatStore.setState({ chats: { k1: grown } }));
    const tasks = useViewerStore.getState().tasks ?? [];
    expect(tasks.map((task) => task.promptId)).toEqual(['a2:c2:0', 'a1:c1:0']);
  });

  it('別窓へ移しても、会話の画像が増えたら並びを取り直す', () => {
    useChatStore.setState({ chats: { k1: first } });
    renderHook(() => useChatViewerSync('k1'));
    openChatImage('k1', 'a1:c1:0', { filename: 'a.png', subfolder: '', type: 'output' });
    const popup = { window: window, mount: document.createElement('div') };
    useViewerStore.getState().openWindow(popup);
    expect(useViewerStore.getState().mode).toBe('window');

    const grown = chat([...first.messages, toolCallMessage('a2', [drawn('c2', 'b.png')])]);
    act(() => useChatStore.setState({ chats: { k1: grown } }));
    expect(useViewerStore.getState().tasks).toHaveLength(2);
    expect(useViewerStore.getState().owner).toBe('k1');
  });

  it('ほかの並び（キュー・ほかの会話）で開いているときは取り直さない', () => {
    useChatStore.setState({ chats: { k1: first } });
    renderHook(() => useChatViewerSync('k1'));
    useViewerStore.getState().openOverlay(null, [], 'k2');
    const grown = chat([...first.messages, toolCallMessage('a2', [drawn('c2', 'b.png')])]);
    act(() => useChatStore.setState({ chats: { k1: grown } }));
    expect(useViewerStore.getState().tasks).toEqual([]);
  });
});
