// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRepeatRunDriver } from '@/hooks/run/use-repeat-run';
import { INITIAL_EXECUTION } from '@/queue/execution-state';
import { DEFAULT_SAFEGUARDS } from '@/store/settings-fields/safeguards';
import { useExecutionStore } from '@/store/use-execution-store';
import { useRepeatStore } from '@/store/use-repeat-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// 繰り返しの送り。実行中に失敗しても次を投げ、失敗が続いたら終える。
// 防御機構の値（最短の間隔・回数の上限）で止める。
// **投入は差し替える**（テストから ComfyUI に投げない）。時計は作り物にする。
// ─────────────────────────────

let issued = 0;
const runTab = vi.hoisted(() => vi.fn<(tabId: string) => Promise<string | null>>());
vi.mock('@/hooks/run/use-run-workflow', () => ({
  useRunWorkflow: () => ({ run: vi.fn(), runTab, interrupt: vi.fn(), busy: false }),
}));

const REPEAT_FAILURE_LIMIT = DEFAULT_SAFEGUARDS.repeatFailureLimit;
const INTERVAL = DEFAULT_SAFEGUARDS.repeatMinIntervalMs;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  useSettingsStore.setState({ safeguards: DEFAULT_SAFEGUARDS });
  issued = 1;
  runTab.mockReset();
  runTab.mockImplementation(() => Promise.resolve(`p${String(++issued)}`));
  useTabsStore.setState({ tabs: [{ id: 'tab-1', kind: 'workflow' }] });
  useRepeatStore.setState({ jobs: [] });
  useRepeatStore.getState().begin('tab-1');
  useRepeatStore.getState().submitted('tab-1', 'p1');
});

afterEach(() => {
  cleanup();
  useRepeatStore.setState({ jobs: [] });
  useExecutionStore.setState(INITIAL_EXECUTION);
  vi.useRealTimers();
});

const jobOf = (tabId = 'tab-1') =>
  useRepeatStore.getState().jobs.find((job) => job.tabId === tabId) ?? null;

/** 今キューに置いている実行を、その状態で終わらせる。既定では最短の間隔まで時計を進める */
async function finish(
  status: 'done' | 'failed',
  tabId = 'tab-1',
  elapse = INTERVAL,
): Promise<void> {
  const promptId = jobOf(tabId)?.promptId ?? null;
  await act(async () => {
    useExecutionStore.setState({ ...INITIAL_EXECUTION, promptId, status });
    await vi.advanceTimersByTimeAsync(elapse);
  });
}

describe('繰り返しの送り', () => {
  it('実行中に失敗しても次を投げ、正常に終われば数え直す', async () => {
    renderHook(() => useRepeatRunDriver());

    await finish('failed');
    expect(runTab).toHaveBeenCalledTimes(1);
    expect(jobOf()).toMatchObject({ failures: 1, promptId: 'p2' });

    await finish('done');
    expect(runTab).toHaveBeenCalledTimes(2);
    expect(jobOf()?.failures).toBe(0);
  });

  it(`失敗が ${String(REPEAT_FAILURE_LIMIT)} 回続いたら終える`, async () => {
    renderHook(() => useRepeatRunDriver());

    for (let i = 0; i < REPEAT_FAILURE_LIMIT; i += 1) await finish('failed');

    expect(runTab).toHaveBeenCalledTimes(REPEAT_FAILURE_LIMIT - 1);
    expect(jobOf()).toBeNull();
  });

  it('一瞬で終わっても、前に投げてから最短の間隔が過ぎるまで次を投げない', async () => {
    renderHook(() => useRepeatRunDriver());

    await finish('done', 'tab-1', 0);
    expect(runTab).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(INTERVAL - 1));
    expect(runTab).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(runTab).toHaveBeenCalledTimes(1);
  });

  it('待っている間に止めたら投げない', async () => {
    renderHook(() => useRepeatRunDriver());

    await finish('done', 'tab-1', 0);
    act(() => useRepeatStore.getState().stop('tab-1'));
    await act(() => vi.advanceTimersByTimeAsync(INTERVAL));
    expect(runTab).not.toHaveBeenCalled();
  });

  it('投げた回数が上限に届いたら終える', async () => {
    useSettingsStore.setState({ safeguards: { ...DEFAULT_SAFEGUARDS, repeatMaxRuns: 3 } });
    renderHook(() => useRepeatRunDriver());

    for (let i = 0; i < 3; i += 1) await finish('done');

    // 1 回目は始めたときに投げている。上限の 3 回目が終わったら投げない
    expect(runTab).toHaveBeenCalledTimes(2);
    expect(jobOf()).toBeNull();
  });

  it('複数の繰り返しは、それぞれ自分の実行が終わったときだけ次を投げる', async () => {
    useTabsStore.setState({
      tabs: [
        { id: 'tab-1', kind: 'workflow' },
        { id: 'tab-2', kind: 'workflow' },
      ],
    });
    useRepeatStore.getState().begin('tab-2');
    useRepeatStore.getState().submitted('tab-2', 'q1');
    renderHook(() => useRepeatRunDriver());

    await finish('done', 'tab-2');
    expect(runTab.mock.calls.map(([tabId]) => tabId)).toEqual(['tab-2']);
    expect(jobOf('tab-1')?.promptId).toBe('p1');

    await finish('done', 'tab-1');
    expect(runTab.mock.calls.map(([tabId]) => tabId)).toEqual(['tab-2', 'tab-1']);
  });

  it('対象のタブを閉じたら、その繰り返しだけ止まる', async () => {
    useTabsStore.setState({
      tabs: [
        { id: 'tab-1', kind: 'workflow' },
        { id: 'tab-2', kind: 'workflow' },
      ],
    });
    useRepeatStore.getState().begin('tab-2');
    renderHook(() => useRepeatRunDriver());
    await act(async () => {
      useTabsStore.setState({ tabs: [{ id: 'tab-2', kind: 'workflow' }] });
      await Promise.resolve();
    });
    expect(useRepeatStore.getState().jobs.map((job) => job.tabId)).toEqual(['tab-2']);
  });
});
