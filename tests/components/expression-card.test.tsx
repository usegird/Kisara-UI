// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ExpressionCard } from '@/components/llm/expression/ExpressionCard';
import { useSettingsStore } from '@/store/use-settings-store';

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ loreSemantic: false, chatExpressionMethod: 'tool' });
});

describe('近似判定が無効のとき', () => {
  it('近似判定を押しても選ばず、押したときだけ近似判定のカードを有効にするよう失敗の色で添える', () => {
    useSettingsStore.setState({ loreSemantic: false, chatExpressionMethod: 'tool' });
    render(<ExpressionCard />);
    expect(screen.queryByText('近似判定のカードを有効にすると使えます。')).toBeNull();
    const semantic = screen.getByRole('radio', { name: /^近似判定/u });
    fireEvent.click(semantic);
    expect(useSettingsStore.getState().chatExpressionMethod).toBe('tool');
    const notice = screen.getByText('近似判定のカードを有効にすると使えます。');
    expect(notice.className).toContain('text-destructive');
  });

  it('近似判定が有効なら選べて、添える文を出さない', () => {
    useSettingsStore.setState({ loreSemantic: true });
    render(<ExpressionCard />);
    fireEvent.click(screen.getByRole('radio', { name: /^近似判定/u }));
    expect(useSettingsStore.getState().chatExpressionMethod).toBe('semantic');
    expect(screen.queryByText('近似判定のカードを有効にすると使えます。')).toBeNull();
  });
});
