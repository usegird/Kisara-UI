import type { StateStorage } from 'zustand/middleware';

import { safeStorage } from '@/lib/safe-storage';
import { heldLockNames } from '@/lib/web-locks';
import { WRITE_DELAY_MS } from '@/store/persist/app-db';
import { createEditWatch, editKey } from '@/store/persist/edit-marks';
import {
  buildLayout,
  LAYOUT_KEY,
  TAB_LAYOUT_KEY,
  tabKey,
  toStored,
  type StoredSnapshot,
} from '@/store/persist/session-format';
import { defaultSessionStore, type SessionStore } from '@/store/persist/session-store';
import { useAppValuesStore } from '@/store/use-app-values-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useRunReportStore } from '@/store/use-run-report-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { warnUnsaved } from '@/store/use-storage-warnings-store';
import {
  EMPTY_SNAPSHOT,
  holdsSession,
  SESSION_LOCK_PREFIX,
  useTabsStore,
  type Tab,
  type TabSnapshot,
} from '@/store/use-tabs-store';

// ─────────────────────────────
// 開いていたものの控えを書く。読み込み直しても続きから始められるよう、タブの並び・選んでいたタブ・
// それぞれの中身（書きかけを含む）を端末に残す。読み戻しは session-restore.ts。
// ─────────────────────────────

function activeSnapshot(): TabSnapshot {
  const graph = useGraphStore.getState();

  return {
    workflow: graph.workflow,
    name: graph.name,
    savedPath: graph.savedPath,
    savedOn: graph.savedOn,
    savedOwn: graph.savedOwn,
    dirty: graph.dirty,
    selectedNodeIds: graph.selectedNodeIds,
    hiddenCandidates: graph.hiddenCandidates,
    appValues: useAppValuesStore.getState().values,
  };
}

/**
 * 書く 1 件。書いたブラウザのタブと時刻を添える
 */
function stamped(snapshot: TabSnapshot): StoredSnapshot {
  return {
    ...toStored(snapshot),
    writer: useSettingsStore.getState().clientId,
    savedAt: Date.now(),
  };
}

/** タブの中身（選んでいるタブはストアに載っている今のもの） */
function snapshotOf(tab: Tab): TabSnapshot {
  const { activeId, snapshots } = useTabsStore.getState();
  return tab.id === activeId ? activeSnapshot() : (snapshots[tab.id] ?? EMPTY_SNAPSHOT);
}

/**
 * 残すタブ。ワークフローを開いていないタブ（接続の案内を出しているもの）は残さない。
 * 会話のタブは残す（中身は会話の控え）
 */
function keptTabs(tabs: readonly Tab[]): Tab[] {
  return tabs.filter((tab) => tab.kind === 'chat' || snapshotOf(tab).workflow !== null);
}

/** 並べたタブのセッション */
export function sessionsOf(tabs: readonly Tab[]): string[] {
  return tabs.flatMap((tab) => (tab.runSession === undefined ? [] : [tab.runSession]));
}

/** 鍵（Web Locks）が持たれているセッション。鍵の一覧が取れなければ null */
export async function heldSessionLocks(): Promise<Set<string> | null> {
  const names = await heldLockNames();
  if (names === null) return null;
  const held = new Set<string>();
  for (const name of names) {
    if (name.startsWith(SESSION_LOCK_PREFIX)) held.add(name.slice(SESSION_LOCK_PREFIX.length));
  }
  return held;
}

/** 動いている書き込み。控えを捨てるときに止める（止めないと閉じる間際に書き戻される） */
let stopPersist: (() => void) | null = null;

/** 書いた中身と比べる手掛かり。中身は作り直さずに差し替えるので、参照が同じなら同じ */
function snapshotMarks(snapshot: TabSnapshot): readonly unknown[] {
  return [
    snapshot.workflow,
    snapshot.name,
    snapshot.savedPath,
    snapshot.savedOn,
    snapshot.savedOwn,
    snapshot.dirty,
    snapshot.selectedNodeIds,
    snapshot.appValues,
  ];
}

