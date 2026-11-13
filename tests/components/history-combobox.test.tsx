// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HistoryCombobox } from '@/components/ui/history-combobox';

// ─────────────────────────────
// 打ち込める一覧つきの欄。開いたときは中身にかかわらず全部を出し、
// 打ち込んだときだけ絞る。
// ─────────────────────────────

afterEach(cleanup);

function Field({
  initial = '',
  onRemove,
  onEnter,
}: {
  readonly initial?: string;
  readonly onRemove?: (item: string) => void;
  readonly onEnter?: () => void;
}): React.ReactElement {
  const [value, setValue] = useState(initial);
  return (
    <HistoryCombobox
      value={value}
      onValueChange={setValue}
      items={['http://a:1', 'http://b:2', 'http://c:3']}
      label="接続先"
      example="http://example:8188"
      onRemove={onRemove}
      onEnter={onEnter}
    />
  );
}

const options = (): string[] => screen.queryAllByRole('option').map((item) => item.textContent);

describe('打ち込める一覧つきの欄', () => {
  it('欄に一覧の 1 つが入っていても、開いたときは全部を出す', () => {
    render(<Field initial="http://b:2" />);
    fireEvent.click(screen.getByRole('button', { name: '接続先の一覧を開く' }));
    expect(options()).toEqual(['http://a:1', 'http://b:2', 'http://c:3']);
  });

  it('打ち込んだときだけ、中身を含むものに絞る', () => {
    render(<Field />);
    const input = screen.getByRole('combobox', { name: '接続先' });
    fireEvent.click(screen.getByRole('button', { name: '接続先の一覧を開く' }));
    fireEvent.change(input, { target: { value: 'c:' } });
    expect(options()).toEqual(['http://c:3']);
  });

  it('空の欄で Tab を押すと例を入れ、入っていれば何もしない', () => {
    render(<Field />);
    const input = screen.getByRole('combobox', { name: '接続先' });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect((input as HTMLInputElement).value).toBe('http://example:8188');
  });

  it('行の × で履歴から消す。選んだ行が無い Enter は onEnter を呼ぶ', () => {
    const onRemove = vi.fn();
    const onEnter = vi.fn();
    render(<Field onRemove={onRemove} onEnter={onEnter} />);
    fireEvent.click(screen.getByRole('button', { name: '接続先の一覧を開く' }));
    fireEvent.click(screen.getByRole('button', { name: 'http://a:1 を履歴から消す' }));
    expect(onRemove).toHaveBeenCalledWith('http://a:1');

    fireEvent.keyDown(screen.getByRole('combobox', { name: '接続先' }), { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledOnce();
  });
});
