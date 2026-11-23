import type { StateCreator, StoreApi } from 'zustand';

import { clamp } from '@/lib/clamp';
import { omitKey } from '@/lib/own-key';
import {
  applySnapshot,
  createTabAdder,
  currentSnapshot,
  EMPTY_SNAPSHOT,
  forgetClosed,
  newSession,
  nextActiveId,
  nextId,
  withPast,
} from '@/store/slices/tabs-kit';
import { useChatStore } from '@/store/use-chat-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useImageTabsStore } from '@/store/use-image-tabs-store';
import type { Tab, TabSnapshot, TabsState } from '@/store/use-tabs-store';

type TabsSwitchActions = Pick<
  TabsState,
  'addTab' | 'openImageTab' | 'moveTab' | 'selectTab' | 'closeTab' | 'prepareOpen' | 'duplicateTab'
>;

interface ClosedTabs {
  readonly target: string | null;
  readonly rest: readonly Tab[];
  readonly snapshots: Readonly<Record<string, TabSnapshot>>;
}

export const createTabsSwitchSlice: StateCreator<TabsState, [], [], TabsSwitchActions> = (
  set,
  get,
) => {
  const addTabOf = createTabAdder({ set, get });
  return {
    addTab: () => addTabOf('workflow', EMPTY_SNAPSHOT),

    openImageTab: (name) => {
      const { activeId, tabs } = get();
      const snapshot = { ...EMPTY_SNAPSHOT, name };
      const active = tabs.find((tab) => tab.id === activeId);
      if (active?.kind !== 'workflow' || useGraphStore.getState().workflow !== null) {
        return addTabOf('image', snapshot);
      }
      set({ tabs: tabs.map((tab) => (tab.id === activeId ? { id: tab.id, kind: 'image' } : tab)) });
      applySnapshot(snapshot);
      return activeId;
    },

    moveTab: (id, index) => {
      const { tabs } = get();
      const from = tabs.findIndex((tab) => tab.id === id);
      const to = clamp(index, 0, tabs.length - 1);
      const moving = tabs[from];
      if (moving === undefined || from === to) return;
      const rest = tabs.filter((tab) => tab.id !== id);
      set({ tabs: [...rest.slice(0, to), moving, ...rest.slice(to)] });
    },

    selectTab: (id) => {
      const { activeId, snapshots, tabs } = get();
      if (id === activeId || !tabs.some((tab) => tab.id === id)) return;

      const outgoing = currentSnapshot();
      const incoming = snapshots[id] ?? EMPTY_SNAPSHOT;
      const next = omitKey({ ...snapshots, [activeId]: outgoing }, id);

      set({ activeId: id, snapshots: next });
      applySnapshot(incoming);
    },

    closeTab: (id) => {
      const { tabs, activeId, snapshots } = get();
      if (!tabs.some((tab) => tab.id === id)) return;

      useImageTabsStore.getState().remove(id);
      const chatId = tabs.find((tab) => tab.id === id)?.chatId;
      if (chatId !== undefined) useChatStore.getState().unload(chatId);
      const target = nextActiveId(tabs, id, activeId);
      const rest = tabs.filter((tab) => tab.id !== id);
      const closing = tabs.find((tab) => tab.id === id)?.runSession;
      set({ pastSessions: withPast(get().pastSessions, closing) });
      settleClosed(set, activeId, { target, rest, snapshots: omitKey(snapshots, id) });
    },

    prepareOpen: () => {
      const { tabs, activeId } = get();
      const other = tabs.some((tab) => tab.id === activeId && tab.kind !== 'workflow');
      if (!other && useGraphStore.getState().workflow === null) return;
      get().addTab();
    },

    duplicateTab: (id) => duplicateTabOf({ set, get }, id),
  };
};

function duplicateTabOf(
  { set, get }: { set: StoreApi<TabsState>['setState']; get: () => TabsState },
  id: string,
): string | null {
  const { tabs, activeId, snapshots } = get();
  const index = tabs.findIndex((tab) => tab.id === id);
  const source = get().readTab(id);
  if (tabs[index]?.kind !== 'workflow' || source?.workflow == null) return null;

  const copy: TabSnapshot = {
    ...source,
    selectedNodeIds: [],
    history: undefined,
    dialogs: undefined,
  };
  const fresh = nextId();
  const tab: Tab = { id: fresh, kind: 'workflow', runSession: newSession() };
  set({
    tabs: [...tabs.slice(0, index + 1), tab, ...tabs.slice(index + 1)],
    activeId: fresh,
    snapshots: { ...snapshots, [activeId]: currentSnapshot() },
  });
  applySnapshot(copy);
  return fresh;
}

function settleClosed(
  set: StoreApi<TabsState>['setState'],
  activeId: string,
  closed: ClosedTabs,
): void {
  const { target, rest, snapshots } = closed;
  if (target === null) {
    const fresh = nextId();
    set({
      tabs: [{ id: fresh, kind: 'workflow', runSession: newSession() }],
      activeId: fresh,
      snapshots: {},
    });
    applySnapshot(EMPTY_SNAPSHOT);
    forgetClosed({});
    return;
  }

  if (target !== activeId) {
    const incoming = snapshots[target] ?? EMPTY_SNAPSHOT;
    const remaining = omitKey(snapshots, target);
    set({ tabs: rest, activeId: target, snapshots: remaining });
    applySnapshot(incoming);
    forgetClosed(remaining);
    return;
  }

  set({ tabs: rest, activeId: target, snapshots });
  forgetClosed(snapshots);
}