function sameMarks(a: readonly unknown[] | undefined, b: readonly unknown[]): boolean {
  return a !== undefined && a.length === b.length && a.every((mark, index) => mark === b[index]);
}

interface ChangedTab {
  readonly tab: Tab;
  readonly session: string;
  readonly stored: StoredSnapshot;
  readonly marks: readonly unknown[];
  /** 読み戻してから編集したか（写しただけなら知らせない） */
  readonly edited: boolean;
}

/**
 * 開いているものを追いかけて端末へ書く。止めるための関数を返す。
 * 書き込みは `WRITE_DELAY_MS` だけ待ち合わせ、閉じる・隠れるときに最後の 1 回を出す。
 * 中身は変わったタブの分だけを書き、閉じたタブの分は消す（このブラウザのタブが鍵を持つものだけ）。
 * 接続前のタブは並びにも中身にも書かない（閉じたタブと同じく、前に書いた分は消す）
 */
export function startSessionPersist(
  store: SessionStore = defaultSessionStore(),
  tabStorage: StateStorage = safeStorage('session'),
): () => void {
  stopPersist?.();
  let timer: ReturnType<typeof setTimeout> | null = null;
  // 書き込みを順に並べる。前のものが終わってから次を出す（先に出したものが後から届いて、
  // 新しい控えを上書きしないように）
  let queue: Promise<void> = Promise.resolve();
  /**
   * セッション → 最後に書いた中身の手掛かり。始めた時点の中身は読み戻したもの（置き場と同じ）
   * なので書いたものとして覚え、最初の書き込みで全タブを書き直さない
   */
  const written = new Map<string, readonly unknown[]>();
  for (const tab of useTabsStore.getState().tabs) {
    if (tab.runSession !== undefined) written.set(tab.runSession, snapshotMarks(snapshotOf(tab)));
  }
  /** 前に書いたときに並んでいたセッション（閉じた・切り替えたものを見つける） */
  let previous = new Set(sessionsOf(useTabsStore.getState().tabs));
  /**
   * タブ → 読み戻した時点の中身の手掛かり。セッションを作り直して写した直後の書き込みは
   * 編集ではないので、写しの関係にあるタブへ知らせない（一度編集したら外す）
   */
  const loaded = new Map<string, readonly unknown[]>();
  for (const tab of useTabsStore.getState().tabs)
    loaded.set(tab.id, snapshotMarks(snapshotOf(tab)));
  // 写しの関係にあるタブの編集を、置き場の印から見分ける
  const watch = createEditWatch(store, heldSessionLocks);

  const write = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const { tabs, activeId } = useTabsStore.getState();
    const layout = buildLayout(keptTabs(tabs), activeId);
    const changed = changedTabsOf(layout.tabs, written, loaded);
    const current = new Set(sessionsOf(layout.tabs));
    const removed = [...previous].filter((id) => !current.has(id) && holdsSession(id));
    previous = current;

    try {
      tabStorage.setItem(TAB_LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      // ブラウザのタブごとの保存領域に書けなくても、最後に保存した並びは残る
    }
    queue = queue
      .then(() => saveChanges({ store, watch, written }, { layout, changed, removed }))
      .catch(() => {
        // 書けない設定・容量超過でも画面は続ける。読み込み直すと続きから始められないので警告する
        warnUnsaved('draft');
      });
  };

  const schedule = (): void => {
    if (timer !== null) return;
    timer = setTimeout(write, WRITE_DELAY_MS);
  };

  const unsubscribe = [
    useTabsStore.subscribe(schedule),
    useGraphStore.subscribe(schedule),
    useAppValuesStore.subscribe(schedule),
  ];

  // 閉じるときは `pagehide` だけが確実に来る（`beforeunload` は来ないことがある）
  const flush = (): void => write();
  globalThis.addEventListener?.('pagehide', flush);
  globalThis.addEventListener?.('visibilitychange', flush);

  const stop = (): void => {
    for (const unsubscribeOne of unsubscribe) unsubscribeOne();
    globalThis.removeEventListener?.('pagehide', flush);
    globalThis.removeEventListener?.('visibilitychange', flush);
    if (timer !== null) clearTimeout(timer);
    if (stopPersist === stop) stopPersist = null;
  };
  stopPersist = stop;
  return stop;
}

