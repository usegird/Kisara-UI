// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NodeRow } from '@/components/comfy/flow/NodeRow';
import type { NodeRow as NodeRowData, RowSource } from '@/graph/rows';

import { nodeRow } from '../helpers/views';

afterEach(() => {
  cleanup();
});

const source: RowSource = {
  linkId: 7,
  nodeId: 2,
  slot: 0,
  type: 'INT',
  label: 'Seed / INT',
  values: [],
  muted: false,
  sourceIndex: '3',
};

const widgetRow = nodeRow({ name: 'seed', label: 'seed', widgetName: 'seed', inputSlot: 0 });
const linkRow: NodeRowData = { ...widgetRow, kind: 'link', source };

function chipItem(): HTMLElement | null {
  return (
    screen.getByRole('button', { name: 'seed の接続を解除' }).parentElement?.parentElement ?? null
  );
}

function animationEnd(element: HTMLElement | null): void {
  if (element) fireEvent(element, new Event('webkitAnimationEnd', { bubbles: true }));
}

describe('チップの出入り', () => {
  it('開いたときから繋がっている行は動かさない', () => {
    render(<NodeRow nodeId={1} row={linkRow} onDisconnect={vi.fn()} />);
    expect(chipItem()?.className).not.toMatch(/kisara-chip-/);
  });

  it('繋いで現れたチップは滑り込む', () => {
    const { rerender } = render(<NodeRow nodeId={1} row={widgetRow} onDisconnect={vi.fn()} />);
    rerender(<NodeRow nodeId={1} row={linkRow} onDisconnect={vi.fn()} />);
    expect(chipItem()?.classList.contains('kisara-chip-enter')).toBe(true);

    animationEnd(chipItem());
    expect(chipItem()?.className).not.toMatch(/kisara-chip-/);
  });

  it('解除は抜け終わってから 1 回だけ伝える', () => {
    const onDisconnect = vi.fn();
    render(<NodeRow nodeId={1} row={linkRow} onDisconnect={onDisconnect} />);

    fireEvent.click(screen.getByRole('button', { name: 'seed の接続を解除' }));
    expect(chipItem()?.classList.contains('kisara-chip-leave')).toBe(true);
    expect(onDisconnect).not.toHaveBeenCalled();

    animationEnd(chipItem());
    expect(onDisconnect).toHaveBeenCalledExactlyOnceWith(7);
  });
});

describe('チップを掴む', () => {
  const dragLabel = 'seed の接続元を別の行へもつなぐ';

  it('結線を変えられる行では、番号と値を掴める（Tab では止めず、メニューに操作の名前で載せる）', () => {
    render(<NodeRow nodeId={1} row={linkRow} onDisconnect={vi.fn()} />);
    const handle = document.querySelector(`[data-menu-label="${dragLabel}"]`);

    expect(handle?.getAttribute('aria-roledescription')).toBeTruthy();
    expect(handle?.getAttribute('tabindex')).toBe('-1');
    expect(handle?.textContent).toBe('3Seed / INT');
  });

  it('結線を変えられない行では掴めない', () => {
    render(<NodeRow nodeId={1} row={linkRow} />);
    expect(document.querySelector(`[data-menu-label="${dragLabel}"]`)).toBeNull();
    expect(document.querySelector('[aria-roledescription]')).toBeNull();
  });
});

describe('行の入口', () => {
  it('手前に足す三角は、繋がっている行かどうかに関わらず同じ行を渡す', () => {
    const onAddBefore = vi.fn();
    render(<NodeRow nodeId={1} row={linkRow} onAddBefore={onAddBefore} />);
    fireEvent.click(screen.getByRole('button', { name: 'seed の手前にノードを追加' }));
    expect(onAddBefore).toHaveBeenCalledWith(1, linkRow);
  });

  it('アプリ入力の印は widget 行だけに出し、状態を押下で示す', () => {
    const onToggleAppInput = vi.fn();
    const { rerender } = render(
      <NodeRow
        nodeId={1}
        row={{ ...widgetRow, appInput: true }}
        onToggleAppInput={onToggleAppInput}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'seed をアプリ入力から外す' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(onToggleAppInput).toHaveBeenCalledWith(1, 'seed');

    rerender(<NodeRow nodeId={1} row={linkRow} onToggleAppInput={onToggleAppInput} />);
    expect(screen.queryByRole('button', { name: /アプリ入力/ })).toBeNull();
  });

  it('未接続の入力と、直せない値は注記で出す（直せない値は印を添えて失敗の色）', () => {
    const { rerender } = render(
      <NodeRow nodeId={1} row={{ ...widgetRow, kind: 'socket', required: true }} />,
    );
    expect(screen.getByText('未接続（必須）')).toBeTruthy();

    rerender(<NodeRow nodeId={1} row={{ ...widgetRow, kind: 'unresolved', value: 42 }} />);
    expect(screen.getByText('(編集非対応) 42').classList.contains('text-destructive')).toBe(true);

    rerender(<NodeRow nodeId={1} row={{ ...widgetRow, kind: 'unresolved', value: undefined }} />);
    expect(screen.getByText('(編集非対応)')).toBeTruthy();
  });
});
