// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useReportWatch } from '@/hooks/run/use-report-watch';
import type { RunReport } from '@/queue/run-report';
import { useSidePanelStore } from '@/store/use-side-panel-store';
import { useTabsStore } from '@/store/use-tabs-store';

function reportWith(errors: number): RunReport {
  return { general: [], nodes: [], errors, warnings: 0, total: errors };
}

beforeEach(() => {
  useTabsStore.setState({ activeId: 'a' });
  useSidePanelStore.setState({ tab: 'queue', reportWatch: null });
});

afterEach(cleanup);

describe('エラーのタブへの切り替え', () => {
  it('待っているタブにエラーが出るまで待ち、出たら切り替えて待つのをやめる', () => {
    useSidePanelStore.getState().watchReport('a');
    const { rerender } = renderHook(({ report }) => useReportWatch(report), {
      initialProps: { report: reportWith(0) },
    });
    expect(useSidePanelStore.getState().tab).toBe('queue');

    rerender({ report: reportWith(1) });
    expect(useSidePanelStore.getState()).toMatchObject({ tab: 'report', reportWatch: null });
  });

  it('別のタブへ移ったら待つのをやめ、移った先のエラーでは切り替えない', () => {
    useSidePanelStore.getState().watchReport('a');
    const { rerender } = renderHook(({ report }) => useReportWatch(report), {
      initialProps: { report: reportWith(0) },
    });

    act(() => useTabsStore.setState({ activeId: 'b' }));
    rerender({ report: reportWith(1) });
    expect(useSidePanelStore.getState()).toMatchObject({ tab: 'queue', reportWatch: null });
  });

  it('待っていなければ、エラーがあっても切り替えない', () => {
    renderHook(() => useReportWatch(reportWith(2)));

    expect(useSidePanelStore.getState().tab).toBe('queue');
  });
});
