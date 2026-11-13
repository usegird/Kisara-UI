// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installDemoDefinitions, openDemoSample } from '@/demo/demo-data';
import { SimulatedRunPane } from '@/demo/SimulatedRunPane';
import { useExecutionStore } from '@/store/use-execution-store';

// ─────────────────────────────
// デモの模擬実行の枠。押すと実行中になり、終わると見本の画像を出す。
// どの状態でも模擬だと書く
// ─────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  installDemoDefinitions();
  openDemoSample();
  useExecutionStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('模擬実行の枠', () => {
  it('実行を押すと実行中になり、終わると出力ノードごとの画像を出す', () => {
    render(<SimulatedRunPane />);
    // 模擬の一行は実行中だけ出す
    expect(screen.queryByText(/模擬の実行です/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '実行（模擬）' }));
    expect(screen.getByRole('button', { name: '止める' })).toBeDefined();
    expect(screen.getByText(/模擬の実行です/)).toBeDefined();

    act(() => {
      vi.runAllTimers();
    });

    // 見本の出力ノードは 4 つ（輪郭・最初の生成・高解像化・最終）
    expect(screen.getAllByRole('button', { name: /を大きく出す$/ })).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'もう一度実行' })).toBeDefined();
    // 終わったら説明の一行は畳み、結果の画像に「模擬」を重ねる
    expect(screen.queryByText(/模擬の実行です/)).toBeNull();
    expect(screen.getByText('模擬')).toBeDefined();
    expect(useExecutionStore.getState().status).toBe('done');
  });

  it('止めると結果を出さずに待ちへ戻る', () => {
    render(<SimulatedRunPane />);
    fireEvent.click(screen.getByRole('button', { name: '実行（模擬）' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByRole('button', { name: '止める' }));
    act(() => {
      vi.runAllTimers();
    });

    expect(screen.queryAllByRole('button', { name: /を大きく出す$/ })).toHaveLength(0);
    expect(screen.getByRole('button', { name: '実行（模擬）' })).toBeDefined();
  });
});
