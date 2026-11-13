// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorageWarningToasts } from '@/components/app/StorageWarningToasts';
import { TAB_COUNT_NOTICE, TabCountNotice } from '@/components/app/TabCountNotice';
import { toastManager } from '@/components/ui/toast-manager';
import { useStorageWarningsStore, warnUnsaved } from '@/store/use-storage-warnings-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// 書けなかった物の警告と、タブが多すぎるときの促し
// ─────────────────────────────

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useStorageWarningsStore.setState({ last: null });
});

describe('書けなかった物の警告', () => {
  it('書けなかった種類ごとに、読み込み直すと消えることを知らせる', () => {
    const add = vi.spyOn(toastManager, 'add');
    render(<StorageWarningToasts />);
    act(() => warnUnsaved('draft'));
    act(() => warnUnsaved('draft'));
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[0]?.[0].title).toEqual(expect.stringContaining('ワークフロー'));
  });
});

describe('タブの数', () => {
  it('上限を超えたときに 1 回だけ促し、上限以下に戻ってから超えたら出し直す', () => {
    const add = vi.spyOn(toastManager, 'add');
    const tabs = useTabsStore.getState().tabs;
    const many = Array.from({ length: TAB_COUNT_NOTICE + 1 }, (_, index) => ({
      ...tabs[0]!,
      id: `t${String(index)}`,
    }));
    render(<TabCountNotice />);

    act(() => useTabsStore.setState({ tabs: many }));
    act(() => useTabsStore.setState({ tabs: [...many] }));
    expect(add).toHaveBeenCalledTimes(1);

    act(() => useTabsStore.setState({ tabs }));
    act(() => useTabsStore.setState({ tabs: many }));
    expect(add).toHaveBeenCalledTimes(2);
    useTabsStore.setState({ tabs });
  });
});
