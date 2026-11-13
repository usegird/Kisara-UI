// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NO_SEMANTIC_HITS } from '@/chat/semantic';
import { installLlmPort } from '@/store/ports/llm-port';
import { chatLoreOf, refreshLorePreview, useChatStore } from '@/store/use-chat-store';
import { canSummarize, useChatSummaryStore } from '@/store/use-chat-summary-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';

import {
  chat,
  chatTurns,
  contentText,
  fakeLlmPort,
  loreEntry,
  profile,
  setDefaultLlm,
  type FakeLlmPort,
} from '../helpers/llm';

// ─────────────────────────────
// 上限を超える会話の送り方と、履歴の要約。作り物の窓口で受け取る
// ─────────────────────────────

let port: FakeLlmPort;

beforeEach(() => {
  port = fakeLlmPort();
  installLlmPort(port);
  useLlmProfilesStore.setState({ profiles: [profile()], checks: {}, learned: {} });
  useChatStore.setState({
    chats: {},
    places: {},
    saveStates: {},
    pending: {},
    drafts: {},
    loreDrafts: {},
  });
  useChatSummaryStore.setState({ states: {} });
  useChatStore.getState().put('c1', chat(chatTurns(10)));
  setDefaultLlm();
});

afterEach(() => {
  useChatStore.getState().unload('c1');
});

const current = () => useChatStore.getState().chats.c1;
const receiving = () => current()?.messages.at(-1)?.candidates[0];

function send(text = 'next'): void {
  useChatStore.getState().setDraft('c1', text);
  useChatStore.getState().send('c1');
}

describe('上限を超える会話', () => {
  it('断りに上限が読めたら、上限を覚え、古い履歴を外して同じ候補で 1 回だけ送り直す', async () => {
    send();
    const first = port.requests[0]?.messages.length ?? 0;
    port.finish({
      ok: false,
      failure: { kind: 'rejected', status: 400, overflow: { context: 200, prompt: 400 } },
    });
    await expect.poll(() => port.requests.length).toBe(2);
    expect(port.requests[1]?.messages.length).toBeLessThan(first);
    expect(useLlmProfilesStore.getState().learned.p1?.['model-a']).toBe(200);
    expect(receiving()?.trimmed).toBeGreaterThan(0);
    expect(receiving()?.end.kind).toBe('streaming');

    // 送り直しでも断られたら、それ以上は送らずに失敗を出す
    port.finish({
      ok: false,
      failure: { kind: 'rejected', status: 400, overflow: { context: 200, prompt: 300 } },
    });
    await expect.poll(() => receiving()?.end.kind).toBe('failed');
    expect(port.requests).toHaveLength(2);
  });

  it('上限の読めない断りでは送り直さない', async () => {
    send();
    port.finish({ ok: false, failure: { kind: 'rejected', status: 400, message: 'no' } });
    await expect.poll(() => receiving()?.end.kind).toBe('failed');
    expect(port.requests).toHaveLength(1);
    expect(receiving()?.trimmed).toBeUndefined();
  });

  it('上限が分かっていれば、送る前に外し、外した件数と見積もりを候補に残す', async () => {
    useLlmProfilesStore.getState().learnContext('p1', 'model-a', 60);
    send();
    expect(port.requests[0]?.messages.length).toBeLessThan(11);
    expect(receiving()?.trimmed).toBeGreaterThan(0);
    expect(receiving()?.sentEstimate).toBeGreaterThan(0);
    port.finish();
    await expect.poll(() => receiving()?.end.kind).toBe('done');
    expect(receiving()?.trimmed).toBeGreaterThan(0);
  });
});

