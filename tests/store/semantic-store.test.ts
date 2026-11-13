import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installEmbeddingPort } from '@/store/ports/embedding-port';
import { installLlmPort } from '@/store/ports/llm-port';
import { refreshLorePreview, useChatStore } from '@/store/use-chat-store';
import { useDictionariesStore } from '@/store/use-dictionaries-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { semanticHitsOf, useSemanticStore } from '@/store/use-semantic-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { fakeEmbeddingPort, type FakeEmbeddingPort } from '../helpers/embedding';
import {
  chat,
  chatMessage,
  contentText,
  fakeLlmPort,
  loreEntry,
  profile,
  setDefaultLlm,
} from '../helpers/llm';

// ─────────────────────────────
// 近似判定のモデルの読み込みと、送るときの当たり
// ─────────────────────────────

let port: FakeEmbeddingPort;

beforeEach(() => {
  port = fakeEmbeddingPort();
  installEmbeddingPort(port);
  useSettingsStore.setState({ loreSemantic: true });
  useSemanticStore.setState({ stored: [] });
});

afterEach(async () => {
  await useSemanticStore.getState().disable();
  useSettingsStore.setState({ loreSemantic: false });
});

const sources = [
  {
    id: 'book',
    entries: [
      loreEntry({ logic: 'rag', content: 'The treasure lies below.' }),
      loreEntry({ logic: 'rag', content: 'The gate closes at dusk.' }),
      loreEntry({ content: 'A dragon sleeps.' }),
    ],
  },
];

const talk = (text: string) => [chatMessage('m1', 'user', [text])];

describe('読み込み', () => {
  it('読めたら使える状態にし、読めなければ理由を残す', async () => {
    await useSemanticStore.getState().load();
    expect(useSemanticStore.getState()).toMatchObject({ status: 'ready', progress: 1 });

    installEmbeddingPort(fakeEmbeddingPort({ ok: false, message: 'offline' }));
    await useSemanticStore.getState().load();
    expect(useSemanticStore.getState()).toMatchObject({ status: 'failed', error: 'offline' });
  });
  it('無効にするとメモリから降ろし、落とした物は残す', async () => {
    await useSemanticStore.getState().load();
    expect(useSemanticStore.getState().stored).toHaveLength(1);
    await useSemanticStore.getState().disable();
    expect(useSemanticStore.getState().status).toBe('off');
    expect(port.unloaded()).toBe(1);
    expect(port.removed).toEqual([]);
    expect(useSemanticStore.getState().stored).toHaveLength(1);
  });

  it('使っているモデルを消すと近似判定も無効にし、ほかのモデルは消すだけ', async () => {
    installEmbeddingPort(
      (port = fakeEmbeddingPort(null, [{ id: 'other/model', bytes: 1024 * 1024 }])),
    );
    await useSemanticStore.getState().load();
    const loaded = useSemanticStore.getState().loadedId ?? '';

    await useSemanticStore.getState().remove('other/model');
    expect(useSemanticStore.getState().status).toBe('ready');
    expect(useSemanticStore.getState().stored.map((entry) => entry.id)).toEqual([loaded]);

    await useSemanticStore.getState().remove(loaded);
    expect(useSettingsStore.getState().loreSemantic).toBe(false);
    expect(useSemanticStore.getState().status).toBe('off');
    expect(port.removed).toEqual(['other/model', loaded]);
    expect(useSemanticStore.getState().stored).toEqual([]);
  });
});

