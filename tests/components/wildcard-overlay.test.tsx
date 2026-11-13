// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WildcardOverlay } from '@/components/comfy/dialogs/WildcardOverlay';
import { useWildcardsStore } from '@/store/use-wildcards-store';

// ─────────────────────────────
// ワイルドカードの画面。スタイルの編集と同じ作りで、ノードの上に重ねる。
// 差し込み先は画面の外の複数行の欄。一覧のダブルクリックでも取り込む。
// ─────────────────────────────

afterEach(() => {
  cleanup();
  useWildcardsStore.setState({ panelOpen: false, names: [], status: 'idle' });
});

function open(): void {
  useWildcardsStore.setState({
    panelOpen: true,
    status: 'ready',
    names: ['__animal__', '__color/warm__', '__weather__'],
  });
}

/** 開いて、中身（開いたときに読む）が出るまで待つ */
async function show(): Promise<void> {
  render(<WildcardOverlay />);
  await screen.findByLabelText('ワイルドカードを絞り込む');
}

describe('ワイルドカードの画面', () => {
  it('閉じていれば何も描かない', () => {
    const { container } = render(<WildcardOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it('絞り込みの語のどれかを含むものを残す', async () => {
    open();
    await show();

    fireEvent.change(screen.getByLabelText('ワイルドカードを絞り込む'), {
      target: { value: 'warm weather' },
    });

    const list = screen.getByRole('list', { name: 'ワイルドカードの一覧' });
    // 一覧は階層を除いた名前で出す（どの階層かは薄く添える）
    expect(list.textContent).toContain('warm');
    expect(list.textContent).toContain('weather');
    expect(list.textContent).not.toContain('animal');
  });

  it('左の階層を選ぶと、その下（入れ子を含む）だけを出す', async () => {
    open();
    await show();

    fireEvent.click(screen.getByRole('button', { name: /^color/ }));

    const list = screen.getByRole('list', { name: 'ワイルドカードの一覧' });
    expect(list.textContent).toContain('warm');
    expect(list.textContent).not.toContain('animal');
  });

  it('一覧のダブルクリックで、外の複数行の欄のキャレット位置へ取り込む', async () => {
    open();
    const field = document.createElement('textarea');
    field.value = 'a b';
    document.body.append(field);
    await show();

    field.focus();
    field.setSelectionRange(2, 2);
    fireEvent.focusIn(field);
    fireEvent.doubleClick(screen.getByRole('button', { name: '__animal__' }));

    expect(field.value).toBe('a __animal__b');
    field.remove();
  });

  it('一覧を掴むと、名前をブラウザの文字のドラッグに載せる', async () => {
    open();
    await show();
    const row = screen.getByRole('button', { name: '__animal__' }).closest('[draggable="true"]');
    const setData = vi.fn();

    expect(row).not.toBeNull();
    fireEvent.dragStart(row as Element, { dataTransfer: { setData, effectAllowed: '' } });

    expect(setData).toHaveBeenCalledWith('text/plain', '__animal__');
  });

  it('選ぶと右に出し、取り込みのボタンで差し込む', async () => {
    open();
    const field = document.createElement('textarea');
    document.body.append(field);
    await show();

    field.focus();
    fireEvent.focusIn(field);
    fireEvent.click(screen.getByRole('button', { name: '__weather__' }));
    fireEvent.click(screen.getByLabelText('ワイルドカードをキャレット位置に取り込む'));

    expect(field.value).toBe('__weather__');
    field.remove();
  });
});
