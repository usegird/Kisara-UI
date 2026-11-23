// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useRunHistoryLoad } from '@/hooks/run/use-run-history-load';
import { useConnectionStore } from '@/store/use-connection-store';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { useSettingsStore } from '@/store/use-settings-store';

const ORIGINAL_LOAD = useRunHistoryStore.getState().load;

afterEach(() => {
  cleanup();
  useRunHistoryStore.setState({ load: ORIGINAL_LOAD });
  useConnectionStore.setState({ status: 'disconnected' });
  useSettingsStore.setState({ baseUrl: '' });
});

describe('実行の記録を読み直すとき', () => {
  it('つながっていなければ読まず、つながったら読む', () => {
    const load = vi.fn(() => Promise.resolve());
    useRunHistoryStore.setState({ load });
    useSettingsStore.setState({ baseUrl: 'http://comfy.test' });
    const { rerender } = renderHook(() => useRunHistoryLoad());
    expect(load).not.toHaveBeenCalled();

    useConnectionStore.setState({ status: 'connected' });
    rerender();

    expect(load).toHaveBeenCalledWith('http://comfy.test');
  });
});
