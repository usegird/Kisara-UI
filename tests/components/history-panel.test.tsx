// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HistoryPanel } from '@/components/comfy/queue/HistoryPanel';
import { formatDateTime } from '@/i18n/format';
import { addRuns, EMPTY_RUN_HISTORY } from '@/queue/run-history';
import { useConnectionStore } from '@/store/use-connection-store';
import { useHistoryDetailStore } from '@/store/use-history-detail-store';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTaskDetailStore } from '@/store/use-task-detail-store';
import { useViewerStore } from '@/store/use-viewer-store';

import { definition, definitionMap, widget } from '../helpers/definitions';
import { runSource } from '../helpers/run-history';

// 記録のファイルの中身は手元で返す（テストから ComfyUI に触れない）
const fetchRunHistoryFile = vi.hoisted(() =>
  vi.fn<(baseUrl: string, name: string) => Promise<unknown>>(),
);
vi.mock('@/comfy/run-history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/run-history')>()),
  fetchRunHistoryFile,
}));

// 画像の中身は取りに行かない（テストから ComfyUI に触れない）
vi.mock('@/comfy/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/queue')>()),
  fetchOutputImage: () => Promise.reject(new Error('テストでは取らない')),
}));

// ─────────────────────────────
// 履歴のタブ。ワークフローの段ごとに 1 枚のカードにまとめる
// ─────────────────────────────

const DEFINITIONS = definitionMap(
  definition('Text', [widget('text', 'STRING', { multiline: true })]),
);

function sent(text: string): Record<string, unknown> {
  return { nodes: [{ id: 1, type: 'Text', pos: [0, 0], widgets_values: [text] }], links: [] };
}

/** セッション 2 つ分の記録（cat を 2 回のセッションと、dog を 1 回のセッション） */
function showRecords(): void {
  const record = (sources: Parameters<typeof addRuns>[0]['sources']) =>
    addRuns({
      file: EMPTY_RUN_HISTORY,
      sources,
      definitions: DEFINITIONS,
      kinds: { modelNames: new Set(), loraNames: new Set() },
      names: new Map([
        ['a', 'portrait'],
        ['c', 'portrait'],
      ]),
    });
  // cat のセッションにだけ名前を付ける
  const cat = {
    ...record([
      runSource('a', 1_000, ['a.png'], sent('cat')),
      runSource('b', 2_000, ['b.png'], sent('cat')),
    ]),
    name: 'cat session',
  };
  const dog = record([runSource('c', 999_000, ['c.png'], sent('dog'))]);
  // 一覧の時期は最後に書いた時刻（ここでは最後の実行の時刻）。中身は読み終えたものとして置く
  useRunHistoryStore.setState({
    entries: [
      { name: 'tab-cat.json', modified: 2_000 },
      { name: 'tab-dog.json', modified: 999_000 },
    ],
    files: new Map([
      ['tab-cat.json', cat],
      ['tab-dog.json', dog],
    ]),
    status: 'ready',
  });
  useSettingsStore.setState({ baseUrl: 'http://comfy.test' });
}

afterEach(() => {
  cleanup();
  useRunHistoryStore.getState().clear();
  useViewerStore.getState().close();
  useHistoryDetailStore.getState().close();
  useTaskDetailStore.getState().close();
});

