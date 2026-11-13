// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PerfStatsBar } from '@/components/app/PerfStatsBar';
import { RenderProbe } from '@/components/ui/render-probe';
import { recordStat, resetStats, statCount } from '@/lib/perf-stats';

afterEach(() => {
  cleanup();
  resetStats();
  vi.useRealTimers();
});

describe('台帳の表', () => {
  it('計測用ビルドでは開いた状態で始まり、空にするボタンで台帳と表を空にする', () => {
    recordStat('render:NodeCard', 1.25);
    render(<PerfStatsBar profiling />);

    const table = screen.getByRole('region', { name: '描画の回数' });
    expect(table.textContent).toContain('render:NodeCard');
    expect(table.textContent).toContain('1.3');

    fireEvent.click(screen.getByRole('button', { name: '描画の回数を空にする' }));
    expect(statCount('render:NodeCard')).toBe(0);
    expect(table.textContent).toContain('まだ何も数えていません');
  });

  it('閉じた表は表のボタンで開き直す', () => {
    render(<PerfStatsBar profiling />);
    fireEvent.click(screen.getByRole('button', { name: '表を閉じる' }));
    expect(screen.queryByRole('region', { name: '描画の回数' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '描画の回数を表で出す' }));
    expect(screen.getByRole('region', { name: '描画の回数' })).toBeDefined();
  });

  it('開いている間は 1 秒ごとに読み直す', () => {
    vi.useFakeTimers();
    render(<PerfStatsBar profiling />);
    const table = screen.getByRole('region', { name: '描画の回数' });

    recordStat('render:NodeCard');
    expect(table.textContent).not.toContain('render:NodeCard');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(table.textContent).toContain('render:NodeCard');

    // 閉じたら読み直しを止める
    fireEvent.click(screen.getByRole('button', { name: '表を閉じる' }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('内側の計測の範囲は、外側の範囲の下に字下げして並べる', () => {
    render(
      <RenderProbe id="Outer">
        <RenderProbe id="Inner">
          <span />
        </RenderProbe>
      </RenderProbe>,
    );
    recordStat('store:graph');
    render(<PerfStatsBar profiling />);

    const table = screen.getByRole('region', { name: '描画の回数' });
    const names = [...table.querySelectorAll('tbody tr td:first-child')];
    expect(names.map((cell) => cell.textContent)).toEqual([
      'mount:Outer',
      '└ mount:Inner',
      'store:graph',
    ]);
    expect((names[1] as HTMLElement).style.paddingLeft).toBe('12px');
  });

  it('計測用ビルドでなければ閉じた状態で始まり、時間の列を出さない', () => {
    recordStat('render:NodeCard', 1.25);
    render(<PerfStatsBar profiling={false} />);
    expect(screen.queryByRole('region', { name: '描画の回数' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '描画の回数を表で出す' }));
    const table = screen.getByRole('region', { name: '描画の回数' });
    expect(table.textContent).toContain('render:NodeCard');
    expect(table.textContent).not.toContain('ms');
    expect(table.textContent).not.toContain('1.3');
  });

  it('計測用ビルドでは JS ヒープの量を出し、読めない環境ではそう書く', () => {
    const { unmount } = render(<PerfStatsBar profiling />);
    const table = screen.getByRole('region', { name: '描画の回数' });
    expect(table.textContent).toContain('JS ヒープ: この環境では読めません');
    unmount();

    const mib = 1024 * 1024;
    const memory = {
      usedJSHeapSize: 50 * mib,
      totalJSHeapSize: 60 * mib,
      jsHeapSizeLimit: 4096 * mib,
    };
    Object.defineProperty(performance, 'memory', { value: memory, configurable: true });
    try {
      render(<PerfStatsBar profiling />);
      expect(screen.getByRole('region', { name: '描画の回数' }).textContent).toContain(
        'JS ヒープ 50.0 MB（上限 4096.0 MB）',
      );
    } finally {
      Reflect.deleteProperty(performance, 'memory');
    }
  });

  it('計測用ビルドでなければ JS ヒープの量を出さない', () => {
    render(<PerfStatsBar profiling={false} />);
    fireEvent.click(screen.getByRole('button', { name: '描画の回数を表で出す' }));
    expect(screen.getByRole('region', { name: '描画の回数' }).textContent).not.toContain('ヒープ');
  });
});
