// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { directionOf } from '@/chat/playbook-text';
import { updatePrefill } from '@/chat/prompt';
import { installLlmPort } from '@/store/ports/llm-port';
import { useChatStore } from '@/store/use-chat-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

import {
  chat,
  chatMessage,
  fakeLlmPort,
  profile,
  setDefaultLlm,
  type FakeLlmPort,
} from '../helpers/llm';

let port: FakeLlmPort;

beforeEach(() => {
  port = fakeLlmPort();
  installLlmPort(port);
  useLlmProfilesStore.setState({ profiles: [profile()] });
  useChatStore.setState({ chats: {}, places: {}, saveStates: {}, pending: {}, drafts: {} });
  useChatStore.getState().put('c1', chat());
  setDefaultLlm();
});

afterEach(() => {
  useChatStore.getState().unload('c1');
  vi.useRealTimers();
});

const current = () => useChatStore.getState().chats.c1;

async function nextFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
}

describe('送って受け取る', () => {
  it('打ちかけの本文を送り、届いた分を画面の間隔でまとめて足し、終えたら閉じる', async () => {
    const store = useChatStore.getState();
    store.setDraft('c1', 'hello');
    store.send('c1');
    expect(useChatStore.getState().drafts.c1).toBe('');
    expect(port.requests[0]?.messages).toEqual([{ role: 'user', content: 'hello' }]);

    port.emit({ kind: 'delta', content: 'He', reasoning: '' });
    port.emit({ kind: 'delta', content: 'y', reasoning: '' });
    expect(current()?.messages.at(-1)?.candidates[0]?.content).toBe('');
    await nextFrame();
    expect(current()?.messages.at(-1)?.candidates[0]?.content).toBe('Hey');

    port.finish();
    await vi.waitFor(() =>
      expect(current()?.messages.at(-1)?.candidates[0]?.end.kind).toBe('done'),
    );
    expect(current()?.updatedAt).toBeGreaterThan(0);
  });

  it('プレフィルを最後に送り、受け取る候補をプレフィルで始める', async () => {
    const store = useChatStore.getState();
    store.updatePrompt('c1', (prompt) => updatePrefill(prompt, { content: '[', enabled: true }));
    store.setDraft('c1', 'list');
    store.send('c1');
    expect(port.requests[0]?.messages.at(-1)).toEqual({ role: 'assistant', content: '[' });
    port.emit({ kind: 'delta', content: '1]', reasoning: '' });
    await nextFrame();
    expect(current()?.messages.at(-1)?.candidates[0]?.content).toBe('[1]');
  });

  it('止めたら受け取った分を残して止めた印を付ける', async () => {
    const store = useChatStore.getState();
    store.setDraft('c1', 'q');
    store.send('c1');
    port.emit({ kind: 'delta', content: 'part', reasoning: '' });
    store.stop('c1');
    await vi.waitFor(() =>
      expect(current()?.messages.at(-1)?.candidates[0]).toMatchObject({
        content: 'part',
        end: { kind: 'stopped' },
      }),
    );
  });

  it('受け取り中は続けて送らない。モデルが無ければ送らない', () => {
    const store = useChatStore.getState();
    store.setDraft('c1', 'one');
    store.send('c1');
    store.setDraft('c1', 'two');
    store.send('c1');
    expect(port.requests).toHaveLength(1);

    useSettingsStore.setState({ llmModel: '' });
    useChatStore.getState().put('c2', chat([]));
    store.setDraft('c2', 'x');
    store.send('c2');
    expect(port.requests).toHaveLength(1);
    store.unload('c2');
  });

  it('生成し直すと最後の assistant に候補を足し、手前までを送る', () => {
    useChatStore
      .getState()
      .put('c1', chat([chatMessage('u1', 'user', ['hi']), chatMessage('a1', 'assistant', ['A'])]));
    useChatStore.getState().regenerate('c1');
    expect(current()?.messages.at(-1)?.candidates).toHaveLength(2);
    expect(port.requests[0]?.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('送らない注記（<comment>）は、送った発言にも作り直しの指示にも残さない', () => {
    const store = useChatStore.getState();
    store.setDraft('c1', 'hello\n<comment>note</comment>');
    store.send('c1');
    expect(current()?.messages.at(-2)?.candidates[0]?.content).toBe('hello');
    useChatStore
      .getState()
      .put('c1', chat([chatMessage('u1', 'user', ['hi']), chatMessage('a1', 'assistant', ['A'])]));
    useChatStore.getState().setDraft('c1', 'Shorter.\n<comment>Press regenerate.</comment>');
    useChatStore.getState().regenerate('c1');
    expect(current()?.messages.at(-1)?.candidates[1]?.revision?.instruction).toBe('Shorter.');
    expect(useChatStore.getState().drafts.c1).toBe('');
  });

  it('注記の枠は、指示の枠を外したときと、入力欄が空でも作り直したときに外す', () => {
    const store = useChatStore.getState();
    store.fillDirection('c1', ['Go on.'], directionOf(null));
    store.setDraftNote('c1', 'note');
    store.clearDirection('c1');
    expect(useChatStore.getState().draftNotes.c1).toBeUndefined();
    store.put(
      'c1',
      chat([chatMessage('u1', 'user', ['hi']), chatMessage('a1', 'assistant', ['A'])]),
    );
    store.setDraftNote('c1', 'note');
    store.regenerate('c1');
    expect(useChatStore.getState().draftNotes.c1).toBeUndefined();
  });

  it('失敗した応答のもう一度は、候補を足さずにその候補へ書き直す', async () => {
    const failed = chatMessage('a1', 'assistant', ['A', '']);
    const last = {
      ...failed,
      selected: 1,
      candidates: [
        failed.candidates[0]!,
        {
          ...failed.candidates[1]!,
          end: { kind: 'failed' as const, failure: { kind: 'server' as const } },
        },
      ],
    };
    useChatStore.getState().put('c1', chat([chatMessage('u1', 'user', ['hi']), last]));
    useChatStore.getState().retry('c1');
    const message = current()?.messages.at(-1);
    expect(message?.candidates.map((candidate) => candidate.end.kind)).toEqual([
      'done',
      'streaming',
    ]);
    expect(message?.selected).toBe(1);
    port.emit({ kind: 'delta', content: 'B', reasoning: '' });
    port.finish();
    await vi.waitFor(() => expect(current()?.messages.at(-1)?.candidates[1]?.content).toBe('B'));
  });

  it('タブを閉じると受け取りを止める', () => {
    const store = useChatStore.getState();
    store.setDraft('c1', 'q');
    store.send('c1');
    const pending = port.requests.length;
    store.unload('c1');
    expect(pending).toBe(1);
    expect(useChatStore.getState().chats.c1).toBeUndefined();
  });
});

describe('全体の生成の設定', () => {
  it('決めた項目を送る中身に入れる', () => {
    useSettingsStore.getState().setLlmParam('temperature', 0.3);
    useChatStore.getState().setDraft('c1', 'q');
    useChatStore.getState().send('c1');
    expect(port.requests[0]).toMatchObject({ model: 'model-a', temperature: 0.3 });
  });
});

describe('容量の不足', () => {
  it('置き場に書けない会話は、送る・生成し直すを止める', () => {
    useChatStore.getState().setSaveState('c1', 'full');
    const store = useChatStore.getState();
    store.setDraft('c1', 'q');
    store.send('c1');
    store.regenerate('c1');
    expect(port.requests).toHaveLength(0);
    expect(useChatStore.getState().drafts.c1).toBe('q');
  });
});

describe('添えた画像', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';

  it('打ちかけに添えた画像を本文と一緒に送り、送ったら打ちかけから外す', () => {
    const store = useChatStore.getState();
    store.addDraftImages('c1', [png]);
    store.setDraft('c1', 'see');
    store.send('c1');
    expect(useChatStore.getState().draftImages.c1).toBeUndefined();
    expect(port.requests[0]?.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'see' },
          { type: 'image_url', image_url: { url: png } },
        ],
      },
    ]);
    expect(current()?.messages[0]?.candidates[0]?.images).toEqual([png]);
  });

  it('本文が空でも画像があれば送る。外した画像は送らない', () => {
    const store = useChatStore.getState();
    store.addDraftImages('c1', [png, png.replace('iVBOR', 'AAAAA')]);
    store.removeDraftImage('c1', 1);
    expect(useChatStore.getState().draftImages.c1).toEqual([png]);
    store.send('c1');
    expect(port.requests[0]?.messages).toEqual([
      { role: 'user', content: [{ type: 'image_url', image_url: { url: png } }] },
    ]);
  });
});
