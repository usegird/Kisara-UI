// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ChatMessage } from '@/chat/types';
import { ChatMessageItem } from '@/components/llm/message/ChatMessageItem';
import { SummarizeButton } from '@/components/llm/prompt/ChatSummaryField';
import { ChatPromptPanel } from '@/components/llm/side-panel/ChatPromptPanel';
import { useChatStore } from '@/store/use-chat-store';
import { useChatSummaryStore } from '@/store/use-chat-summary-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';

import { chat, chatTurns, profile, setDefaultLlm } from '../helpers/llm';

// ─────────────────────────────
// 会話履歴の件数・要約の欄・外して送った知らせ
// ─────────────────────────────

afterEach(cleanup);

beforeEach(() => {
  useLlmProfilesStore.setState({ profiles: [profile()], checks: {}, learned: {} });
  useChatSummaryStore.setState({ states: {} });
  setDefaultLlm();
});

/** 最後の発言に、使ったトークン数と外した件数を持たせた会話 */
function answered(prompt: number, trimmed?: number): ChatMessage[] {
  const messages = chatTurns(10);
  const last = messages.at(-1)!;
  const candidate = { ...last.candidates[0]!, usage: { prompt, completion: 1 }, trimmed };
  return [...messages.slice(0, -1), { ...last, candidates: [candidate] }];
}

describe('セッション要約とセッション履歴の行', () => {
  it('要約の行は「要約 M 件」、履歴の行は「履歴 N 件、除外 K 件」で、要約の行が履歴の上', () => {
    const base = chat(chatTurns(10), { summary: { content: 'S', upTo: 'm3' } });
    useChatStore.setState({ chats: { c1: base } });
    const { unmount } = render(<ChatPromptPanel chatId="c1" />);
    const names = screen
      .getAllByText(/^セッション(要約|履歴)$|^送信メッセージ$/)
      .map((el) => el.textContent);
    expect(names).toEqual(['セッション要約', 'セッション履歴', '送信メッセージ']);
    expect(screen.getByText('要約 4 件')).toBeTruthy();
    expect(screen.getByText('履歴 6 件、除外 0 件')).toBeTruthy();
    unmount();

    useLlmProfilesStore.getState().learnContext('p1', 'model-a', 80);
    render(<ChatPromptPanel chatId="c1" />);
    expect(screen.getByText(/^履歴 \d+ 件、除外 [1-9]\d* 件$/)).toBeTruthy();
  });

  it('前回の送信が上限を超えていれば、警告の色で出す', () => {
    useChatStore.setState({ chats: { c1: chat(answered(5000)) } });
    useLlmProfilesStore.getState().learnContext('p1', 'model-a', 4096);
    render(<ChatPromptPanel chatId="c1" />);
    expect(screen.getByText(/^前回の送信 5,?000$/).className).toContain('text-destructive');
  });

  it('要約の行を開くと要約の欄だけを出し、直すと会話の要約に効く', () => {
    const base = chat(chatTurns(10), { summary: { content: 'S', upTo: 'm3' } });
    useChatStore.setState({ chats: { c1: base } });
    render(<ChatPromptPanel chatId="c1" />);
    fireEvent.click(screen.getByText('要約 4 件'));
    fireEvent.change(screen.getByLabelText('要約の本文'), { target: { value: 'T' } });
    expect(useChatStore.getState().chats.c1?.summary?.content).toBe('T');
    expect(screen.queryByRole('button', { name: '要約する' })).toBeNull();
    expect(screen.queryByRole('button', { name: '要約を消す' })).toBeNull();
  });

  it('「要約する」はセッション履歴の行を開いた中の、最初の「履歴 N 件」の行の右端に出す', () => {
    useChatStore.setState({ chats: { c1: chat(chatTurns(10)) } });
    render(<ChatPromptPanel chatId="c1" />);
    fireEvent.click(screen.getByText(/^履歴 \d+ 件、除外 \d+ 件$/));
    const button = screen.getByRole('button', { name: '要約する' });
    // 「履歴 N 件」と同じ行に並ぶ
    expect(button.closest('li')?.textContent).toMatch(/^履歴 \d+ 件/u);
  });
});

