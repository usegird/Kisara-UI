import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunHistoryFile } from '@/port/run-history';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';
import { useTaskLogStore } from '@/store/use-task-log-store';

import { definition, definitionMap, widget } from '../helpers/definitions';

// 接続先のユーザーフォルダには触れない。読み書きを手元の表に置き換える
const disk = vi.hoisted(() => new Map<string, unknown>());
/** 読めない形のファイル（古い形など）の印 */
const UNREADABLE = 'unreadable';
const saved = vi.hoisted(() => vi.fn());
vi.mock('@/comfy/run-history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/run-history')>()),
  fetchRunHistoryFile: (_baseUrl: string, name: string) => {
    const stored = disk.get(name) as RunHistoryFile | typeof UNREADABLE | undefined;
    if (stored === undefined) return Promise.resolve({ kind: 'missing' });
    if (stored === UNREADABLE) return Promise.resolve({ kind: 'unreadable' });
    return Promise.resolve({ kind: 'file', file: stored });
  },
  saveRunHistoryFile: (_baseUrl: string, name: string, file: RunHistoryFile) => {
    saved(name);
    disk.set(name, file);
    return Promise.resolve();
  },
  // 一覧は名前と時期（ここでは置いた順）だけ。中身は読まない
  listRunHistoryFiles: () =>
    Promise.resolve([...disk.keys()].map((name, index) => ({ name, modified: index }))),
}));

// ─────────────────────────────
// 実行の記録の書き手と読み手
// ─────────────────────────────

const BASE = 'http://comfy.test';
/** 時刻の起点（2026 年 10 月 10 日 0 時 UTC） */
const T0 = Date.UTC(2026, 9, 10);
/** このタブのセッションの記録のファイル（セッションの id + `.json`） */
const FILE = 'tab-1.json';

/** `/history` の 1 件。セッションの既定はこのタブのもの（`tab-1`） */
function historyItem(start: number, files: readonly string[], session = 'tab-1'): unknown {
  return {
    prompt: [
      1,
      'id',
      {},
      { kisara: { session }, extra_pnginfo: { workflow: { nodes: [], links: [] } } },
      [],
    ],
    outputs: { '9': { images: files.map((filename) => ({ filename, type: 'output' })) } },
    status: { messages: [['execution_start', { timestamp: start }]] },
  };
}

function runsOf(name = FILE): number {
  return (disk.get(name) as RunHistoryFile | undefined)?.runs.length ?? 0;
}

beforeEach(() => {
  useSettingsStore.setState({ recordRunHistory: true });
  // 開いているワークフローのタブのセッションを `tab-1` にする
  useTabsStore.setState({
    tabs: [{ id: 'w', kind: 'workflow', runSession: 'tab-1' }],
    activeId: 'w',
    pastSessions: [],
  });
});

afterEach(() => {
  disk.clear();
  saved.mockClear();
  useRunHistoryStore.getState().clear();
  useTaskLogStore.setState({ entries: [] });
});

