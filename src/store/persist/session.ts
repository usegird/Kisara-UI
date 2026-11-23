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

function stamped(snapshot: TabSnapshot): StoredSnapshot {
  return {
    ...toStored(snapshot),
    writer: useSettingsStore.getState().clientId,
    savedAt: Date.now(),
  };
}

function snapshotOf(tab: Tab): TabSnapshot {
  const { activeId, snapshots } = useTabsStore.getState();
  return tab.id === activeId ? activeSnapshot() : (snapshots[tab.id] ?? EMPTY_SNAPSHOT);
}

function keptTabs(tabs: readonly Tab[]): Tab[] {
  return tabs.filter((tab) => tab.kind === 'chat' || snapshotOf(tab).workflow !== null);
}

export function sessionsOf(tabs: readonly Tab[]): string[] {
  return tabs.flatMap((tab) => (tab.runSession === undefined ? [] : [tab.runSession]));
}

export async function heldSessionLocks(): Promise<Set<string> | null> {
  const names = await heldLockNames();
  if (names === null) return null;
  const held = new Set<string>();
  for (const name of names) {
    if (name.startsWith(SESSION_LOCK_PREFIX)) held.add(name.slice(SESSION_LOCK_PREFIX.length));
  }
  return held;
}

let stopPersist: (() => void) | null = null;

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
  readonly edited: boolean;
}

export function startSessionPersist(
  store: SessionStore = defaultSessionStore(),
  tabStorage: StateStorage = safeStorage('session'),
): () => void {
  stopPersist?.();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<void> = Promise.resolve();
  const written = new Map<string, readonly unknown[]>();
  for (const tab of useTabsStore.getState().tabs) {
    if (tab.runSession !== undefined) written.set(tab.runSession, snapshotMarks(snapshotOf(tab)));
  }
  let previous = new Set(sessionsOf(useTabsStore.getState().tabs));
  const loaded = new Map<string, readonly unknown[]>();
  for (const tab of useTabsStore.getState().tabs)
    loaded.set(tab.id, snapshotMarks(snapshotOf(tab)));
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
    }
    queue = queue
      .then(() => saveChanges({ store, watch, written }, { layout, changed, removed }))
      .catch(() => {
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

interface SaveTarget {
  readonly store: SessionStore;
  readonly watch: ReturnType<typeof createEditWatch>;
  readonly written: Map<string, readonly unknown[]>;
}

interface SavePlan {
  readonly layout: ReturnType<typeof buildLayout>;
  readonly changed: readonly ChangedTab[];
  readonly removed: readonly string[];
}

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

async function saveChanges(target: SaveTarget, plan: SavePlan): Promise<void> {
  const { store, watch, written } = target;
  await store.put(LAYOUT_KEY, plan.layout);
  for (const { tab, session, stored, marks, edited } of plan.changed) {
    await store.put(tabKey(session), stored);
    written.set(session, marks);
    useRunReportStore
      .getState()
      .dropSaveNotices((notice) => notice.kind === 'restored' && notice.tabId === tab.id);
    if (edited) await watch.mark(tab, stored.name);
  }
  for (const session of plan.removed) {
    await store.delete(tabKey(session));
    await store.delete(editKey(session));
    written.delete(session);
  }
  await watch.check();
}

export async function discardSession(
  store: SessionStore = defaultSessionStore(),
  tabStorage: StateStorage = safeStorage('session'),
): Promise<void> {
  stopPersist?.();
  try {
    tabStorage.removeItem(TAB_LAYOUT_KEY);
  } catch {
  }
  try {
    for (const key of await store.keys()) await store.delete(key);
  } catch {
  }
}
