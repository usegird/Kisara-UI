// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { appendTurn } from '@/chat/edit';
import { applyStreamEvents, finishStream } from '@/chat/stream-receive';
import { ChatPromptPanel } from '@/components/llm/side-panel/ChatPromptPanel';
import { useChatSidePanelStore } from '@/store/use-chat-side-panel-store';
import { useChatStore } from '@/store/use-chat-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';
import { chat, chatMessage } from '../helpers/llm';

// ─────────────────────────────
// 受け取り中に、プロンプトの列の項目を語ごとに描き直さない。
// 列が使うのは受け取り中の候補より前の発言だけなので、本文が届いても項目の一覧は描き直さない
// ─────────────────────────────

const listRenders = vi.hoisted(() => ({ count: 0 }));
// カードの欄（CardFieldsSection の挨拶の欄）の描き直し
const cardRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock('@/components/llm/message/StepSwitch', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/llm/message/StepSwitch')>();
  return {
    ...original,
    StepSwitch: (props: Parameters<typeof original.StepSwitch>[0]) => {
      cardRenders.count += 1;
      return original.StepSwitch(props);
    },
  };
});

vi.mock('@/components/llm/prompt/PromptItemList', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/llm/prompt/PromptItemList')>();
  return {
    ...original,
    PromptItemList: (props: Parameters<typeof original.PromptItemList>[0]) => {
      listRenders.count += 1;
      return original.PromptItemList(props);
    },
  };
});

afterEach(cleanup);

const answered = chat([chatMessage('u1', 'user', ['hi']), chatMessage('a1', 'assistant', ['A'])]);

function setChat(next: ReturnType<typeof chat>): void {
  useChatStore.setState({ chats: { c1: next } });
}

describe('ChatPromptPanel の受け取り中の描き直し', () => {
  it('本文が届いても項目の一覧を描き直さず、終えたら描き直す', () => {
    setChat(appendTurn(answered, { text: 'q', userId: 'u2', assistantId: 'a2' }));
    render(<ChatPromptPanel chatId="c1" />);
    const before = listRenders.count;
    expect(before, '一覧が描かれていない').toBeGreaterThan(0);

    for (let index = 0; index < 20; index += 1) {
      act(() => {
        const current = useChatStore.getState().chats.c1!;
        setChat(applyStreamEvents(current, [{ kind: 'delta', content: 'x', reasoning: '' }]));
      });
    }
    expect(listRenders.count).toBe(before);

    act(() => setChat(finishStream(useChatStore.getState().chats.c1!, null)));
    expect(listRenders.count).toBeGreaterThan(before);
  });

  it('メッセージを打っても一覧を描き直さず、合計とメッセージの見積もりだけが変わる', () => {
    setChat(answered);
    render(<ChatPromptPanel chatId="c1" />);
    const total = (): string => screen.getByText(/^合計 約/u).textContent;
    const inputRow = (): string =>
      screen.getByRole('button', { name: /^送信メッセージ/u }).textContent;
    const empty = total();
    act(() => useChatStore.getState().setDraft('c1', 'a'));
    // 空から打ち始めたときは、メッセージの行の見積もりを出すので一覧を 1 回描き直す
    const before = listRenders.count;
    for (let index = 0; index < 10; index += 1) {
      act(() => useChatStore.getState().setDraft('c1', 'a'.repeat(index + 2).concat(' word')));
    }
    expect(listRenders.count).toBe(before);
    expect(total()).not.toBe(empty);
    expect(inputRow()).toMatch(/\d/u);
  });

  it('本文が届いてもカードの欄を描き直さない', () => {
    setChat(appendTurn(answered, { text: 'q', userId: 'u2', assistantId: 'a2' }));
    render(<ChatPromptPanel chatId="c1" />);
    const before = cardRenders.count;
    expect(before, 'カードの欄が描かれていない').toBeGreaterThan(0);

    for (let index = 0; index < 20; index += 1) {
      act(() => {
        const current = useChatStore.getState().chats.c1!;
        setChat(applyStreamEvents(current, [{ kind: 'delta', content: 'x', reasoning: '' }]));
      });
    }
    expect(cardRenders.count).toBe(before);
  });
});

