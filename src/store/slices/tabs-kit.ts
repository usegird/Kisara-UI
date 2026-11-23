import type { StoreApi } from 'zustand';

import { comfyUrlOf, type ChatPlace } from '@/chat/types';
import { newShortId } from '@/lib/id';
import { writeTabList } from '@/lib/tab-id';
import { hold } from '@/lib/web-locks';
import { retainNodeViews } from '@/store/kit/node-views-cache';
import { captureTabScoped, restoreTabScoped } from '@/store/kit/tab-scoped';
import { useAppValuesStore } from '@/store/use-app-values-store';
import { useGraphStore } from '@/store/use-graph-store';
import type { Tab, TabKind, TabSnapshot, TabsState } from '@/store/use-tabs-store';

export const PAST_SESSIONS_KEY = 'kisaraui.session.past';

const PAST_SESSION_LIMIT = 50;

export const SESSION_LOCK_PREFIX = 'kisaraui.session:';

const TAB_ID_PREFIX = 'tab-';

export const EMPTY_SNAPSHOT: TabSnapshot = {
  workflow: null,
  name: '',
  savedPath: null,
  dirty: false,
  selectedNodeIds: [],
  hiddenCandidates: new Set(),
  appValues: new Map(),
};

interface TabsStoreAccess {
  readonly set: StoreApi<TabsState>['setState'];
  readonly get: () => TabsState;
}

let counter = 0;

let sessionsClaimed: Promise<void> = Promise.resolve();

const heldSessions = new Set<string>();

export function whenSessionsClaimed(): Promise<void> {
  return sessionsClaimed;
}

export function holdsSession(session: string): boolean {
  return heldSessions.has(session);
}

export function newSession(): string {
  const session = newShortId();
  heldSessions.add(session);
  void hold(sessionLock(session));
  return session;
}

export async function claimSession(session: string): Promise<boolean> {
  if (!(await hold(sessionLock(session)))) return false;
  heldSessions.add(session);
  return true;
}

export function withPast(past: readonly string[], session: string | undefined): readonly string[] {
  if (session === undefined) return past;
  const next = [session, ...past.filter((id) => id !== session)].slice(0, PAST_SESSION_LIMIT);
  writeTabList(PAST_SESSIONS_KEY, next);
  return next;
}

export function nextId(): string {
  counter += 1;
  return `${TAB_ID_PREFIX}${String(counter)}`;
}

export function advanceCounter(tabs: readonly Tab[]): void {
  for (const tab of tabs) {
    const number = Number(tab.id.replace(TAB_ID_PREFIX, ''));
    if (Number.isFinite(number) && number > counter) counter = number;
  }
}

export function startClaimingSessions(store: TabsStoreAccess): void {
  sessionsClaimed = claimSessions(store);
}

export function nextActiveId(
  tabs: readonly Tab[],
  closing: string,
  activeId: string,
): string | null {
  if (closing !== activeId) return activeId;

  const index = tabs.findIndex((tab) => tab.id === closing);
  const rest = tabs.filter((tab) => tab.id !== closing);
  if (rest.length === 0) return null;

  return (rest[index] ?? rest[rest.length - 1] ?? rest[0])?.id ?? null;
}

export function lineageOf(tab: Tab): string | undefined {
  return tab.origin ?? tab.runSession;
}

export function tabPlace(place: ChatPlace): Pick<Tab, 'chatComfyUrl' | 'chatBoth'> {
  return {
    chatComfyUrl: comfyUrlOf(place) ?? undefined,
    chatBoth: place.kind === 'both' || undefined,
  };
}

export function createTabAdder(
  store: TabsStoreAccess,
): (kind: TabKind, snapshot: TabSnapshot, chatId?: string) => string {
  return (kind, snapshot, chatId) => {
    const id = nextId();
    const { activeId, tabs, snapshots } = store.get();
    store.set({
      tabs: [...tabs, newTabOf(id, kind, chatId)],
      activeId: id,
      snapshots: { ...snapshots, [activeId]: currentSnapshot() },
    });
    applySnapshot(snapshot);
    return id;
  };
}

export function currentSnapshot(): TabSnapshot {
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
    history: graph.history,
    dialogs: captureTabScoped(),
  };
}

export function applySnapshot(snapshot: TabSnapshot): void {
  useGraphStore.getState().restore(snapshot);
  useAppValuesStore.getState().restore(snapshot.appValues);
  restoreTabScoped(snapshot.dialogs);
}

export function forgetClosed(snapshots: Readonly<Record<string, TabSnapshot>>): void {
  retainNodeViews([
    useGraphStore.getState().workflow,
    ...Object.values(snapshots).map((snapshot) => snapshot.workflow),
  ]);
}

function newTabOf(id: string, kind: TabKind, chatId: string | undefined): Tab {
  if (kind === 'workflow') return { id, kind, runSession: newSession() };
  if (kind === 'chat') return { id, kind, chatId };
  return { id, kind };
}

async function claimSessions(store: TabsStoreAccess): Promise<void> {
  for (const tab of store.get().tabs) {
    const session = tab.runSession;
    if (session === undefined || heldSessions.has(session)) continue;
    if (await hold(sessionLock(session))) {
      heldSessions.add(session);
      continue;
    }
    store.set({
      tabs: store
        .get()
        .tabs.map((item) =>
          item.id === tab.id
            ? { ...item, runSession: newSession(), origin: lineageOf(item) }
            : item,
        ),
    });
  }
}

function sessionLock(session: string): string {
  return `${SESSION_LOCK_PREFIX}${session}`;
}