describe('履歴の要約', () => {
  it('新しい 4 件を残して縮めさせ、受け取った本文で会話の要約を置き換える', async () => {
    expect(canSummarize('c1')).toBe(true);
    const done = useChatSummaryStore.getState().summarize('c1');
    expect(useChatSummaryStore.getState().states.c1).toEqual({ kind: 'running' });
    expect(canSummarize('c1')).toBe(false);
    const request = port.requests[0];
    expect(request?.messages).toHaveLength(2);
    expect(request?.messages[1]?.content).toContain('m5 ');
    expect(request?.messages[1]?.content).not.toContain('m6 ');

    port.emit({ kind: 'delta', content: 'They ', reasoning: '' });
    port.emit({ kind: 'delta', content: 'met.', reasoning: '' });
    port.emit({ kind: 'usage', usage: { prompt: 300, completion: 20 } });
    port.finish();
    await done;
    expect(current()?.summary).toMatchObject({ content: 'They met.', upTo: 'm5' });
    // 作った応答の記録も残す（「要約する」の右の i に出す）
    expect(current()?.summary?.response?.usage).toEqual({ prompt: 300, completion: 20 });
    expect(current()?.summary?.response?.timing?.firstMs).toBeTypeOf('number');
    expect(useChatSummaryStore.getState().states.c1).toBeUndefined();
    // 縮めた分は次に送る中身から外れ、要約が入る
    send();
    const sent = port.requests[1]?.messages.map(contentText).join('|') ?? '';
    expect(sent).toContain('[Summary: They met.]');
    expect(sent).not.toContain('m5 ');
  });

  it('失敗したら要約を変えず、原因を残す', async () => {
    const done = useChatSummaryStore.getState().summarize('c1');
    port.finish({ ok: false, failure: { kind: 'server', status: 500 } });
    await done;
    expect(current()?.summary).toBeUndefined();
    expect(useChatSummaryStore.getState().states.c1).toMatchObject({ kind: 'failed' });
  });

  it('縮める発言が無ければ要約しない', () => {
    useChatStore.getState().put('c1', chat(chatTurns(4)));
    expect(canSummarize('c1')).toBe(false);
    void useChatSummaryStore.getState().summarize('c1');
    expect(port.requests).toHaveLength(0);
  });
});

describe('打ちかけのメッセージの当て方', () => {
  it('プロンプトのタブの見込みでは、打ちかけの本文も今回のメッセージとして見る範囲に入れる', () => {
    const library = {
      dictionaries: {
        d1: {
          id: 'd1',
          name: 'D',
          createdAt: 0,
          updatedAt: 0,
          entries: [loreEntry({ keys: ['dragon'], content: 'D.' })],
        },
      },
      enabledIds: ['d1'],
    };
    const base = chat(chatTurns(2));
    const lore = (draft?: string) =>
      chatLoreOf(base, library, null, { semantic: NO_SEMANTIC_HITS, draft }).hits;
    expect(lore().get('d1')).toBeUndefined();
    expect(lore('a dragon appears').get('d1')?.has(0)).toBe(true);
    expect(lore('  ').get('d1')).toBeUndefined();
  });
});

describe('追加辞書の見込みに写す時機', () => {
  const loreDraft = () => useChatStore.getState().loreDrafts.c1;

  it('打つたびには写さず、改行したとき・空にしたとき・焦点が外れたときに写す', () => {
    const store = useChatStore.getState();
    store.setDraft('c1', 'a dra');
    store.setDraft('c1', 'a dragon');
    expect(loreDraft()).toBeUndefined();
    store.setDraft('c1', 'a dragon\n');
    expect(loreDraft()).toBe('a dragon\n');
    store.setDraft('c1', 'a dragon\nand');
    expect(loreDraft()).toBe('a dragon\n');
    refreshLorePreview('c1');
    expect(loreDraft()).toBe('a dragon\nand');
    store.setDraft('c1', '');
    expect(loreDraft()).toBe('');
  });

  it('焦点を外さずに送ったら、見込みの打ちかけを空にする', () => {
    const store = useChatStore.getState();
    store.setDraft('c1', 'x\ny');
    store.send('c1');
    expect(loreDraft()).toBe('');
    expect(port.requests).toHaveLength(1);
  });
});
