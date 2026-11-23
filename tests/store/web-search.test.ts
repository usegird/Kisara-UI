// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseCandidate } from '@/chat/candidate-parse';
import { buildChatRequest } from '@/chat/request';
import {
  normalizeContentTokens,
  normalizeSearchEngine,
  normalizeWebCalls,
  webToolsOf,
} from '@/chat/web-tools';
import { parseCompletionChunk } from '@/llm/schema';
import { installLlmPort } from '@/store/ports/llm-port';
import { useChatStore } from '@/store/use-chat-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useWebSearchStore, webToolsFor } from '@/store/use-web-search-store';

import { chat, fakeLlmPort, profile, setDefaultLlm, type FakeLlmPort } from '../helpers/llm';

const OPENROUTER = 'https://openrouter.ai/api/v1';
const SEARCH = {
  type: 'openrouter:web_search',
  parameters: { engine: 'parallel', mode: 'fast' },
};
const FETCH = {
  type: 'openrouter:web_fetch',
  parameters: { engine: 'parallel', max_content_tokens: 32768 },
};

function resetWebSettings(): void {
  const settings = useSettingsStore.getState();
  settings.setWebSearchEngine('parallel:fast');
  settings.setWebSearchMaxCalls(5);
  settings.setWebFetchMaxTokens(32768);
}

let port: FakeLlmPort;

beforeEach(() => {
  port = fakeLlmPort();
  installLlmPort(port);
  useLlmProfilesStore.setState({ profiles: [profile({ baseUrl: OPENROUTER })] });
  useChatStore.setState({ chats: {}, places: {}, saveStates: {}, pending: {}, drafts: {} });
  useChatStore.getState().put('c1', chat());
  setDefaultLlm();
  resetWebSettings();
  useWebSearchStore.setState({
    modes: { chat: 'search', advisor: 'off' },
    agreed: false,
  });
});

afterEach(() => {
  useChatStore.getState().unload('c1');
  useWebSearchStore.setState({ modes: { chat: 'off', advisor: 'off' }, agreed: false });
});

const current = () => useChatStore.getState().chats.c1;
const lastCandidate = () => current()?.messages.at(-1)?.candidates[0];

function send(): void {
  useChatStore.getState().setDraft('c1', 'today?');
  useChatStore.getState().send('c1');
}

describe('切り替え', () => {
  it('押すたびに 切る ↔ 検索 と替わる（取得だけの状態は無い）', () => {
    useWebSearchStore.getState().setMode('chat', 'off');
    const seen = [1, 2].map(() => {
      useWebSearchStore.getState().cycle('chat');
      return useWebSearchStore.getState().modes.chat;
    });
    expect(seen).toEqual(['search', 'off']);
  });

  it('会話と構成の相談で状態を分ける', () => {
    useWebSearchStore.getState().cycle('advisor');
    expect(useWebSearchStore.getState().modes).toEqual({ chat: 'search', advisor: 'search' });
    useWebSearchStore.getState().cycle('chat');
    expect(useWebSearchStore.getState().modes).toEqual({ chat: 'off', advisor: 'search' });
    expect(webToolsFor(OPENROUTER, 'chat')).toBeNull();
    expect(webToolsFor(OPENROUTER, 'advisor')?.tools).toEqual([SEARCH, FETCH]);
  });

  it('検索のエンジンを無効にしたら、取得が有効でも切ったまま', () => {
    useWebSearchStore.getState().setMode('chat', 'off');
    useSettingsStore.getState().setWebSearchEngine('off');
    useWebSearchStore.getState().cycle('chat');
    expect(useWebSearchStore.getState().modes.chat).toBe('off');
  });
});

describe('送るとき', () => {
  it('有効なら確かめずに、検索と取得のツールと手数の上限を付けて送る', async () => {
    send();
    await expect.poll(() => port.requests.length).toBe(1);
    expect(port.requests[0]?.tools).toEqual([SEARCH, FETCH]);
    expect(port.requests[0]?.max_tool_calls).toBe(5);
  });
});

