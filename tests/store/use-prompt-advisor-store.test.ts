import { beforeEach, describe, expect, it } from 'vitest';

import { installLlmPort } from '@/store/ports/llm-port';
import { useChatSidePanelStore } from '@/store/use-chat-side-panel-store';
import { useChatStore } from '@/store/use-chat-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { formatGreeting, usePromptAdvisorStore } from '@/store/use-prompt-advisor-store';
import { useWebSearchStore } from '@/store/use-web-search-store';

import {
  chat,
  contentText,
  fakeLlmPort,
  profile,
  setDefaultLlm,
  type FakeLlmPort,
} from '../helpers/llm';

// ─────────────────────────────
// 構成の相談の始め方・やり取り・案の反映と元に戻す
// ─────────────────────────────

let port: FakeLlmPort;

const rules = (): string | undefined =>
  useChatStore.getState().chats.c1?.prompt.items.find((item) => item.id === 'rules')?.content;

const session = (id: string) => usePromptAdvisorStore.getState().sessions[id];

beforeEach(() => {
  port = fakeLlmPort();
  installLlmPort(port);
  useLlmProfilesStore.setState({ profiles: [profile()], checks: {}, learned: {} });
  setDefaultLlm();
  useChatStore.setState({ chats: { c1: chat() } });
  usePromptAdvisorStore.setState({ sessions: {} });
});

describe('構成の相談の始め方', () => {
  it('送っていない相談があれば開き直し、送った相談しか無ければ新しく始めて前の欄を閉じる', async () => {
    const store = usePromptAdvisorStore.getState();
    const first = store.start('c1');
    store.setOpen(first, false);
    expect(store.start('c1')).toBe(first);
    expect(session(first)?.isOpen).toBe(true);

    store.setDraft(first, 'x');
    const sending = store.send(first);
    const second = store.start('c1');
    expect(second).not.toBe(first);
    expect(session(first)?.isOpen).toBe(false);
    expect(session(second)?.isOpen).toBe(true);
    port.finish();
    await sending;
  });
});

