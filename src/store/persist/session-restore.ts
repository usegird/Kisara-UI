import type { StateStorage } from 'zustand/middleware';

import { isRecord } from '@/lib/guards';
import { newShortId } from '@/lib/id';
import { safeStorage } from '@/lib/safe-storage';
import { hasWebLocks } from '@/lib/web-locks';
import { chatsOpenElsewhere } from '@/store/persist/chat-locks';
import { EDIT_KEY_PREFIX, editKey } from '@/store/persist/edit-marks';
import { heldSessionLocks, sessionsOf } from '@/store/persist/session';
import {
  fromStored,
  LAYOUT_KEY,
  parseLayout,
  TAB_KEY_PREFIX,
  TAB_LAYOUT_KEY,
  tabKey,
} from '@/store/persist/session-format';
import { defaultSessionStore, getOrNull, type SessionStore } from '@/store/persist/session-store';
import { useRunReportStore, type SaveNotice } from '@/store/use-run-report-store';
import { clientIdReady, clientIdRenewed } from '@/store/use-settings-store';
import { useSidePanelStore } from '@/store/use-side-panel-store';
import {
  useTabsStore,
  whenSessionsClaimed,
  type Tab,
  type TabSnapshot,
} from '@/store/use-tabs-store';

function readText(storage: StateStorage, key: string): unknown {
  try {
    const text = storage.getItem(key);
    return typeof text === 'string' && text.length > 0 ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

interface Written {
  readonly writer: string | null;
  readonly savedAt: number | null;
}

async function loadSnapshots(
  store: SessionStore,
  tabs: readonly Tab[],
): Promise<{ snapshots: Record<string, TabSnapshot>; written: Record<string, Written> }> {
  const snapshots: Record<string, TabSnapshot> = {};
  const written: Record<string, Written> = {};
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.runSession === undefined) return;
      const raw = await getOrNull(store, tabKey(tab.runSession));
      const snapshot = fromStored(raw);
      if (snapshot === null || !isRecord(raw)) return;
      snapshots[tab.id] = snapshot;
      written[tab.id] = {
        writer: typeof raw.writer === 'string' ? raw.writer : null,
        savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : null,
      };
    }),
  );
  return { snapshots, written };
}

async function noticeOtherWriters(
  tabs: readonly Tab[],
  snapshots: Readonly<Record<string, TabSnapshot>>,
  written: Readonly<Record<string, Written>>,
): Promise<void> {
  const clientId = await clientIdReady;
  if (await clientIdRenewed) return;
  const notices: SaveNotice[] = [];
  for (const tab of tabs) {
    const entry = written[tab.id];
    if (entry === undefined || entry.writer === null || entry.writer === clientId) continue;
    notices.push({
      kind: 'restored',
      tabId: tab.id,
      name: snapshots[tab.id]?.name ?? '',
      savedAt: entry.savedAt,
    });
  }
  if (notices.length > 0) useRunReportStore.getState().addSaveNotices(notices);
}

async function moveSession(store: SessionStore, from: string): Promise<string> {
  const fresh = newShortId();
  const raw = await getOrNull(store, tabKey(from));
  if (raw !== null) {
    await store.put(tabKey(fresh), raw);
    await store.delete(tabKey(from));
  }
  await store.delete(editKey(from));
  return fresh;
}

async function withoutChatsOpenElsewhere(layout: {
  readonly tabs: readonly Tab[];
  readonly activeId: string;
}): Promise<{ tabs: readonly Tab[]; activeId: string }> {
  const ids = layout.tabs.flatMap((tab) => (tab.chatId === undefined ? [] : [tab.chatId]));
  const elsewhere = ids.length === 0 ? new Set<string>() : await chatsOpenElsewhere(ids);
  if (elsewhere.size === 0) return layout;
  const tabs = layout.tabs.filter((tab) => tab.chatId === undefined || !elsewhere.has(tab.chatId));
  const kept = tabs.some((tab) => tab.id === layout.activeId);
  return { tabs, activeId: kept ? layout.activeId : (tabs[0]?.id ?? '') };
}

