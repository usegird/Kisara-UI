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

// ─────────────────────────────
// タブのストアの、タブを足す・画像のタブを開く・動かす・切り替える・閉じる操作。
// 切り替えるときに今の内容を控えへ移し、行き先の控えを載せ直す。
// ─────────────────────────────

/** この slice が持つ操作 */
type TabsSwitchActions = Pick<
  TabsState,
  'addTab' | 'openImageTab' | 'moveTab' | 'selectTab' | 'closeTab' | 'prepareOpen'
>;

/** 閉じたあとの並びと控え */
interface ClosedTabs {
  /** 閉じたあとに選ぶタブ。残らなければ null */
  readonly target: string | null;
  readonly rest: readonly Tab[];
  readonly snapshots: Readonly<Record<string, TabSnapshot>>;
}

/** タブを足す・動かす・切り替える・閉じる操作を作る */
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
      // 会話は置き場に残る。手元の中身だけを手放す
      if (chatId !== undefined) useChatStore.getState().unload(chatId);
      const target = nextActiveId(tabs, id, activeId);
      const rest = tabs.filter((tab) => tab.id !== id);
      // 閉じたタブのセッションも、タスクの列に出し記録を書き続ける
      const closing = tabs.find((tab) => tab.id === id)?.runSession;
      set({ pastSessions: withPast(get().pastSessions, closing) });
      settleClosed(set, activeId, { target, rest, snapshots: omitKey(snapshots, id) });
    },

    prepareOpen: () => {
      const { tabs, activeId } = get();
      // 画像と会話のタブにはワークフローを開かない
      const other = tabs.some((tab) => tab.id === activeId && tab.kind !== 'workflow');
      if (!other && useGraphStore.getState().workflow === null) return;
      get().addTab();
    },
  };
};

/** 閉じたあとの並びを載せ、選ぶタブが替われば控えを載せ直す */
function settleClosed(
  set: StoreApi<TabsState>['setState'],
  activeId: string,
  closed: ClosedTabs,
): void {
  const { target, rest, snapshots } = closed;
  // 最後の 1 枚を閉じたら、空のタブを 1 枚残す（タブが 0 枚の状態を作らない）
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