describe('「要約する」の右', () => {
  const response = { usage: { prompt: 300, completion: 20 }, timing: { firstMs: 500 } };

  it('要約している間は処理中の印を回し、応答の情報は出さない', () => {
    const base = chat(chatTurns(10), { summary: { content: 'S', upTo: 'm3', response } });
    useChatStore.setState({ chats: { c1: base } });
    useChatSummaryStore.setState({ states: { c1: { kind: 'running' } } });
    const { container } = render(<SummarizeButton chatId="c1" />);
    expect(screen.getByRole('button', { name: '要約しています…' })).toBeTruthy();
    expect(container.querySelector('.motion-safe\\:animate-spin')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '応答の情報を見る' })).toBeNull();
  });

  it('作り終えたら i を出し、押すとトークンと時間の 1 行を出す', () => {
    const base = chat(chatTurns(10), { summary: { content: 'S', upTo: 'm3', response } });
    useChatStore.setState({ chats: { c1: base } });
    const { container } = render(<SummarizeButton chatId="c1" />);
    expect(container.querySelector('.motion-safe\\:animate-spin')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '応答の情報を見る' }));
    const stats = screen.getByRole('group', { name: '応答の情報' });
    expect(stats.textContent).toContain('入力 300 / 出力 20');
    expect(stats.textContent).toContain('0.5 秒');
  });

  it('記録の無い要約には i を出さない', () => {
    useChatStore.setState({
      chats: { c1: chat(chatTurns(10), { summary: { content: 'S', upTo: 'm3' } }) },
    });
    render(<SummarizeButton chatId="c1" />);
    expect(screen.queryByRole('button', { name: '応答の情報を見る' })).toBeNull();
  });
});

describe('除外して送った知らせ', () => {
  it('外した候補の下に件数と「要約する」を出す', () => {
    useChatStore.setState({ chats: { c1: chat(answered(100, 3)) } });
    render(
      <ChatMessageItem
        chatId="c1"
        messageId="m9"
        last
        canGenerate
        canRollback
        onRollback={() => undefined}
        onFork={() => undefined}
      />,
    );
    expect(screen.getByText(/古い履歴 3 件を除外して送りました/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '要約する' })).toBeTruthy();
  });
});
describe('上限に近い知らせ', () => {
  const lastItem = (): React.ReactElement => (
    <ChatMessageItem
      chatId="c1"
      messageId="m9"
      last
      canGenerate
      canRollback
      onRollback={() => undefined}
      onFork={() => undefined}
    />
  );

  it('使った数が送れる上限（文脈長 − 返答の分）の 8 割以上なら、外す前に「要約する」を出す', () => {
    // 文脈長 8000・max_tokens なし → 送れる上限 6000、8 割は 4800
    useLlmProfilesStore.getState().learnContext('p1', 'model-a', 8000);
    useChatStore.setState({ chats: { c1: chat(answered(4900)) } });
    const { unmount } = render(lastItem());
    expect(screen.getByText(/送れる上限に近づいています/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '要約する' })).toBeTruthy();
    unmount();

    useChatStore.setState({ chats: { c1: chat(answered(4000)) } });
    render(lastItem());
    expect(screen.queryByText(/送れる上限に近づいています/)).toBeNull();
  });

  it('外した知らせが出ているときは重ねない', () => {
    useLlmProfilesStore.getState().learnContext('p1', 'model-a', 8000);
    useChatStore.setState({ chats: { c1: chat(answered(5500, 2)) } });
    render(lastItem());
    expect(screen.queryByText(/送れる上限に近づいています/)).toBeNull();
    expect(screen.getAllByRole('button', { name: '要約する' })).toHaveLength(1);
  });
});
describe('応答の注記', () => {
  it('本文の外の話は書かれた位置に畳んだ「注記」で出し、本文はそのまま出す', () => {
    const messages = chatTurns(2);
    const last = messages.at(-1)!;
    const content = '<comment>Sure.</comment>\nRain fell.\n<comment>Next?</comment>';
    const candidate = { ...last.candidates[0]!, content };
    useChatStore.setState({
      chats: { c1: chat([...messages.slice(0, -1), { ...last, candidates: [candidate] }]) },
    });
    const { container } = render(
      <ChatMessageItem
        chatId="c1"
        messageId={last.id}
        last
        canGenerate
        canRollback
        onRollback={() => undefined}
        onFork={() => undefined}
      />,
    );
    const notes = [...container.querySelectorAll('details')];
    expect(notes.map((note) => note.open)).toEqual([false, false]);
    expect(notes.map((note) => note.textContent)).toEqual(['注記Sure.', '注記Next?']);
    expect(screen.getByText('Rain fell.')).toBeTruthy();
    expect(container.textContent).not.toContain('<comment>');
  });
});
