import type { StateCreator } from 'zustand';

import { unlinkedNodeIds } from '@/graph/rows';
import { advanceSeeds } from '@/graph/seed-control';
import type { NodeId } from '@/graph/types';
import { omitKey } from '@/lib/own-key';
import {
  advanceCounter,
  applySnapshot,
  claimSession,
  currentSnapshot,
  EMPTY_SNAPSHOT,
  holdsSession,
  newSession,
  nextId,
  startClaimingSessions,
  withPast,
} from '@/store/slices/tabs-kit';
import { useGraphStore } from '@/store/use-graph-store';
import type { TabsState } from '@/store/use-tabs-store';

type TabsSessionActions = Pick<
  TabsState,
  'renewSession' | 'readTab' | 'advanceTabSeeds' | 'refreshHiddenCandidates' | 'adopt' | 'restore'
>;

export const createTabsSessionSlice: StateCreator<TabsState, [], [], TabsSessionActions> = (
  set,
  get,
) => ({
  renewSession: (id) => {
    const { tabs, pastSessions } = get();
    const tab = tabs.find((item) => item.id === id);
    if (tab === undefined) return;
    set({
      tabs: tabs.map((item) => (item.id === id ? { ...item, runSession: newSession() } : item)),
      pastSessions: withPast(pastSessions, tab.runSession),
    });
  },

  readTab: (id) => {
    const { activeId, snapshots, tabs } = get();
    if (!tabs.some((tab) => tab.id === id)) return null;
    return id === activeId ? currentSnapshot() : (snapshots[id] ?? EMPTY_SNAPSHOT);
  },

  advanceTabSeeds: (id, definitions) => {
    const { activeId, snapshots } = get();
    if (id === activeId) {
      useGraphStore.getState().advanceSeeds(definitions);
      return;
    }

    const snapshot = snapshots[id];
    if (!snapshot?.workflow) return;
    const workflow = advanceSeeds(snapshot.workflow, definitions);
    if (workflow === snapshot.workflow) return;

    set({ snapshots: { ...snapshots, [id]: { ...snapshot, workflow, dirty: true } } });
  },

  refreshHiddenCandidates: () => {
    useGraphStore.getState().refreshHiddenCandidates();
    const snapshots = Object.fromEntries(
      Object.entries(get().snapshots).map(([id, snapshot]) => [
        id,
        {
          ...snapshot,
          hiddenCandidates: snapshot.workflow
            ? unlinkedNodeIds(snapshot.workflow)
            : new Set<NodeId>(),
        },
      ]),
    );
    set({ snapshots });
  },

  adopt: async (entries) => {
    const adopted: string[] = [];
    for (const { session, snapshot } of entries) {
      if (holdsSession(session) || !(await claimSession(session))) continue;
      const id = nextId();
      set({
        tabs: [...get().tabs, { id, kind: 'workflow', runSession: session }],
        snapshots: { ...get().snapshots, [id]: snapshot },
      });
      adopted.push(session);
    }
    return adopted;
  },

  restore: (tabs, activeId, snapshots) => {
    if (tabs.length === 0) return;

    advanceCounter(tabs);
    const rest = omitKey(snapshots, activeId);

    const withSessions = tabs.map((tab) =>
      tab.kind === 'workflow' && tab.runSession === undefined
        ? { ...tab, runSession: newSession() }
        : tab,
    );
    set({ tabs: withSessions, activeId, snapshots: rest });
    applySnapshot(snapshots[activeId] ?? EMPTY_SNAPSHOT);
    startClaimingSessions({ set, get });
  },
});