async function renewSessions(store: SessionStore, tabs: readonly Tab[]): Promise<readonly Tab[]> {
  try {
    const held = await heldSessionLocks();
    if (held === null) return tabs;
    const renewed: Tab[] = [];
    for (const tab of tabs) {
      const session = tab.runSession;
      if (tab.kind !== 'workflow' || session === undefined || held.has(session)) {
        renewed.push(tab);
        continue;
      }
      renewed.push({ ...tab, runSession: await moveSession(store, session) });
    }
    return renewed;
  } catch {
    return tabs;
  }
}

interface Orphan {
  readonly session: string;
  readonly snapshot: TabSnapshot;
  readonly savedAt: number;
}

async function adoptOrphans(store: SessionStore, renew: boolean): Promise<void> {
  if (!hasWebLocks()) return;
  await whenSessionsClaimed();

  const keep = new Set<string>(sessionsOf(useTabsStore.getState().tabs));
  for (const session of (await heldSessionLocks()) ?? []) keep.add(session);
  const keys = await store.keys();
  const orphans: Orphan[] = [];
  for (const key of keys) {
    if (!key.startsWith(TAB_KEY_PREFIX)) continue;
    const session = key.slice(TAB_KEY_PREFIX.length);
    if (keep.has(session)) continue;
    const orphan = await readOrphan(store, key, renew);
    if (orphan !== null) orphans.push(orphan);
  }
  orphans.sort((a, b) => a.savedAt - b.savedAt);
  for (const session of await useTabsStore.getState().adopt(orphans)) keep.add(session);
  await removeEmptyEditMarks(store, keys, keep);
}

async function readOrphan(
  store: SessionStore,
  key: string,
  renew: boolean,
): Promise<Orphan | null> {
  const session = key.slice(TAB_KEY_PREFIX.length);
  const raw = await getOrNull(store, key);
  const snapshot = fromStored(raw);
  if (snapshot === null || !isRecord(raw) || snapshot.workflow === null) {
    await store.delete(key);
    return null;
  }
  const savedAt = typeof raw.savedAt === 'number' ? raw.savedAt : 0;
  return { session: renew ? await moveSession(store, session) : session, snapshot, savedAt };
}

async function removeEmptyEditMarks(
  store: SessionStore,
  keys: readonly string[],
  keep: ReadonlySet<string>,
): Promise<void> {
  const stored = new Set(keys.filter((key) => key.startsWith(TAB_KEY_PREFIX)));
  for (const key of keys) {
    if (!key.startsWith(EDIT_KEY_PREFIX)) continue;
    const session = key.slice(EDIT_KEY_PREFIX.length);
    if (!keep.has(session) && !stored.has(tabKey(session))) await store.delete(key);
  }
}

async function adoptQuietly(store: SessionStore, renew: boolean): Promise<void> {
  try {
    await adoptOrphans(store, renew);
  } catch {
  }
}

export async function restoreSession(
  store: SessionStore = defaultSessionStore(),
  tabStorage: StateStorage = safeStorage('session'),
): Promise<boolean> {
  const own = parseLayout(readText(tabStorage, TAB_LAYOUT_KEY));
  const layout = own ?? parseLayout(await getOrNull(store, LAYOUT_KEY));

  const renew = own === null;
  if (layout !== null) {
    const kept = renew ? await withoutChatsOpenElsewhere(layout) : layout;
    const tabs = renew ? await renewSessions(store, kept.tabs) : kept.tabs;
    const { snapshots, written } = await loadSnapshots(store, tabs);
    useTabsStore.getState().restore(tabs, kept.activeId, snapshots);
    if (!renew) void noticeOtherWriters(tabs, snapshots, written);
    await adoptQuietly(store, renew);
    watchActiveReport();
    return true;
  }

  await adoptQuietly(store, renew);
  watchActiveReport();
  return useTabsStore.getState().tabs.length > 1;
}

function watchActiveReport(): void {
  useSidePanelStore.getState().watchReport(useTabsStore.getState().activeId);
}
