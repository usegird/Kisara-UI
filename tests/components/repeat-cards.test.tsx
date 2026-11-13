// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RepeatCards } from '@/components/comfy/queue/RepeatCards';
import { useRepeatStore } from '@/store/use-repeat-store';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// 繰り返しのカード。タスクと同じ並びの先頭に、始めた順に足す。停止はその繰り返しだけ。
// ─────────────────────────────

afterEach(() => {
  cleanup();
  useRepeatStore.setState({ jobs: [] });
});

function twoJobs(): void {
  useTabsStore.setState({
    activeId: 'tab-1',
    snapshots: {},
  });
  const repeat = useRepeatStore.getState();
  repeat.begin('tab-1');
  repeat.begin('tab-2');
}

/** タスクの並びと同じく `ul` の中に描く */
function renderInList(): void {
  render(
    <ul>
      <RepeatCards />
    </ul>,
  );
}

describe('繰り返しのカード', () => {
  it('最中でなければ出さない', () => {
    renderInList();
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  it('並びの項目（li）として始めた順に出し、停止はその繰り返しだけを終える', () => {
    twoJobs();
    renderInList();
    const items = screen.getAllByRole('status');
    expect(items).toHaveLength(2);
    expect(items[0]?.tagName).toBe('LI');

    const stops = screen.getAllByRole('button');
    fireEvent.click(stops[1] as HTMLElement);
    expect(useRepeatStore.getState().jobs.map((job) => job.tabId)).toEqual(['tab-1']);
  });

  it('3 行目にセッション名、無ければセッションの id を出す', () => {
    useTabsStore.setState({
      tabs: [
        { id: 'tab-1', kind: 'workflow', runSession: 'sessaaaa' },
        { id: 'tab-2', kind: 'workflow', runSession: 'sessbbbb' },
      ],
      activeId: 'tab-1',
      snapshots: {},
    });
    useRunHistoryStore.setState({
      sessionName: 'morning batch',
      sessionNames: new Map([['sessaaaa', 'morning batch']]),
    });
    const repeat = useRepeatStore.getState();
    repeat.begin('tab-1');
    repeat.begin('tab-2');
    renderInList();

    const [first, second] = screen.getAllByRole('status');
    expect(first?.textContent).toContain('morning batch');
    expect(second?.textContent).toContain('sessbbbb');
    useRunHistoryStore.setState({ sessionName: '', sessionNames: new Map() });
  });
});
