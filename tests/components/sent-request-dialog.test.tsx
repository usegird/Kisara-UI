// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CallSentRequestButton,
  MessageSentRequestButton,
} from '@/components/llm/message/SentRequestDialog';
import { useChatStore } from '@/store/use-chat-store';
import { callRequestKey, useSentRequestsStore } from '@/store/use-sent-requests-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';
import { chat, chatMessage } from '../helpers/llm';

// ─────────────────────────────
// `user` の発言の送った中身のアイコン。続く応答の候補ごとに送った要求を出し、既定は
// 選んでいる候補。画面では data URL を縮め、開け閉めで閉じたダイアログを残さない
// ─────────────────────────────

afterEach(() => {
  cleanup();
  useSentRequestsStore.setState({ byKey: {} });
  useChatStore.setState({ chats: {} });
});

const IMAGE = `data:image/png;base64,${'A'.repeat(200)}`;

function sent(id: number, model: string, content: unknown, key: string): void {
  const body = JSON.stringify({ model, messages: [{ role: 'user', content }] });
  useSentRequestsStore.setState((state) => ({
    byKey: { ...state.byKey, [key]: { id, at: 0, model, body } },
  }));
}

async function open(button: HTMLElement): Promise<HTMLElement> {
  await act(async () => {
    fireEvent.click(button);
    await Promise.resolve();
  });
  return screen.findByRole('dialog', { name: '送った中身' });
}

const openButton = () => screen.getByRole('button', { name: '送った生データを表示' });
const bodyOf = (dialog: HTMLElement) => dialog.querySelector('pre')?.textContent ?? '';

describe('発言の送った中身のアイコン', () => {
  function setReply(selected: number): void {
    const messages = [
      chatMessage('u1', 'user', ['q']),
      chatMessage('a1', 'assistant', ['first', 'second'], selected),
    ];
    useChatStore.setState({ chats: { c1: chat(messages) } });
  }

  it('続く応答の候補ごとに送った要求を出し、既定は選んでいる候補。data URL は縮める', async () => {
    setReply(1);
    sent(1, 'for-first', [{ type: 'image_url', image_url: { url: IMAGE } }], 'c1/a1/0');
    sent(2, 'for-second', 'q', 'c1/a1/1');
    sent(3, 'elsewhere', 'other', 'c1/a9/0');
    render(<MessageSentRequestButton chatId="c1" messageId="u1" className="" />);
    const dialog = await open(openButton());
    expect(bodyOf(dialog)).toContain('"model": "for-second"');
    const choice = within(dialog).getByRole('combobox', { name: '出す要求' });
    const values = [...choice.querySelectorAll('option')].map((option) => option.value);
    expect(values).toEqual(['1', '2']);
    fireEvent.change(choice, { target: { value: '1' } });
    expect(bodyOf(dialog)).toContain('"model": "for-first"');
    expect(bodyOf(dialog)).toContain('(222 chars)');
    expect(bodyOf(dialog)).not.toContain('A'.repeat(100));
  });

  it('このページで送っていない発言と、応答の発言にはアイコンを出さない', () => {
    setReply(0);
    sent(1, 'elsewhere', 'other', 'c1/a9/0');
    render(<MessageSentRequestButton chatId="c1" messageId="u1" className="" />);
    render(<MessageSentRequestButton chatId="c1" messageId="a1" className="" />);
    expect(screen.queryByRole('button', { name: '送った生データを表示' })).toBeNull();
  });

  it('開け閉めを繰り返しても、閉じたダイアログを残さない', async () => {
    setReply(0);
    sent(1, 'model', 'hi', 'c1/a1/0');
    render(<MessageSentRequestButton chatId="c1" messageId="u1" className="" />);
    const leak = leakWatch();
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      const dialog = await open(openButton());
      leak.watch(dialog);
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: '閉じる' }));
        await Promise.resolve();
      });
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});

describe('呼び出しの欄の送った中身のアイコン', () => {
  it('作らせたときに送った要求を出し、作らせていない呼び出しにはアイコンを出さない', async () => {
    sent(1, 'for-call', 'q', callRequestKey('c1', 'call_a'));
    render(<CallSentRequestButton chatId="c1" callId="call_b" className="" />);
    expect(screen.queryByRole('button', { name: '送った生データを表示' })).toBeNull();
    cleanup();
    render(<CallSentRequestButton chatId="c1" callId="call_a" className="" />);
    const dialog = await open(openButton());
    expect(bodyOf(dialog)).toContain('"model": "for-call"');
  });
});