describe('構成の相談のやり取り', () => {
  it('選んだ初期メッセージを最初の LLM の発言として送り、流し込んだ本文と使ったトークン数を入れる', async () => {
    const store = usePromptAdvisorStore.getState();
    const id = store.start('c1');
    store.stepGreeting(id, 1);
    store.setDraft(id, 'Help me');
    const sending = store.send(id);
    const sent = port.requests[0]?.messages ?? [];
    // 案を書かせるツールだけを付ける（Web は切っている）
    const names = port.requests[0]?.tools?.map((tool) =>
      'function' in tool ? tool.function.name : tool.type,
    );
    expect(names).toEqual(['propose_prompt_changes']);
    // 初期メッセージは見せる文の後ろに付加情報を埋め込んで送る
    const greeting = sent.at(-2);
    expect(greeting?.role).toBe('assistant');
    const content = greeting === undefined ? '' : contentText(greeting);
    expect(content.startsWith(`${formatGreeting(1)}\n\n`)).toBe(true);
    expect(content).toContain('kisara-context\n');
    expect(sent.at(-1)).toEqual({ role: 'user', content: 'Help me' });
    port.emit({ kind: 'delta', content: 'Su', reasoning: '' });
    port.emit({ kind: 'delta', content: 're', reasoning: '' });
    port.emit({ kind: 'usage', usage: { prompt: 900, completion: 40 } });
    port.finish();
    await sending;
    expect(session(id)?.messages.map((message) => message.content)).toEqual(['Help me', 'Sure']);
    expect(session(id)?.messages.at(-1)?.usage).toEqual({ prompt: 900, completion: 40 });
    expect(session(id)?.streaming).toBe(false);
    // 送った後は初期メッセージを替えない
    store.stepGreeting(id, 1);
    expect(session(id)?.greeting).toBe(1);
  });

  it('思考の本文・Web のツールの回数と費用・出典を返った発言に添える。Web は会話と別に切り替える', async () => {
    useLlmProfilesStore.setState({
      profiles: [profile({ baseUrl: 'https://openrouter.ai/api/v1' })],
    });
    useWebSearchStore.setState({
      modes: { chat: 'off', advisor: 'search' },
      agreed: true,
    });
    const store = usePromptAdvisorStore.getState();
    const id = store.start('c1');
    store.setDraft(id, 'Look it up');
    const sending = store.send(id);
    await expect.poll(() => port.requests.length).toBe(1);
    // 案を書かせるツールと、Web の検索・取得
    expect(port.requests[0]?.tools).toHaveLength(3);
    port.emit({ kind: 'delta', content: 'A', reasoning: 'think' });
    port.emit({ kind: 'citations', citations: [{ url: 'https://a.example', title: 'A' }] });
    port.emit({ kind: 'citations', citations: [{ url: 'https://a.example', title: 'again' }] });
    port.emit({ kind: 'billing', billing: { searches: 1 } });
    port.emit({ kind: 'billing', billing: { cost: 0.01 } });
    port.finish();
    await sending;
    const reply = session(id)?.messages.at(-1);
    expect(reply?.reasoning).toBe('think');
    expect(reply?.citations).toEqual([{ url: 'https://a.example', title: 'A' }]);
    expect(reply?.billing).toEqual({ searches: 1, cost: 0.01 });
    useWebSearchStore.setState({ modes: { chat: 'off', advisor: 'off' }, agreed: false });
  });

  // 決まったことを入れるリンクは定型の文を送り、打ちかけは残す
  it('文を渡して送ると、その文を送り、打ちかけは残す', async () => {
    const store = usePromptAdvisorStore.getState();
    const id = store.start('c1');
    store.setDraft(id, 'half');
    const sending = store.send(id, 'Put it in.');
    expect(port.requests[0]?.messages.at(-1)).toEqual({ role: 'user', content: 'Put it in.' });
    port.finish();
    await sending;
    expect(session(id)?.draft).toBe('half');
    expect(session(id)?.messages[0]?.content).toBe('Put it in.');
  });

  it('相談を終えると受け取りを止め、やり取りを捨てる', async () => {
    const store = usePromptAdvisorStore.getState();
    const id = store.start('c1');
    store.setDraft(id, 'x');
    const sending = store.send(id);
    store.end(id);
    await sending;
    expect(session(id)).toBeUndefined();
  });
});
describe('付加情報と要約', () => {
  const greetingOf = (index: number): string => {
    const greeting = port.requests[index]?.messages.find((message) => message.role === 'assistant');
    return greeting === undefined ? '' : contentText(greeting);
  };

  const sendText = async (id: string, text: string): Promise<void> => {
    usePromptAdvisorStore.getState().setDraft(id, text);
    const sending = usePromptAdvisorStore.getState().send(id);
    port.emit({ kind: 'delta', content: `re ${text}`, reasoning: '' });
    port.finish();
    await sending;
  };

  it('2 通目からも初めて送った付加情報を送る（間に構成を直しても作り直さない）', async () => {
    const id = usePromptAdvisorStore.getState().start('c1');
    await sendText(id, 'one');
    useChatStore.getState().updatePrompt('c1', (prompt) => ({
      ...prompt,
      items: prompt.items.map((item) =>
        item.id === 'rules' ? { ...item, content: 'CHANGED' } : item,
      ),
    }));
    await sendText(id, 'two');
    expect(greetingOf(1)).toBe(greetingOf(0));
    expect(greetingOf(1)).not.toContain('CHANGED');
    expect(session(id)?.sentContext).toBeDefined();
  });

  it('要約すると最後の 1 往復の手前までを縮め、次からは要約と残した発言だけを送る', async () => {
    const id = usePromptAdvisorStore.getState().start('c1');
    for (const text of ['a', 'b']) await sendText(id, text);
    const summarizing = usePromptAdvisorStore.getState().summarize(id);
    expect(session(id)?.summarizing).toBe(true);
    const request = port.requests.at(-1)?.messages ?? [];
    expect(request[1] === undefined ? '' : contentText(request[1])).toContain('User: a');
    port.emit({ kind: 'delta', content: 'SUM', reasoning: '' });
    port.finish();
    await summarizing;
    expect(session(id)?.summary).toEqual({ content: 'SUM', upTo: session(id)?.messages[1]?.id });
    expect(session(id)?.summarizing).toBe(false);

    await sendText(id, 'c');
    const sent = (port.requests.at(-1)?.messages ?? []).map((message) => contentText(message));
    expect(sent).toContain('[Summary: SUM]');
    expect(sent).not.toContain('a');
    expect(sent).toContain('b');
  });
});
describe('案を書かせるツールの呼び出し', () => {
  const args = JSON.stringify({
    title: 'T',
    changes: [{ target: 'item', id: 'rules', content: 'N' }],
  });

  it('呼び出しを受け取って id を付け直し、次の送信で反映したかを結果として返す', async () => {
    const store = usePromptAdvisorStore.getState();
    const id = store.start('c1');
    store.setDraft(id, 'Make rules');
    const first = store.send(id);
    port.emit({
      kind: 'tool-call',
      index: 0,
      id: '',
      name: 'propose_prompt_changes',
      arguments: '',
    });
    port.emit({ kind: 'tool-call', index: 0, id: '', name: '', arguments: args });
    port.finish();
    await first;
    const reply = session(id)?.messages.at(-1);
    const call = reply?.toolCalls?.[0];
    expect(call?.id).toBe(`call_${reply?.id ?? ''}_0`);
    expect(call?.arguments).toBe(args);

    const resultsOf = async (text: string): Promise<string[]> => {
      usePromptAdvisorStore.getState().setDraft(id, text);
      const sending = usePromptAdvisorStore.getState().send(id);
      const sent = port.requests.at(-1)?.messages ?? [];
      port.finish();
      await sending;
      return sent.flatMap((message) => (message.role === 'tool' ? [message.content] : []));
    };
    expect(await resultsOf('next')).toEqual([
      'Shown to the user as a proposal card. Not applied yet.',
    ]);
    usePromptAdvisorStore.getState().apply(id, `${reply?.id ?? ''}:call:${call?.id ?? ''}`, {
      title: 'T',
      changes: [{ target: 'item', id: 'rules', content: 'N' }],
    });
    expect(await resultsOf('again')).toEqual(['The user applied this proposal.']);
  });
});

describe('案の反映', () => {
  it('反映するとプロンプトのタブに、変えた行だけを開く頼みを出す', () => {
    const store = usePromptAdvisorStore.getState();
    const id = store.start('c1');
    store.apply(id, 'm:0', { title: '', changes: [{ target: 'item', id: 'rules', content: 'N' }] });
    expect(useChatSidePanelStore.getState().expand).toMatchObject({
      chatId: 'c1',
      rows: ['rules'],
    });
  });

  it('反映すると会話に当て、元に戻すと直前の値に戻す', () => {
    const store = usePromptAdvisorStore.getState();
    const id = store.start('c1');
    const applied = store.apply(id, 'm:0', {
      title: '',
      changes: [{ target: 'item', id: 'rules', content: 'NEW' }],
    });
    expect(applied).toBe(1);
    expect(rules()).toBe('NEW');
    store.revert(id, 'm:0');
    expect(rules()).toBe('');
    expect(session(id)?.applied['m:0']).toBeUndefined();
  });
});