describe('送らないとき', () => {
  it('OpenRouter でない接続先・エンジンが無効・切っているときは、ツールなしで送る', () => {
    const cases: (() => void)[] = [
      () => useLlmProfilesStore.setState({ profiles: [profile()] }),
      () => useSettingsStore.getState().setWebSearchEngine('off'),
      () => useWebSearchStore.getState().setMode('chat', 'off'),
    ];
    for (const prepare of cases) {
      useChatStore.getState().put('c1', chat());
      useLlmProfilesStore.setState({ profiles: [profile({ baseUrl: OPENROUTER })] });
      resetWebSettings();
      useWebSearchStore.setState({ modes: { chat: 'search', advisor: 'off' } });
      prepare();
      port.requests.length = 0;
      send();
      expect(port.requests[0]?.tools).toBeUndefined();
      expect(port.requests[0]?.max_tool_calls).toBeUndefined();
      port.finish();
    }
  });
});

describe('使用状況と出典', () => {
  it('usage から検索・取得の回数と請求額を読む（実際の server_tool_use_details も）', () => {
    const billingOf = (raw: unknown) =>
      parseCompletionChunk(raw).find((event) => event.kind === 'billing');
    expect(
      billingOf({
        usage: {
          cost: 0.0123,
          server_tool_use: { web_search_requests: 3, web_fetch_requests: 2 },
        },
      }),
    ).toEqual({ kind: 'billing', billing: { searches: 3, fetches: 2, cost: 0.0123 } });
    expect(
      billingOf({
        usage: {
          cost: 0.0076,
          server_tool_use_details: { tool_calls_executed: 2, web_search_requests: 1 },
        },
      }),
    ).toEqual({ kind: 'billing', billing: { searches: 1, toolCalls: 2, cost: 0.0076 } });
    expect(billingOf({ usage: { prompt_tokens: 1, completion_tokens: 1 } })).toBeUndefined();
  });

  it('差分の annotations から出典を読む。url_citation でない・URL の無いものは落とす', () => {
    const events = parseCompletionChunk({
      choices: [
        {
          delta: {
            annotations: [
              { type: 'url_citation', url_citation: { url: 'https://a.example/x', title: 'A' } },
              { type: 'url_citation', url_citation: { title: 'no url' } },
              { type: 'url_citation', url_citation: { url: 'javascript:alert(1)', title: 'X' } },
              { type: 'file_citation', file_citation: {} },
            ],
          },
        },
      ],
    });
    expect(events).toContainEqual({
      kind: 'citations',
      citations: [{ url: 'https://a.example/x', title: 'A' }],
    });
  });

  it('受け取った使用状況と出典を候補に残す。出典は URL の重なりを除く', async () => {
    send();
    await expect.poll(() => port.requests.length).toBe(1);
    port.emit({ kind: 'delta', content: 'x', reasoning: '' });
    port.emit({ kind: 'citations', citations: [{ url: 'https://a.example', title: 'A' }] });
    port.emit({
      kind: 'citations',
      citations: [
        { url: 'https://a.example', title: 'A again' },
        { url: 'https://b.example', title: '' },
      ],
    });
    port.emit({ kind: 'billing', billing: { searches: 2, cost: 0.02 } });
    port.finish();
    await expect.poll(() => lastCandidate()?.end.kind).toBe('done');
    expect(lastCandidate()?.billing).toEqual({ searches: 2, cost: 0.02 });
    expect(lastCandidate()?.timing?.firstMs).toBeGreaterThanOrEqual(0);
    expect(lastCandidate()?.timing?.receivingMs).toBeGreaterThanOrEqual(0);
    expect(lastCandidate()?.citations).toEqual([
      { url: 'https://a.example', title: 'A' },
      { url: 'https://b.example', title: '' },
    ]);
  });

  it('使用状況・受け取りの記録・出典は保存した会話から読み戻せる。壊れた項目は落とす', () => {
    const candidate = parseCandidate({
      content: 'x',
      reasoning: '',
      end: { kind: 'done' },
      billing: { searches: 1, fetches: 'x', cost: 0.01 },
      timing: { firstMs: 420, receivingMs: 'x', referenceUsd: 0.001 },
      citations: [{ url: 'https://a.example', title: 'A' }, { title: 'no url' }, 'bad'],
    });
    expect(candidate?.billing).toEqual({ searches: 1, cost: 0.01 });
    expect(candidate?.timing).toEqual({ firstMs: 420, referenceUsd: 0.001 });
    expect(candidate?.citations).toEqual([{ url: 'https://a.example', title: 'A' }]);
  });

  it('使用状況は後から届いた項目で上書きし、無い項目は前の値を残す', async () => {
    send();
    await expect.poll(() => port.requests.length).toBe(1);
    port.emit({ kind: 'billing', billing: { searches: 1 } });
    port.emit({ kind: 'billing', billing: { cost: 0.1 } });
    port.finish();
    await expect.poll(() => lastCandidate()?.end.kind).toBe('done');
    expect(lastCandidate()?.billing).toEqual({ searches: 1, cost: 0.1 });
  });
});

