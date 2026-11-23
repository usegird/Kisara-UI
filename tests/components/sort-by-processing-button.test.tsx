// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SortByProcessingButton } from '@/components/comfy/flow/SortByProcessingButton';
import { useGraphStore } from '@/store/use-graph-store';

const original = useGraphStore.getState().sortByProcessing;

afterEach(() => {
  cleanup();
  useGraphStore.setState({ sortByProcessing: original });
});

function renderWithSpy(): ReturnType<typeof vi.fn> {
  const sort = vi.fn();
  useGraphStore.setState({ sortByProcessing: sort });
  render(<SortByProcessingButton />);
  fireEvent.click(screen.getByRole('button', { name: '処理順に並べる' }));
  return sort;
}

describe('確かめてから並べる', () => {
  it('押すと確かめるだけで、まだ並べない', () => {
    const sort = renderWithSpy();

    expect(screen.getByRole('alertdialog')).toBeDefined();
    expect(sort).not.toHaveBeenCalled();
  });

  it('「並べる」で並べ、「キャンセル」では並べない', () => {
    const sort = renderWithSpy();
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(sort).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '処理順に並べる' }));
    fireEvent.click(screen.getByRole('button', { name: '並べる' }));
    expect(sort).toHaveBeenCalledTimes(1);
  });
});

describe('全てのノード座標を再配置', () => {
  it('既定は外したまま並べ、入れたときだけ原点から置き直す', () => {
    const sort = renderWithSpy();
    fireEvent.click(screen.getByRole('button', { name: '並べる' }));
    expect(sort).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: '処理順に並べる' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '全てのノード座標を再配置' }));
    fireEvent.click(screen.getByRole('button', { name: '並べる' }));
    expect(sort).toHaveBeenLastCalledWith(true);
  });

  it('確かめるダイアログに出し方の切り替えを出さない', () => {
    renderWithSpy();
    expect(screen.queryByRole('button', { name: '埋め込みにする' })).toBeNull();
    expect(screen.queryByRole('button', { name: '自由移動にする' })).toBeNull();
  });
});
