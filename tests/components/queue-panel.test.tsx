// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QueuePanel } from '@/components/comfy/queue/QueuePanel';
import { resetStats, statCount } from '@/lib/perf-stats';
import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';
import { useTaskLogStore } from '@/store/use-task-log-store';

import { historyEntry, queueEntry, taskLogEntry, TEST_SESSION } from '../helpers/queue';

// 画像の中身は取りに行かない（テストから ComfyUI に触れない）。取れなかった扱いで /view を指す。
// キューからも外さない。呼ばれたかだけを見る
const deleteQueued = vi.hoisted(() =>
  vi.fn((_baseUrl: string, _promptId: string) => Promise.resolve()),
);
vi.mock('@/comfy/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/queue')>()),
  fetchOutputImage: () => Promise.reject(new Error('テストでは取らない')),
  deleteQueued,
}));
// 中断は送らない（テストから ComfyUI の状態を変えない）。呼ばれたかだけを見る
const interruptRun = vi.hoisted(() =>
  vi.fn((_baseUrl: string, _promptId: string) => Promise.resolve()),
);
vi.mock('@/comfy/prompt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/prompt')>()),
  interruptRun,
}));
// ─────────────────────────────
// キュー列。見出しは置かず、**取れなくなっても並びを消さない**。
// ─────────────────────────────

// 組み立てたキュー・履歴は、このタブから送ったものとする（ほかのタブの実行は出さない）
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
  useConnectionStore.setState({ status: 'disconnected' });
  useTaskLogStore.setState({ entries: [] });
  useExecutionStore.getState().reset();
});

describe('キュー列', () => {
  it('見出しは置かない（タブの名前と重なる）', () => {
    render(<QueuePanel />);

    expect(screen.queryByText('タスクキュー')).toBeNull();
  });

  it('取れなかったときも、最後に取れた並びを残して理由を添える', () => {
    useConnectionStore.setState({ status: 'connected' });
    useQueueStore.setState({ pending: [queueEntry('a', 7)], error: 'Failed to fetch' });
    render(<QueuePanel />);

    expect(screen.getByText(/キューを取得できません/)).toBeDefined();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('切れているときは、取れなかった理由を重ねて出さない（並びは残す）', () => {
    useQueueStore.setState({ pending: [queueEntry('a', 7)], error: 'Failed to fetch' });
    render(<QueuePanel />);

    expect(screen.queryByText(/キューを取得できません/)).toBeNull();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('終わったカードには、控えにあるワークフロー名を出す', () => {
    useQueueStore.setState({ history: [historyEntry('a', 7)] });
    useTaskLogStore.setState({ entries: [taskLogEntry('a', { name: 'my flow' })] });
    render(<QueuePanel />);

    expect(screen.getByText('my flow')).toBeDefined();
  });

  it('実行中のカードだけ右上に中断を出し、押すとそのタスクだけを止める', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('テストでは取らない')));
    useSettingsStore.setState({ baseUrl: 'http://127.0.0.1:1' });
    useQueueStore.setState({ running: [queueEntry('a', 7)], pending: [queueEntry('b', 8)] });
    render(<QueuePanel />);

    const stops = screen.getAllByRole('button', { name: '中断' });
    expect(stops).toHaveLength(1);
    fireEvent.click(stops[0]!);
    await waitFor(() => expect(interruptRun).toHaveBeenCalledOnce());
    expect(interruptRun.mock.calls[0]?.[1]).toBe('a');
    vi.unstubAllGlobals();
  });

  it('待機中のカードだけ右上に取り消しを出し、押すとそのタスクだけをキューから外す', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('テストでは取らない')));
    useSettingsStore.setState({ baseUrl: 'http://127.0.0.1:1' });
    useQueueStore.setState({ running: [queueEntry('a', 7)], pending: [queueEntry('b', 8)] });
    render(<QueuePanel />);

    const cancels = screen.getAllByRole('button', { name: 'キューから外す' });
    expect(cancels).toHaveLength(1);
    fireEvent.click(cancels[0]!);
    await waitFor(() => expect(deleteQueued).toHaveBeenCalledOnce());
    expect(deleteQueued.mock.calls[0]?.[1]).toBe('b');
    vi.unstubAllGlobals();
  });

  it('待っているカードは縮小画像の位置に砂時計、実行中は回る印を出す', () => {
    useQueueStore.setState({ running: [queueEntry('a', 7)], pending: [queueEntry('b', 8)] });
    const { container } = render(<QueuePanel />);

    expect(container.querySelectorAll('.lucide-hourglass')).toHaveLength(1);
    expect(container.querySelectorAll('.motion-safe\\:animate-spin')).toHaveLength(1);
  });

  it('進捗が進んでも、描き直すのは実行中のカードだけ（履歴のカードは描き直さない）', () => {
    useQueueStore.setState({
      running: [queueEntry('run', 100)],
      history: Array.from({ length: 20 }, (_, index) => historyEntry(`h${String(index)}`, index)),
    });
    useExecutionStore.getState().start('run', 10);
    render(<QueuePanel />);

    resetStats();
    act(() => {
      for (let value = 1; value <= 5; value += 1) {
        useExecutionStore
          .getState()
          .applyEvent({ type: 'progress', promptId: 'run', node: '1', value, max: 5 });
      }
    });

    expect(statCount('render:TaskItem'), '台帳に届いていない').toBeGreaterThan(0);
    // 進捗 1 回につき実行中の 1 枚まで（全部描き直すと 5 × 21 枚になる）
    expect(statCount('render:TaskItem')).toBeLessThanOrEqual(5);
  });

  it('ほかのタブ・画面の実行はカードにせず、実行中と待機の数だけを添える', () => {
    useQueueStore.setState({
      running: [queueEntry('other-run', 1, null, 'other')],
      pending: [queueEntry('mine', 2), queueEntry('other-wait', 3, null, 'other')],
    });
    render(<QueuePanel />);

    expect(screen.getByText('ほかの実行: 実行中 1・待機 1')).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('最上部にセッション名の欄を置き、空のときは session: <id> と出す。記録が切なら押せない', () => {
    useSettingsStore.setState({ recordRunHistory: false });
    render(<QueuePanel />);

    const name = screen.getByRole('textbox', { name: 'セッション名' });
    expect(name.getAttribute('placeholder')).toBe(`session: ${TEST_SESSION}`);
    expect((name as HTMLInputElement).disabled).toBe(true);
  });

  it('切り替えのアイコンで、開いているタブを新しいセッションにする', () => {
    render(<QueuePanel />);
    fireEvent.click(screen.getByRole('button', { name: '次のセッションに切り替える' }));

    expect(useTabsStore.getState().tabs[0]?.runSession).not.toBe(TEST_SESSION);
    // 前のセッションの実行もタスクの列に出し続ける
    expect(useTabsStore.getState().pastSessions).toContain(TEST_SESSION);
  });
});