describe('履歴のタブ', () => {
  it('セッションごとに 1 枚にし、日付 / 回数・ワークフロー名・セッション名か無ければモデル名を出す', () => {
    showRecords();
    render(<HistoryPanel />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByText('portrait')).toHaveLength(2);
    expect(screen.getByText('cat session')).toBeDefined();
    expect(screen.getByText(`${formatDateTime(2_000)} / 2 回`)).toBeDefined();
    expect(screen.getByText(`${formatDateTime(999_000)} / 1 回`)).toBeDefined();
    // 名前の無い dog のセッションはモデル名（ここでは分からないので「モデル不明」）
    expect(screen.getAllByText('モデル不明')).toHaveLength(1);
  });

  it('記録を書かない設定なら、入れるリンクを出し、押すと入れる', () => {
    useSettingsStore.setState({ recordRunHistory: false });
    render(<HistoryPanel />);

    fireEvent.click(screen.getByRole('button', { name: '実行の記録をオンにする' }));

    expect(useSettingsStore.getState().recordRunHistory).toBe(true);
    expect(screen.queryByRole('button', { name: '実行の記録をオンにする' })).toBeNull();
    useSettingsStore.setState({ recordRunHistory: false });
  });

  it('カードを押すと履歴の詳細を開き、タスクの詳細は閉じる', () => {
    showRecords();
    useTaskDetailStore.getState().open('x');
    render(<HistoryPanel />);

    fireEvent.click(screen.getByText(`${formatDateTime(2_000)} / 2 回`));

    expect(useHistoryDetailStore.getState().key).not.toBeNull();
    expect(useTaskDetailStore.getState().promptId).toBeNull();
  });

  it('縮小画像を押すと、そのカードの実行の並びでビューワーを開く', () => {
    showRecords();
    render(<HistoryPanel />);

    // 新しい順なので、2 枚目が cat のカード
    const [, cat] = screen.getAllByRole('button', { name: 'portrait の画像を開く' });
    if (cat === undefined) throw new Error('no card');
    fireEvent.click(cat);

    const viewer = useViewerStore.getState();
    expect(viewer.mode).toBe('overlay');
    expect(viewer.tasks?.map((task) => task.outputs[0]?.filename)).toEqual(['b.png', 'a.png']);
  });

  it('更新のアイコンで読み直す（接続しているときだけ押せる）', () => {
    const load = vi.fn(() => Promise.resolve());
    showRecords();
    useRunHistoryStore.setState({ load });
    useConnectionStore.setState({ status: 'connected' });
    render(<HistoryPanel />);

    fireEvent.click(screen.getByRole('button', { name: '履歴を読み直す' }));

    expect(load).toHaveBeenCalledWith('http://comfy.test');
    useConnectionStore.setState({ status: 'disconnected' });
  });

  it('読み直して中身を捨てたら、名前が同じでも出す分を読み直す', () => {
    const fetchFiles = vi.fn(() => Promise.resolve());
    const original = useRunHistoryStore.getState().fetchFiles;
    showRecords();
    useRunHistoryStore.setState({ fetchFiles });
    const { unmount } = render(<HistoryPanel />);
    fetchFiles.mockClear();

    // 読み直しの結果（一覧は同じ名前、中身は空）
    act(() =>
      useRunHistoryStore.setState((state) => ({ entries: [...state.entries], files: new Map() })),
    );

    expect(fetchFiles).toHaveBeenCalledWith(
      'http://comfy.test',
      expect.arrayContaining(['tab-cat.json', 'tab-dog.json']),
    );
    // 外してから戻す（出したまま戻すと、戻した手続きで読みに行ってしまう）
    unmount();
    useRunHistoryStore.setState({ fetchFiles: original });
  });

  it('記録が 2 つ以上あればスライドバーを出し、範囲で絞る', () => {
    showRecords();
    render(<HistoryPanel />);

    expect(screen.getByRole('slider', { name: 'さかのぼる範囲' })).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    // 左端（0）が一番新しいファイル＝全部
    const slider = screen.getByRole('slider', { name: 'さかのぼる範囲' });
    expect(slider.getAttribute('aria-valuenow')).toBe('0');

    act(() => useRunHistoryStore.getState().setUpTo('tab-cat.json'));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(slider.getAttribute('aria-valuenow')).toBe('1');
  });

  it('接続していなければ、接続すると出る旨だけを出す', () => {
    render(<HistoryPanel />);

    expect(screen.getByText('接続すると履歴を表示します')).toBeDefined();
  });
});

describe('履歴のカードを少しずつ描く', () => {
  /**
   * 見張りの代わり。`fire` を呼ぶと末尾の目印（`li`）が見えたことにする。
   * 画像の目印（画面に近づいたら取る）は見えないままにする
   */
  function stubObserver(): { fire: () => void } {
    type Notify = (entries: { isIntersecting: boolean }[]) => void;
    const sentinels: Notify[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        readonly #notify: Notify;
        constructor(callback: Notify) {
          this.#notify = callback;
        }
        observe(target: Element): void {
          if (target.tagName === 'LI') sentinels.push(this.#notify);
        }
        disconnect(): void {}
      },
    );
    return {
      fire: () => act(() => sentinels.at(-1)?.([{ isIntersecting: true }])),
    };
  }

  it('画面に入る分（1 回 8 枚）のファイルだけ中身を読み、末尾の目印が見えたら続きを読む', async () => {
    const observer = stubObserver();
    const record = (index: number) =>
      addRuns({
        file: EMPTY_RUN_HISTORY,
        sources: [runSource(`p${String(index)}`, (index + 1) * 1_000, ['a.png'], sent('cat'))],
        definitions: DEFINITIONS,
        kinds: { modelNames: new Set(), loraNames: new Set() },
        names: new Map(),
      });
    fetchRunHistoryFile.mockImplementation((_baseUrl: string, name: string) =>
      Promise.resolve({ kind: 'file', file: record(Number(name.slice(1, -5))) }),
    );
    useSettingsStore.setState({ baseUrl: 'http://comfy.test' });
    // 中身は読んでいない。一覧（名前と時期）だけ
    useRunHistoryStore.setState({
      entries: Array.from({ length: 12 }, (_, index) => ({
        name: `s${String(index)}.json`,
        modified: (index + 1) * 1_000,
      })),
      status: 'ready',
    });
    const { container } = render(<HistoryPanel />);

    const cards = (): number => container.querySelectorAll('button[data-detail]').length;
    await waitFor(() => expect(cards()).toBe(8));
    // 読んだのは新しい 8 つだけ
    expect(fetchRunHistoryFile.mock.calls.map((call) => call[1])).toEqual(
      Array.from({ length: 8 }, (_, index) => `s${String(11 - index)}.json`),
    );
    observer.fire();
    await waitFor(() => expect(cards()).toBe(12));
    expect(fetchRunHistoryFile).toHaveBeenCalledTimes(12);
    vi.unstubAllGlobals();
  });
});
