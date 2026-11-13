// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_CHARACTER } from '@/chat/card';
import type { LoreLibrary } from '@/chat/chat-sources';
import { BUILTIN_PLAYBOOKS, resolvePlaybook } from '@/chat/playbook';
import { startPlaybook } from '@/chat/playbook-outline';
import { directionText } from '@/chat/playbook-text';
import { NO_SEMANTIC_HITS } from '@/chat/semantic';
import { tPath } from '@/i18n';
import { installLlmPort } from '@/store/ports/llm-port';
import { previewSendRequest, provideChatTools, useChatStore } from '@/store/use-chat-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

import {
  chat,
  chatMessage,
  fakeLlmPort,
  loreEntry,
  profile,
  sampleComposition,
  setDefaultLlm,
  type FakeLlmPort,
} from '../helpers/llm';

// ─────────────────────────────
// 送る生データを表示。送るときと同じ材料と組み立てで、入力欄の文も今回の
// メッセージとして入れる。送った要求と同じ物になることを確かめる
// ─────────────────────────────

const LIBRARY: LoreLibrary = { dictionaries: {}, enabledIds: [], on: true };
const TOOL = {
  type: 'function' as const,
  function: { name: 'make_image', description: 'Make.', parameters: {} },
};

let port: FakeLlmPort;

beforeEach(() => {
  port = fakeLlmPort();
  installLlmPort(port);
  setDefaultLlm();
  useLlmProfilesStore.setState({ profiles: [profile()] });
  useSettingsStore.setState({
    llmSystemPrompt: 'System.',
    squashSystemMessages: false,
    llmParams: { temperature: 0.5 },
  });
  provideChatTools({
    definitions: () => [TOOL],
    check: () => ({ kind: 'waiting' }),
  });
  useChatStore.setState({ chats: {}, places: {}, saveStates: {}, pending: {}, drafts: {} });
});

afterEach(() => {
  useChatStore.getState().unload('c1');
  provideChatTools({
    definitions: () => [],
    check: () => ({ kind: 'invalid', problem: { code: 'unknown-tool' } }),
  });
  useSettingsStore.setState({ llmSystemPrompt: '', llmParams: {} });
});

/** ロールプレイのプレイブックで、アウトラインの段（深さ 0）を 1 つ有効にした会話 */
function playbookChat(): ReturnType<typeof chat> {
  const composition = sampleComposition();
  const items = composition.items.map((item) =>
    item.marker === null ? { ...item, content: `item:${item.id}` } : item,
  );
  const base = chat(
    [chatMessage('u0', 'user', ['hello']), chatMessage('a0', 'assistant', ['hi there'])],
    { prompt: { ...composition, items } },
  );
  const shape = BUILTIN_PLAYBOOKS.find((item) => item.id === 'roleplay')!;
  const patch = startPlaybook(base, resolvePlaybook(shape, tPath));
  const step = loreEntry({
    keys: ['outline'],
    constant: true,
    comment: 'Step 1',
    content: 'STEP ONE',
    depth: { depth: 0, role: 'system' },
  });
  return {
    ...base,
    ...patch,
    playbook: { ...patch.playbook, phase: 'scene' },
    lorebooks: [{ id: 'book', name: '##playbook', entries: [step] }],
  };
}

describe('送る生データを表示', () => {
  it('入力欄の文を今回のメッセージとして入れ、送った要求と同じになる（tools・生成の設定を含む）', async () => {
    useChatStore.getState().put('c1', playbookChat());
    useChatStore.getState().setDraft('c1', 'TYPED');
    const preview = previewSendRequest('c1', LIBRARY, NO_SEMANTIC_HITS);
    expect(preview?.messages.some((message) => message.content === 'TYPED')).toBe(true);
    expect(preview?.tools).toEqual([TOOL]);

    useChatStore.getState().send('c1');
    await vi.waitFor(() => expect(port.requests).toHaveLength(1));
    expect(JSON.stringify(port.requests[0])).toBe(JSON.stringify(preview));
  });

  it('打っていなければ、会話の発言だけで組み立てる', () => {
    useChatStore.getState().put('c1', playbookChat());
    const preview = previewSendRequest('c1', LIBRARY, NO_SEMANTIC_HITS);
    expect(preview?.messages.at(-1)?.role).not.toBe('assistant');
    expect(preview?.messages.some((message) => message.content === 'STEP ONE')).toBe(true);
    expect(useChatStore.getState().chats.c1?.messages).toHaveLength(2);
  });

  it('指示の発言の {{char}}・{{user}} は、送るときと同じく置き換えた形で出す', () => {
    const direction = {
      ...chatMessage('u1', 'user', [directionText(['{{char}} greets {{user}}.'])]),
      instruction: { name: '', content: '', direction: true as const },
    };
    const base = playbookChat();
    useChatStore.getState().put('c1', {
      ...base,
      messages: [...base.messages, direction],
      character: { ...EMPTY_CHARACTER, name: 'Aoi' },
      persona: { name: 'Kei', description: '' },
    });
    const preview = previewSendRequest('c1', LIBRARY, NO_SEMANTIC_HITS);
    const sent = JSON.stringify(preview?.messages);
    expect(sent).toContain('Aoi greets Kei.');
    expect(sent).not.toContain('{{char}}');
  });
});