describe('当たり', () => {
  it('有効でない・読めていないときは待たずに null を返す', async () => {
    expect(semanticHitsOf(sources, talk('treasure?'))).toBeNull();
    await useSemanticStore.getState().load();
    useSettingsStore.setState({ loreSemantic: false });
    expect(semanticHitsOf(sources, talk('treasure?'))).toBeNull();
  });

  it('意味の近い近似判定の項目だけを当て、本文の埋め込みは覚えて計算し直さない', async () => {
    await useSemanticStore.getState().load();
    const hits = await semanticHitsOf(sources, talk('Where is the treasure?'));
    expect([...(hits?.get('book') ?? [])]).toEqual([0]);

    await semanticHitsOf(sources, talk('Open the gate'));
    const passages = port.embedded.filter((item) => item.kind === 'passage');
    expect(passages).toHaveLength(1);
    expect(passages[0]?.texts).toHaveLength(2);
  });

  it('今の発言で当たれば、直前の話題には引かれない', async () => {
    await useSemanticStore.getState().load();
    const messages = [
      chatMessage('m1', 'assistant', ['The treasure is guarded below.']),
      chatMessage('m2', 'user', ['Open the gate']),
    ];
    const hits = await semanticHitsOf(sources, messages);
    expect([...(hits?.get('book') ?? [])]).toEqual([1]);
  });

  it('今の発言で何も当たらなければ、直前の発言とつないで比べ直す', async () => {
    await useSemanticStore.getState().load();
    const messages = [
      chatMessage('m1', 'assistant', ['The treasure is guarded below.']),
      chatMessage('m2', 'user', ['Is that true?']),
    ];
    const hits = await semanticHitsOf(sources, messages);
    expect([...(hits?.get('book') ?? [])]).toEqual([0]);
    expect(port.embedded.filter((item) => item.kind === 'query').at(-1)?.texts).toEqual([
      'The treasure is guarded below.\nIs that true?',
    ]);
  });

  it('どの項目とも近くなければ当てない', async () => {
    await useSemanticStore.getState().load();
    const hits = await semanticHitsOf(sources, talk('hello there'));
    expect(hits?.size).toBe(0);
  });
});

describe('見込み', () => {
  it('会話履歴と打ちかけのメッセージで当て、比べる物が同じなら計算し直さない', async () => {
    await useSemanticStore.getState().load();
    useSemanticStore.getState().preview('c1', sources, talk('hello'), 'treasure?');
    await expect
      .poll(() => [...(useSemanticStore.getState().previews.c1?.hits.get('book') ?? [])])
      .toEqual([0]);
    const queries = port.embedded.filter((item) => item.kind === 'query').length;
    useSemanticStore.getState().preview('c1', sources, talk('hello'), 'treasure?');
    expect(port.embedded.filter((item) => item.kind === 'query')).toHaveLength(queries);
  });
});

describe('送るとき', () => {
  it('近似判定で当たった項目を送る中身に入れる', async () => {
    const llm = fakeLlmPort();
    installLlmPort(llm);
    useLlmProfilesStore.setState({ profiles: [profile()] });
    setDefaultLlm();
    const entries = [
      loreEntry({
        logic: 'rag',
        depth: { depth: 0, role: 'system' },
        content: 'Treasure below.',
      }),
    ];
    useDictionariesStore.setState({
      dictionaries: { d1: { id: 'd1', name: 'D', entries, createdAt: 0, updatedAt: 0 } },
      loaded: true,
    });
    useSettingsStore.setState({ loreDictionaryIds: ['d1'] });
    await useSemanticStore.getState().load();
    useChatStore.getState().put('c1', chat());

    useChatStore.getState().setDraft('c1', 'Any treasure here?');
    // 入力欄から焦点が外れたときに、打ちかけの本文で見込みを作る
    refreshLorePreview('c1');
    await expect
      .poll(() => useSemanticStore.getState().previews.c1?.hits.get('d1')?.has(0))
      .toBe(true);
    useChatStore.getState().send('c1');
    await expect.poll(() => llm.requests.length).toBe(1);
    const sent = llm.requests[0]?.messages.map(contentText).join(' ');
    expect(sent).toContain('Treasure below.');

    useChatStore.getState().unload('c1');
    useSettingsStore.setState({ loreDictionaryIds: [] });
  });
});
