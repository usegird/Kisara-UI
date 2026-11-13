// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatLimitFields } from '@/components/llm/side-panel/ChatLimitFields';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 会話の大きさの上限と、一度に描く発言の数の欄
// ─────────────────────────────

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ chatMaxMegabytes: 10, chatLogWindow: 100 });
});

describe('会話の上限の欄', () => {
  it('打っている間は決めず、焦点が外れたら範囲に丸めて決める', () => {
    render(<ChatLimitFields />);
    const size = screen.getByLabelText('セッションあたり上限（対話文）');
    fireEvent.change(size, { target: { value: '25' } });
    expect(useSettingsStore.getState().chatMaxMegabytes).toBe(10);
    fireEvent.blur(size);
    expect(useSettingsStore.getState().chatMaxMegabytes).toBe(25);

    const window = screen.getByLabelText('一度に描画する発言数');
    fireEvent.change(window, { target: { value: '5' } });
    fireEvent.blur(window);
    expect(useSettingsStore.getState().chatLogWindow).toBe(20);
    expect(screen.getByLabelText<HTMLInputElement>('一度に描画する発言数').value).toBe('20');
  });

  it('容量の上限は 400 MB に収める', () => {
    render(<ChatLimitFields />);
    const size = screen.getByLabelText('セッションあたり上限（対話文）');
    fireEvent.change(size, { target: { value: '1000' } });
    fireEvent.blur(size);
    expect(useSettingsStore.getState().chatMaxMegabytes).toBe(400);
  });

  it('空にして外したら、今の値に戻す', () => {
    render(<ChatLimitFields />);
    const size = screen.getByLabelText<HTMLInputElement>('セッションあたり上限（対話文）');
    fireEvent.change(size, { target: { value: '' } });
    fireEvent.blur(size);
    expect(useSettingsStore.getState().chatMaxMegabytes).toBe(10);
    expect(size.value).toBe('10');
  });
});