describe('ChatPromptPanel の開いている項目', () => {
  it('プリセットのリンクでは開かず、カードを読み込んだときだけ中身のある有効な項目を開いて出す', () => {
    const base = chat([chatMessage('u1', 'user', ['hi'])]);
    // 本文のある項目を 1 つ。ほかの文面の項目は本文が空なので開かない
    const items = base.prompt.items.map((item, at) =>
      at === 0 ? { ...item, content: 'X' } : item,
    );
    setChat({ ...base, prompt: { ...base.prompt, items }, preset: { id: 'p1', name: 'カード' } });
    const { container } = render(<ChatPromptPanel chatId="c1" />);
    expect(container.querySelectorAll('button[aria-expanded="true"]').length).toBe(0);
    act(() => useChatSidePanelStore.getState().requestExpand('c1'));
    // 本文のある項目と、追加辞書の印・会話履歴・メッセージ
    const filled = items.filter((item) => item.marker !== null || item.content !== '').length;
    expect(filled).toBe(4);
    expect(container.querySelectorAll('[aria-expanded="true"]').length).toBe(filled);
    // 開いたら頼みを外す（タブを出し直しても、もう一度は開かない）
    expect(useChatSidePanelStore.getState().expand).toBeNull();
  });
  it('開く行を添えた頼み（相談の案を反映したとき）は、すべて閉じてその行だけを開く', () => {
    const base = chat([chatMessage('u1', 'user', ['hi'])]);
    const items = base.prompt.items.map((item, at) =>
      at === 0 ? { ...item, content: 'X' } : item,
    );
    setChat({ ...base, prompt: { ...base.prompt, items } });
    const { container } = render(<ChatPromptPanel chatId="c1" />);
    act(() => useChatSidePanelStore.getState().requestExpand('c1'));
    expect(container.querySelectorAll('[aria-expanded="true"]').length).toBe(4);
    const target = items[1]!.id;
    act(() => useChatSidePanelStore.getState().requestExpand('c1', [target]));
    expect(container.querySelectorAll('[aria-expanded="true"]').length).toBe(1);
    expect(useChatSidePanelStore.getState().expand).toBeNull();
  });
});

describe('ChatPromptPanel の送る中身を見る', () => {
  it('合計の上のボタンで、次に送る messages を小さなダイアログに出す', () => {
    setChat(chat([chatMessage('u1', 'user', ['hello there'])]));
    render(<ChatPromptPanel chatId="c1" />);
    const button = screen.getByRole('button', { name: '送る生データを表示' });
    // 合計の行より前に置く
    const total = screen.getByText(/^合計 約/u);
    expect(button.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: '送る中身' });
    expect(within(dialog).getByText(/hello there/u)).toBeTruthy();
  });
  it('まとめる設定を変えると、生データの system のまとまりも変わる', () => {
    useSettingsStore.setState({ squashSystemMessages: false, llmSystemPrompt: 'SYS' });
    setChat(chat([chatMessage('u1', 'user', ['hi'])]));
    useChatStore.getState().updatePrompt('c1', (prompt) => ({
      ...prompt,
      items: prompt.items.map((item) => (item.id === 'rules' ? { ...item, content: 'R' } : item)),
    }));
    render(<ChatPromptPanel chatId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: '送る生データを表示' }));
    // 送る要求の本文。`messages` を見る
    const sent = (): unknown[] =>
      (
        JSON.parse(screen.getByRole('dialog').querySelector('pre')?.textContent ?? '{}') as {
          messages?: unknown[];
        }
      ).messages ?? [];
    expect(sent().slice(0, 2)).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'system', content: 'R' },
    ]);
    act(() => {
      useSettingsStore.setState({ squashSystemMessages: true });
    });
    expect(sent()[0]).toEqual({ role: 'system', content: 'SYS\nR' });
  });
});

describe('ChatPromptPanel の送る中身のダイアログの漏れ', () => {
  it('開け閉めを繰り返しても、閉じたダイアログを残さない', async () => {
    setChat(chat([chatMessage('u1', 'user', ['hello'])]));
    render(<ChatPromptPanel chatId="c1" />);
    const leak = leakWatch();
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '送る生データを表示' }));
        await Promise.resolve();
      });
      const dialog = await screen.findByRole('dialog', { name: '送る中身' });
      leak.watch(dialog);
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: '閉じる' }));
        await Promise.resolve();
      });
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});

describe('ChatPromptPanel のすべて開く・すべて閉じる', () => {
  it('プロンプト構成の見出しのリンクで、項目をまとめて開き、まとめて閉じる', () => {
    setChat(chat([chatMessage('u1', 'user', ['hi'])]));
    const { container } = render(<ChatPromptPanel chatId="c1" />);
    const opened = () => container.querySelectorAll('[aria-expanded="true"]').length;
    expect(screen.getByRole('heading', { name: 'プロンプト構成' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'すべて開く' }));
    // プリセットの名前の一覧（コンボボックス）は項目ではないので数えない
    const closed = [...container.querySelectorAll('[aria-expanded="false"]')]
      .map((element) => element.getAttribute('aria-label') ?? element.textContent ?? '')
      .filter((label) => !label.startsWith('プリセットの名前'));
    expect(closed).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(opened()).toBe(0);
  });
});
