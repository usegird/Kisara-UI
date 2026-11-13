// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChatGenerationPanel } from '@/components/llm/side-panel/ChatGenerationPanel';
import { useChatStore } from '@/store/use-chat-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { chat } from '../helpers/llm';

// ─────────────────────────────
// 会話の右の列の生成のタブ。決めていない項目も欄とつまみを出し、
// 触ると決めたことにする。
// ─────────────────────────────

beforeEach(() => {
  useChatStore.setState({ chats: {}, places: {}, saveStates: {}, pending: {}, drafts: {} });
  useChatStore.getState().put('c1', chat());
  useSettingsStore.setState({ llmParams: {} });
});

afterEach(cleanup);

// 生成の設定は全体で 1 つ
const params = () => useSettingsStore.getState().llmParams;

describe('生成のタブ', () => {
  it('決めていない項目もつまみを出し、動かすとその値で決めたことにする', () => {
    render(<ChatGenerationPanel chatId="c1" />);
    const slider = screen.getByRole('slider', { name: 'temperature' });
    expect(params().temperature).toBeUndefined();
    fireEvent.change(slider, { target: { value: '0.4' } });
    expect(params().temperature).toBe(0.4);
  });

  it('つまみを押しただけでも決めたことにし、チェックを外すと決めないに戻す', () => {
    render(<ChatGenerationPanel chatId="c1" />);
    fireEvent.pointerDown(screen.getByRole('slider', { name: 'top_p' }));
    expect(params().top_p).toBe(1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'top_pを決めないに戻す' }));
    expect(params().top_p).toBeUndefined();
  });

  it('停止の文字列は打ち込むと決めたことにする', () => {
    render(<ChatGenerationPanel chatId="c1" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'stop' }), { target: { value: 'END' } });
    expect(params().stop).toEqual(['END']);
  });
});

describe('パラメタの末尾（モデル互換・Web 検索）', () => {
  it('stop の後ろに見出し「モデル互換」、その後ろに「Web 検索」を置く', () => {
    render(<ChatGenerationPanel chatId="c1" />);
    const stop = screen.getByRole('textbox', { name: 'stop' });
    const compat = screen.getByText('モデル互換');
    const web = screen.getByText('Web 検索');
    expect(stop.compareDocumentPosition(compat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(compat.compareDocumentPosition(web) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('システムメッセージをまとめるは既定で外し、スイッチで全体の設定を切り替える', () => {
    useSettingsStore.setState({ squashSystemMessages: false });
    render(<ChatGenerationPanel chatId="c1" />);
    const toggle = screen.getByRole('switch', { name: 'システムメッセージをまとめる' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(useSettingsStore.getState().squashSystemMessages).toBe(true);
    useSettingsStore.setState({ squashSystemMessages: false });
  });
});