describe('実行の記録を書く', () => {
  it('このタブのセッションのファイル（セッションの id + .json）に足していく', async () => {
    const store = useRunHistoryStore.getState();
    await store.ingest(BASE, { a: historyItem(T0, ['a.png']) });
    await store.ingest(BASE, { b: historyItem(T0 + 60_000, ['b.png']) });

    expect(runsOf()).toBe(2);
    expect([...disk.keys()]).toEqual([FILE]);
  });

  it('既にあるファイルは、最初に書く前に読んで続きから足す（読み込み直したタブ）', async () => {
    await useRunHistoryStore.getState().ingest(BASE, { a: historyItem(T0, ['a.png']) });
    // 読み込み直した: 手元の中身は消えるが、ファイルは残り、セッションも変わらない
    const before = disk.get(FILE);
    useRunHistoryStore.getState().clear();
    disk.set(FILE, before);
    await useRunHistoryStore.getState().ingest(BASE, { b: historyItem(T0 + 1_000, ['b.png']) });

    expect(runsOf()).toBe(2);
  });

  it('新しい出力が無ければ読みにも書きにも行かない', async () => {
    const raw = { a: historyItem(T0, ['a.png']) };
    await useRunHistoryStore.getState().ingest(BASE, raw);
    await useRunHistoryStore.getState().ingest(BASE, raw);

    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('送ったときに控えたワークフロー名を付ける', async () => {
    useTaskLogStore.getState().recordSubmitted('a', { name: 'portrait', labels: {}, notes: [] });
    await useRunHistoryStore.getState().ingest(BASE, { a: historyItem(T0, ['a.png']) });

    const file = disk.get(FILE) as RunHistoryFile | undefined;
    expect(Object.values(file?.workflows ?? {})[0]?.name).toBe('portrait');
  });

  it('保存していない実行（temp だけ）も残す', async () => {
    const raw = {
      a: {
        prompt: [1, 'a', {}, { kisara: { session: 'tab-1' } }, []],
        outputs: { '9': { images: [{ filename: 'p.png', type: 'temp' }] } },
        status: { messages: [['execution_start', { timestamp: T0 }]] },
      },
    };
    await useRunHistoryStore.getState().ingest(BASE, raw);

    expect(runsOf()).toBe(1);
  });

  it('この画面から送った実行は、/history ではなく送った Workflow JSON で記録する', async () => {
    // サーバー側で書き換えられた Workflow JSON（`/history` の方）と見分けるため、カードを足す
    useDefinitionsStore.setState({
      definitions: definitionMap(definition('Sent', [widget('seed', 'INT')], { outputNode: true })),
    });
    const sentNode = { id: 5, type: 'Sent', pos: [0, 0], widgets_values: [7, 'fixed'] };
    useRunHistoryStore.getState().rememberSent('a', { nodes: [sentNode], links: [] });
    await useRunHistoryStore.getState().ingest(BASE, { a: historyItem(T0, ['a.png']) });

    const file = disk.get(FILE) as RunHistoryFile | undefined;
    const seeds = Object.values(file?.workflows ?? {}).map((entry) => entry.seeds);
    expect(seeds).toEqual([[['5', 'seed']]]);
    useDefinitionsStore.setState({ definitions: new Map() });
  });

  it('形の違う自分のファイルには書かない（上書きして消さない）', async () => {
    disk.set(FILE, UNREADABLE);
    await useRunHistoryStore
      .getState()
      .ingest(BASE, { a: historyItem(T0, ['a.png']) })
      .catch(() => {});

    expect(saved).not.toHaveBeenCalled();
    expect(disk.get(FILE)).toBe(UNREADABLE);
  });

  it('ほかのセッションで送った実行は、送った物を控えていても書かない', async () => {
    // 複製元のタブが送った実行。控え（Workflow JSON）が写っていても、送り元が違えば書かない
    useRunHistoryStore.getState().rememberSent('x', { nodes: [], links: [] });
    await useRunHistoryStore.getState().ingest(BASE, { x: historyItem(T0, ['x.png'], 'tab-2') });

    expect(saved).not.toHaveBeenCalled();
  });

  it('記録を書かない設定なら書かない', async () => {
    useSettingsStore.setState({ recordRunHistory: false });
    await useRunHistoryStore.getState().ingest(BASE, { a: historyItem(T0, ['a.png']) });

    expect(saved).not.toHaveBeenCalled();
  });
});
describe('セッション名', () => {
  it('今のセッションの記録のファイルに書き、読み直すと出す。空にすると外す', async () => {
    const store = useRunHistoryStore.getState();
    await store.ingest(BASE, { a: historyItem(T0, ['a.png']) });
    await store.setSessionName(BASE, '  morning batch ');

    expect((disk.get(FILE) as RunHistoryFile | undefined)?.name).toBe('morning batch');
    expect(runsOf()).toBe(1);

    useRunHistoryStore.getState().clear();
    await useRunHistoryStore.getState().loadSession(BASE);
    expect(useRunHistoryStore.getState().sessionName).toBe('morning batch');

    await useRunHistoryStore.getState().setSessionName(BASE, '');
    expect((disk.get(FILE) as RunHistoryFile | undefined)?.name).toBeUndefined();
  });

  it('記録を書かない設定なら名前も書かない', async () => {
    useSettingsStore.setState({ recordRunHistory: false });
    await useRunHistoryStore.getState().setSessionName(BASE, 'x');

    expect(saved).not.toHaveBeenCalled();
  });
});

describe('実行の記録を読む', () => {
  it('読み直すのは一覧だけで、中身は求められた分だけ読む', async () => {
    const store = useRunHistoryStore.getState();
    await store.ingest(BASE, { a: historyItem(T0, ['a.png']) });
    await store.load(BASE);

    expect(useRunHistoryStore.getState().entries.map((entry) => entry.name)).toEqual([FILE]);
    expect(useRunHistoryStore.getState().files.size).toBe(0);
    await store.fetchFiles(BASE, [FILE]);
    expect(useRunHistoryStore.getState().files.get(FILE)?.runs).toHaveLength(1);
  });

  it('書き足しても表示には足さず、読み直したときに出す', async () => {
    const store = useRunHistoryStore.getState();
    await store.ingest(BASE, { a: historyItem(T0, ['a.png']) });
    await store.load(BASE);
    await store.fetchFiles(BASE, [FILE]);
    await store.ingest(BASE, { b: historyItem(T0 + 1_000, ['b.png']) });

    const shown = (): number => useRunHistoryStore.getState().files.get(FILE)?.runs.length ?? 0;
    expect(shown()).toBe(1);
    await store.load(BASE);
    await store.fetchFiles(BASE, [FILE]);
    expect(shown()).toBe(2);
  });

  it('形の違うファイル（前の版など）は知らせずに外し、読めた分は出す', async () => {
    const store = useRunHistoryStore.getState();
    await store.ingest(BASE, { a: historyItem(T0, ['a.png']) });
    disk.set('old.json', UNREADABLE);
    await store.load(BASE);
    await store.fetchFiles(BASE, [FILE, 'old.json']);

    const state = useRunHistoryStore.getState();
    expect([...state.files.keys()]).toEqual([FILE]);
    expect(state.error).toBeNull();
  });
});
