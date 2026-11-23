// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installLlmPort } from '@/store/ports/llm-port';
import { useChatStore } from '@/store/use-chat-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import {
  responseKey,
  TOOLING_GAP_MS,
  useResponseStatsStore,
} from '@/store/use-response-stats-store';

import {
  chat,
  fakeLlmPort,
  modelDetails,
  profile,
  setDefaultLlm,
  type FakeLlmPort,
} from '../helpers/llm';

let port: FakeLlmPort;

beforeEach(() => {
  port = fakeLlmPort();
  installLlmPort(port);
  setDefaultLlm();
  useLlmProfilesStore.setState({
    profiles: [profile()],
    checks: {
      p1: {
        kind: 'ok',
        models: ['model-a'],
        contexts: {},
        details: {
          'model-a': modelDetails({
            prices: [
              { name: 'prompt', usd: 0.000001, perToken: true },
              { name: 'completion', usd: -1, perToken: true },
              { name: 'input_cache_read', usd: 1e-7, perToken: true },
            ],
          }),
        },
        serverContext: null,
      },
    },
  });
  useChatStore.setState({ chats: {}, places: {}, saveStates: {}, pending: {}, drafts: {} });
  useResponseStatsStore.setState({ stats: {} });
  useChatStore.getState().put('c1', chat());
});

afterEach(() => {
  useChatStore.getState().unload('c1');
});

describe('受け取りの記録', () => {
  it('Web のツールを送っていなければ、処理中の注釈が届いても「ツールを実行中」にしない', () => {
    const store = useChatStore.getState();
    store.setDraft('c1', 'hello');
    store.send('c1');
    const last = useChatStore.getState().chats.c1?.messages.at(-1);
    const key = responseKey('c1', last?.id ?? '', last?.selected ?? 0);
    const tooling = () => useResponseStatsStore.getState().stats[key]?.tooling;
    port.emit({ kind: 'delta', content: '', reasoning: 'think' });
    const now = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + TOOLING_GAP_MS);
    port.emit({ kind: 'processing' });
    expect(tooling()).toBe(false);
    now.mockRestore();
    port.finish();
  });

  it('Web のツールを送ったときは、本文と思考が途切れた後の注釈で立て、次の本文か終わりで下ろす', () => {
    const stats = useResponseStatsStore.getState();
    const price = { prompt: null, completion: null, cacheRead: null, cacheWrite: null };
    const tooling = () => useResponseStatsStore.getState().stats.k?.tooling;
    stats.start('k', price, 0, true);
    stats.processing('k', 2000);
    expect(tooling()).toBe(false);
    stats.first('k', 100);
    stats.resume('k', 100);
    stats.processing('k', 100 + TOOLING_GAP_MS - 1);
    expect(tooling()).toBe(false);
    stats.processing('k', 100 + TOOLING_GAP_MS);
    expect(tooling()).toBe(true);
    stats.resume('k', 2000);
    expect(tooling()).toBe(false);
    stats.processing('k', 2000 + TOOLING_GAP_MS);
    stats.end('k', 4000);
    expect(tooling()).toBe(false);
  });

  it('送った時刻と費用を記録し、最初の本文で最初の時刻、終えたら終わりの時刻を入れる', async () => {
    const store = useChatStore.getState();
    store.setDraft('c1', 'hello');
    store.send('c1');
    const last = useChatStore.getState().chats.c1?.messages.at(-1);
    const key = responseKey('c1', last?.id ?? '', last?.selected ?? 0);
    const stats = () => useResponseStatsStore.getState().stats[key];
    expect(stats()?.price).toEqual({
      prompt: 0.000001,
      completion: null,
      cacheRead: 1e-7,
      cacheWrite: null,
    });
    expect(stats()?.firstAt).toBeNull();

    port.emit({ kind: 'delta', content: '', reasoning: '' });
    expect(stats()?.firstAt).toBeNull();
    port.emit({ kind: 'delta', content: 'Hi', reasoning: '' });
    const first = stats()?.firstAt;
    expect(first).not.toBeNull();
    port.emit({ kind: 'delta', content: '!', reasoning: '' });
    expect(stats()?.firstAt).toBe(first);

    port.finish();
    await vi.waitFor(() => expect(stats()?.endedAt).not.toBeNull());
    expect(Object.keys(useChatStore.getState().chats.c1?.messages.at(-1) ?? {})).not.toContain(
      'stats',
    );
  });
});
