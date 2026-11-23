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

const fetchRunHistoryFile = vi.hoisted(() =>
  vi.fn<(baseUrl: string, name: string) => Promise<unknown>>(),
);
vi.mock('@/comfy/run-history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/run-history')>()),
  fetchRunHistoryFile,
}));

vi.mock('@/comfy/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/queue')>()),
  fetchOutputImage: () => Promise.reject(new Error('テストでは取らない')),
}));

const DEFINITIONS = definitionMap(
  definition('Text', [widget('text', 'STRING', { multiline: true })]),
);

function sent(text: string): Record<string, unknown> {
  return { nodes: [{ id: 1, type: 'Text', pos: [0, 0], widgets_values: [text] }], links: [] };
}

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
  const cat = {
    ...record([
      runSource('a', 1_000, ['a.png'], sent('cat')),
      runSource('b', 2_000, ['b.png'], sent('cat')),
    ]),
    name: 'cat session',
  };
  const dog = record([runSource('c', 999_000, ['c.png'], sent('dog'))]);
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
  it('セッションごとに 1 枚にし、日付・セッション名か無ければ id・回数とワークフロー名を出す', () => {
    showRecords();
    render(<HistoryPanel />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('cat session')).toBeDefined();
    expect(screen.getByText('tab-dog')).toBeDefined();
    expect(screen.getByText(formatDateTime(2_000))).toBeDefined();
    expect(screen.getByText('2 回 / portrait')).toBeDefined();
    expect(screen.getByText('1 回 / portrait')).toBeDefined();
  });

  it('削除のアイコンは確かめてから記録のファイルを消し、開いていた詳細を閉じる', () => {
    const removeSession = vi.fn(() => Promise.resolve());
    showRecords();
    useRunHistoryStore.setState({ removeSession });
    useHistoryDetailStore.getState().open('tab-cat.json');
    render(<HistoryPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'cat session の履歴を消す' }));
    expect(removeSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));

    expect(removeSession).toHaveBeenCalledWith('http://comfy.test', 'tab-cat.json');
    expect(useHistoryDetailStore.getState().key).toBeNull();
  });

  it('削除の確認でやめたら消さない', () => {
    const removeSession = vi.fn(() => Promise.resolve());
    showRecords();
    useRunHistoryStore.setState({ removeSession });
    render(<HistoryPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'tab-dog の履歴を消す' }));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(removeSession).not.toHaveBeenCalled();
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

    fireEvent.click(screen.getByText(formatDateTime(2_000)));

    expect(useHistoryDetailStore.getState().key).not.toBeNull();
    expect(useTaskDetailStore.getState().promptId).toBeNull();
  });

  it('縮小画像を押すと、そのカードの実行の並びでビューワーを開く', () => {
    showRecords();
    render(<HistoryPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'cat session の画像を開く' }));

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

    act(() =>
      useRunHistoryStore.setState((state) => ({ entries: [...state.entries], files: new Map() })),
    );

    expect(fetchFiles).toHaveBeenCalledWith(
      'http://comfy.test',
      expect.arrayContaining(['tab-cat.json', 'tab-dog.json']),
    );
    unmount();
    useRunHistoryStore.setState({ fetchFiles: original });
  });

  it('記録が 2 つ以上あればスライドバーを出し、範囲で絞る', () => {
    showRecords();
    render(<HistoryPanel />);

    expect(screen.getByRole('slider', { name: 'さかのぼる範囲' })).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

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
    expect(fetchRunHistoryFile.mock.calls.map((call) => call[1])).toEqual(
      Array.from({ length: 8 }, (_, index) => `s${String(11 - index)}.json`),
    );
    observer.fire();
    await waitFor(() => expect(cards()).toBe(12));
    expect(fetchRunHistoryFile).toHaveBeenCalledTimes(12);
    vi.unstubAllGlobals();
  });
});
