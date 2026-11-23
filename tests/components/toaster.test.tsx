// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui/toast';
import { toastManager } from '@/components/ui/toast-manager';

afterEach(() => {
  act(() => toastManager.close());
  cleanup();
});

function titles(): string[] {
  return screen.queryAllByText(/^(A|B|C|D|E)$/).map((node) => node.textContent ?? '');
}

describe('知らせの並べ方', () => {
  it('同じ文面は 1 つにまとめて回数を出し、末尾へ移す。出した側の閉じたときの手続きは 1 回だけ', async () => {
    render(<Toaster />);
    const onClose = vi.fn();
    act(() => {
      toastManager.add({ title: 'A', type: 'error', timeout: 0, onClose });
      toastManager.add({ title: 'B', type: 'error', timeout: 0 });
      toastManager.add({ title: 'A', type: 'error', timeout: 0, onClose });
    });

    expect(await screen.findByText('×2')).toBeDefined();
    expect(titles().at(-1)).toBe('A');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('3 つを超えても隠さずに並べ、すべて消すで全部閉じる', async () => {
    render(<Toaster />);
    act(() => {
      for (const title of ['A', 'B', 'C', 'D', 'E']) {
        toastManager.add({ title, type: 'error', timeout: 0 });
      }
    });
    expect(await screen.findByText('E')).toBeDefined();
    expect(titles()).toHaveLength(5);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'すべて消す' }));
    });
    await vi.waitFor(() => expect(titles()).toHaveLength(0));
  });
});