/** 書く先と、書いた中身の手掛かり */
interface SaveTarget {
  readonly store: SessionStore;
  readonly watch: ReturnType<typeof createEditWatch>;
  /** セッション → 最後に書いた中身の手掛かり */
  readonly written: Map<string, readonly unknown[]>;
}

/** 1 回に書くもの */
interface SavePlan {
  readonly layout: ReturnType<typeof buildLayout>;
  readonly changed: readonly ChangedTab[];
  /** 閉じた・切り替えたセッション（このブラウザのタブが鍵を持つものだけ） */
  readonly removed: readonly string[];
}

/**
 * 前に書いたときから中身が変わったタブ。読み戻した時点から編集したタブは、`loaded` から外す
 * （一度編集したら、写しただけの書き込みとは見なさない）
 */
function changedTabsOf(
  tabs: readonly Tab[],
  written: ReadonlyMap<string, readonly unknown[]>,
  loaded: Map<string, readonly unknown[]>,
): ChangedTab[] {
  const changed: ChangedTab[] = [];
  for (const tab of tabs) {
    if (tab.runSession === undefined) continue;
    const snapshot = snapshotOf(tab);
    const marks = snapshotMarks(snapshot);
    if (sameMarks(written.get(tab.runSession), marks)) continue;
    const edited = !sameMarks(loaded.get(tab.id), marks);
    if (edited) loaded.delete(tab.id);
    changed.push({ tab, session: tab.runSession, stored: stamped(snapshot), marks, edited });
  }
  return changed;
}

/** 並びと変わったタブの中身を書き、閉じたタブの分を消し、ほかのセッションの編集の印を読む */
async function saveChanges(target: SaveTarget, plan: SavePlan): Promise<void> {
  const { store, watch, written } = target;
  await store.put(LAYOUT_KEY, plan.layout);
  for (const { tab, session, stored, marks, edited } of plan.changed) {
    await store.put(tabKey(session), stored);
    written.set(session, marks);
    // 一時保存を自分で書き直したので、ほかのブラウザのタブが書いていた注意は解消した
    useRunReportStore
      .getState()
      .dropSaveNotices((notice) => notice.kind === 'restored' && notice.tabId === tab.id);
    // 編集したら印を残す（写しの関係にあるほかのブラウザのタブが読む）
    if (edited) await watch.mark(tab, stored.name);
  }
  for (const session of plan.removed) {
    await store.delete(tabKey(session));
    await store.delete(editKey(session));
    written.delete(session);
  }
  // ほかのセッションの編集の印を読む（書くたびと、画面に戻ったとき）
  await watch.check();
}

/**
 * 開いていたタブの控えを捨てる。控えが壊れていて画面が
 * 描けないときの最後の手。**書き込みを止めてから消す**。この後は読み込み直す前提。
 * ブラウザのタブごとの並びに残っていれば、それも消す（読み込み直したときに戻されないよう）
 */
export async function discardSession(
  store: SessionStore = defaultSessionStore(),
  tabStorage: StateStorage = safeStorage('session'),
): Promise<void> {
  stopPersist?.();
  try {
    tabStorage.removeItem(TAB_LAYOUT_KEY);
  } catch {
    // 消せない設定でも続ける
  }
  try {
    for (const key of await store.keys()) await store.delete(key);
  } catch {
    // 消せない設定でも、読み込み直せば戻せないだけで続けられる
  }
}
