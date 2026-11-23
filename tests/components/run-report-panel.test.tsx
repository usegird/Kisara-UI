// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RunReportPanel } from '@/components/comfy/queue/RunReportPanel';
import { useRevealRequest } from '@/hooks/run/use-reveal-request';
import { useExecutionStore } from '@/store/use-execution-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useRunReportStore } from '@/store/use-run-report-store';
import { useTabsStore } from '@/store/use-tabs-store';

import { historyEntry, TEST_SESSION } from '../helpers/queue';

const FAILED = { kind: 'error', line: 'CUDA out of memory', nodeId: '7' } as const;

beforeEach(() => {
  useTabsStore.setState({
    tabs: [{ id: 'w', kind: 'workflow', runSession: TEST_SESSION }],
    activeId: 'w',
    pastSessions: [],
  });
});

afterEach(() => {
  cleanup();
  useQueueStore.getState().clear();
  useExecutionStore.getState().reset();
  useRunReportStore.getState().begin([]);
  useRunReportStore.getState().clearReveal();
});

describe('エラーのタブ', () => {
  it('読み込み直した後も、開いているタブのセッションの最後の失敗を履歴から出す', () => {
    useQueueStore.setState({ history: [historyEntry('a', 1, { success: false, error: FAILED })] });
    render(<RunReportPanel />);

    expect(screen.getByText('CUDA out of memory')).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('× で閉じると、その件を出さない。次に実行すると戻る', () => {
    useQueueStore.setState({ history: [historyEntry('a', 1, { success: false, error: FAILED })] });
    render(<RunReportPanel />);

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByText('CUDA out of memory')).toBeNull();
    expect(screen.getByText('問題はありません')).toBeDefined();

    act(() => useRunReportStore.getState().begin([]));
    expect(screen.getByText('CUDA out of memory')).toBeDefined();
  });

  it('ノード名を押したときだけそのカードへ送る頼みを出す（カードの文・× では出さない）', () => {
    useQueueStore.setState({ history: [historyEntry('a', 1, { success: false, error: FAILED })] });
    render(<RunReportPanel />);

    fireEvent.click(screen.getByText('CUDA out of memory'));
    expect(useRunReportStore.getState().reveal).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '#7 へ移動' }));
    expect(useRunReportStore.getState().reveal?.cardId).toBe(7);
    act(() => useRunReportStore.getState().clearReveal());

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(useRunReportStore.getState().reveal).toBeNull();
  });

  it('頼まれたらカードの列を送り、頼みを外す', () => {
    const revealCard = vi.fn();
    renderHook(() => useRevealRequest(revealCard));

    act(() => useRunReportStore.getState().requestReveal(7));
    expect(revealCard).toHaveBeenCalledExactlyOnceWith(7);
    expect(useRunReportStore.getState().reveal).toBeNull();
  });

  it('断られたときは、全体の理由とノードの理由を 1 件ずつカードにする', () => {
    useRunReportStore.getState().reject({ reason: 'bad', nodes: { '7': ['x', 'y'] } });
    render(<RunReportPanel />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: '閉じる' })).toHaveLength(3);
  });
});
