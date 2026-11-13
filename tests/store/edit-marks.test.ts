import { beforeEach, describe, expect, it } from 'vitest';

import { createEditWatch } from '@/store/persist/edit-marks';
import { createMemorySessionStore } from '@/store/persist/session-store';
import { useRunReportStore } from '@/store/use-run-report-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// 編集の印。写しの関係にあるタブを 2 か所で直していないかを、
// 置き場のデータだけで見分ける（実行の報告の注意に使う）。
// ─────────────────────────────

/** 鍵を持たれているセッション（ほかのブラウザのタブが開いているもの） */
let held: Set<string> | null;
const heldSessions = () => Promise.resolve(held);

beforeEach(() => {
  held = new Set(['a', 'b']);
  useSettingsStore.setState({ clientId: 'me' });
  useRunReportStore.setState({ saveNotices: [] });
  // 開いているタブ: セッション a（写しでない）
  useTabsStore.setState({
    tabs: [{ id: 'tab-1', kind: 'workflow', runSession: 'a' }],
    activeId: 'tab-1',
  });
});

describe('編集の印', () => {
  it('編集したタブの元・書いたブラウザのタブ・時刻を残す', async () => {
    const store = createMemorySessionStore();
    const watch = createEditWatch(store, heldSessions, () => 100);

    await watch.mark({ id: 'tab-1', kind: 'workflow', runSession: 'a' }, 'portrait');

    expect(store.entries().get('edit:a')).toEqual({
      lineage: 'a',
      writer: 'me',
      name: 'portrait',
      savedAt: 100,
    });
  });

  it('同じ元の別のセッションが、読み込んだ後にほかで編集していたら注意を 1 回だけ出す', async () => {
    const store = createMemorySessionStore();
    const watch = createEditWatch(store, heldSessions, () => 100);
    // 複製したブラウザのタブ（セッション b、元は a）が編集した
    await store.put('edit:b', { lineage: 'a', writer: 'other', name: 'portrait', savedAt: 200 });

    await watch.check();
    await watch.check();

    expect(useRunReportStore.getState().saveNotices).toEqual([
      { kind: 'parallel', tabId: 'tab-1', name: 'portrait', savedAt: 200, source: 'b' },
    ]);
  });

  it('編集したセッションをどのブラウザのタブも開いていなくなったら外し、また編集されたら出し直す', async () => {
    const store = createMemorySessionStore();
    const watch = createEditWatch(store, heldSessions, () => 100);
    await store.put('edit:b', { lineage: 'a', writer: 'other', name: 'portrait', savedAt: 200 });
    await watch.check();
    expect(useRunReportStore.getState().saveNotices).toHaveLength(1);

    // 鍵の一覧が取れない間は確かめられないので外さない
    held = null;
    await watch.check();
    expect(useRunReportStore.getState().saveNotices).toHaveLength(1);

    held = new Set(['a']);
    await watch.check();
    expect(useRunReportStore.getState().saveNotices).toEqual([]);

    held = new Set(['a', 'b']);
    await store.put('edit:b', { lineage: 'a', writer: 'other', name: 'portrait', savedAt: 300 });
    await watch.check();
    expect(useRunReportStore.getState().saveNotices.map((notice) => notice.savedAt)).toEqual([300]);
  });

  it('読み込む前の編集・自分の編集・元の違うタブの編集では出さない', async () => {
    const store = createMemorySessionStore();
    const watch = createEditWatch(store, heldSessions, () => 100);
    await store.put('edit:b', { lineage: 'a', writer: 'other', name: 'x', savedAt: 50 });
    await store.put('edit:c', { lineage: 'a', writer: 'me', name: 'x', savedAt: 200 });
    await store.put('edit:d', { lineage: 'z', writer: 'other', name: 'x', savedAt: 200 });

    await watch.check();

    expect(useRunReportStore.getState().saveNotices).toEqual([]);
  });
});
