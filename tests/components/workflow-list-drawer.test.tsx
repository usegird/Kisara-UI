// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listSavedWorkflows } from '@/comfy/workflows';
import { WorkflowListDrawer } from '@/components/comfy/WorkflowListDrawer';
import { PRESS_GUARD_MS } from '@/lib/press-guard';
import { useConnectionStore } from '@/store/use-connection-store';

vi.mock('@/comfy/workflows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/workflows')>()),
  listSavedWorkflows: vi.fn(),
}));

const list = vi.mocked(listSavedWorkflows);
const saved = { name: 'cat.json', path: 'cat.json', modified: 0, size: 1 };

function renderDrawer(pinned = false) {
  const props = {
    baseUrl: 'http://comfy',
    pinned,
    onClose: vi.fn(),
    onOpenEmpty: vi.fn(),
    onOpenFile: vi.fn(),
    onOpenTemplate: vi.fn(),
    onOpenSaved: vi.fn(),
  };
  render(<WorkflowListDrawer {...props} />);
  return props;
}

beforeEach(() => {
  list.mockReset();
  list.mockResolvedValue([saved]);
  useConnectionStore.setState({ status: 'connected' });
});

afterEach(() => {
  cleanup();
  useConnectionStore.setState({ status: 'disconnected' });
});

describe('ワークフローの一覧', () => {
  it('上に開く入口 3 つ、その下に保存されたワークフローを出し、選ぶと引っ込めて開く', async () => {
    const props = renderDrawer();
    const names = screen.getAllByRole('button').map((button) => button.textContent);
    expect(names.slice(0, 3)).toEqual(['空で開く', 'ファイルから開く', 'テンプレートから開く']);

    expect(await screen.findByRole('heading', { name: 'それより前' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'cat.json' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onOpenSaved).toHaveBeenLastCalledWith(saved, true);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 10 * PRESS_GUARD_MS);
    fireEvent.click(screen.getByRole('button', { name: 'cat.json を別のタブで開く' }));
    expect(props.onOpenSaved).toHaveBeenLastCalledWith(saved, false);
    vi.useRealTimers();

    fireEvent.click(screen.getByRole('button', { name: 'ファイルから開く' }));
    expect(props.onOpenFile).toHaveBeenCalledTimes(1);
  });

  it('つないでいない間は空・テンプレートを押せず、一覧を取りに行かない', () => {
    useConnectionStore.setState({ status: 'disconnected' });
    renderDrawer();
    expect(screen.getByRole('button', { name: '空で開く' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('先に接続してください')).toBeTruthy();
    expect(list).not.toHaveBeenCalled();
  });

  it('外を押すか Esc で引っ込める', () => {
    const props = renderDrawer();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.pointerDown(document.body);
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('ワークフローを開いていないタブで出し続けるときは、外を押しても Esc でも引っ込めない', () => {
    const props = renderDrawer(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.pointerDown(document.body);
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