describe('送る中身と設定', () => {
  it('Web のツールはワークフローのツールの後ろに足す', () => {
    const fn = {
      type: 'function' as const,
      function: { name: 'make', description: '', parameters: {} },
    };
    const llm = { model: 'm', params: {} };
    expect(
      buildChatRequest(chat(), llm, undefined, { tools: [fn], drop: 0, web: null }).tools,
    ).toEqual([fn]);
    const settings = { search: 'parallel:fast', calls: 5, contentTokens: 32768 } as const;
    const web = webToolsOf('search', settings);
    const sent = buildChatRequest(chat(), llm, undefined, { tools: [fn], drop: 0, web });
    expect(sent.tools).toEqual([fn, SEARCH, FETCH]);
    expect(sent.max_tool_calls).toBe(5);
  });

  it('取得のエンジンは使用ツールの提供元から決め、OpenRouter 自身の取得は使わない', () => {
    const base = { search: 'auto', calls: 3, contentTokens: 1000 } as const;
    expect(webToolsOf('search', base)?.tools).toEqual([
      { type: 'openrouter:web_search' },
      { type: 'openrouter:web_fetch', parameters: { max_content_tokens: 1000 } },
    ]);
    expect(webToolsOf('search', { ...base, search: 'exa:fast' })?.tools?.[1]).toEqual({
      type: 'openrouter:web_fetch',
      parameters: { engine: 'exa', max_content_tokens: 1000 },
    });
    expect(webToolsOf('search', { ...base, search: 'off' })).toBeNull();
  });

  it('検索はエンジンとモードの組で送り、知らない値は既定にする', () => {
    const base = { search: 'exa:deep', calls: 3, contentTokens: 1000 } as const;
    expect(webToolsOf('search', base)?.tools?.[0]).toEqual({
      type: 'openrouter:web_search',
      parameters: { engine: 'exa', mode: 'deep' },
    });
    expect(webToolsOf('search', { ...base, search: 'perplexity' })?.tools).toEqual([
      { type: 'openrouter:web_search', parameters: { engine: 'perplexity' } },
    ]);
    expect(['exa', 'x', 'exa:fast'].map(normalizeSearchEngine)).toEqual([
      'parallel:fast',
      'parallel:fast',
      'exa:fast',
    ]);
  });

  it('手数の上限は 1〜30、取得の本文の上限は 256〜200000 に収め、読めなければ既定', () => {
    expect([0, 3.6, 99, 'x'].map(normalizeWebCalls)).toEqual([1, 4, 30, 5]);
    expect([1, 300000, undefined].map(normalizeContentTokens)).toEqual([256, 200000, 32768]);
  });
});
