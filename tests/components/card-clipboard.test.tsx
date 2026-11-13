// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NodeId } from '@/graph/types';
import { useCardClipboard } from '@/hooks/flow/use-card-clipboard';
import { useGraphStore } from '@/store/use-graph-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// カードの写しと貼り付け。選んだカードを Ctrl+C で覚え、
// Ctrl+V で選んでいるカードの後ろへクローンを足す。同じタブの中だけ。
// ─────────────────────────────

const paste = vi.fn<(sources: readonly NodeId[], after: readonly NodeId[]) => void>();

function Host(): React.ReactElement {
  useCardClipboard(paste);
  return <textarea aria-label="欄" />;
}

const press = (key: string, target: Element = document.body): void => {
  fireEvent.keyDown(target, { key, ctrlKey: true });
};

beforeEach(() => {
  paste.mockClear();
  useTabsStore.setState({ activeId: 'tab-1' });
  render(<Host />);
});

afterEach(() => {
  cleanup();
  useGraphStore.setState({ selectedNodeIds: [] });
});

describe('カードの写しと貼り付け', () => {
  it('写したカードを、貼るときに選んでいるカードの後ろへ足す。選んでいなければ元の後ろ', () => {
    useGraphStore.setState({ selectedNodeIds: [3] });
    press('c');
    useGraphStore.setState({ selectedNodeIds: [7] });
    press('v');
    expect(paste).toHaveBeenLastCalledWith([3], [7]);

    useGraphStore.setState({ selectedNodeIds: [] });
    press('v');
    expect(paste).toHaveBeenLastCalledWith([3], [3]);
  });

  it('複数を選んでいれば、まとめて写す', () => {
    useGraphStore.setState({ selectedNodeIds: [5, 2] });
    press('c');
    useGraphStore.setState({ selectedNodeIds: [] });
    press('v');
    expect(paste).toHaveBeenLastCalledWith([5, 2], [5, 2]);
  });

  it('写していない・別のタブでは貼らない', () => {
    press('v');
    expect(paste).not.toHaveBeenCalled();

    useGraphStore.setState({ selectedNodeIds: [3] });
    press('c');
    useTabsStore.setState({ activeId: 'tab-2' });
    press('v');
    expect(paste).not.toHaveBeenCalled();
  });

  it('文字の入力欄の中では取らない（ふつうの写し・貼り付けのまま）', () => {
    useGraphStore.setState({ selectedNodeIds: [3] });
    const field = document.querySelector('textarea') as HTMLTextAreaElement;
    press('c', field);
    press('v');
    expect(paste).not.toHaveBeenCalled();

    press('c');
    press('v', field);
    expect(paste).not.toHaveBeenCalled();
  });
});
