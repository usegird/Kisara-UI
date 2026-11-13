// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WriteConflictToasts } from '@/components/app/WriteConflictToasts';
import { toastManager } from '@/components/ui/toast-manager';
import { useWriteConflictsStore } from '@/store/use-write-conflicts-store';

// ─────────────────────────────
// ほかのタブで変わった 1 件の知らせ。1 件に 1 つ出し、閉じたら外す。
// ─────────────────────────────

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useWriteConflictsStore.setState({ conflicts: [] });
});

describe('書かなかった 1 件の知らせ', () => {
  it('1 件に 1 つだけ出し、閉じたら知らせている 1 件から外す', () => {
    const add = vi.spyOn(toastManager, 'add');
    render(<WriteConflictToasts />);
    const conflict = { key: 'preset:a', name: 'Alice', kind: 'changed' } as const;

    act(() => useWriteConflictsStore.setState({ conflicts: [conflict] }));
    act(() => useWriteConflictsStore.setState({ conflicts: [conflict] }));
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]?.[0].title).toEqual(expect.stringContaining('Alice'));

    act(() => add.mock.calls[0]?.[0].onClose?.());
    expect(useWriteConflictsStore.getState().conflicts).toEqual([]);
  });
});
