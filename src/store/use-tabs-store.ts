import { create } from 'zustand';

import type { ChatPlace } from '@/chat/types';
import type { NodeDefinitionMap, NodeId, Workflow } from '@/graph/types';
import { stablePartition } from '@/lib/stable-partition';
import { readTabList } from '@/lib/tab-id';
import { createTabsChatSlice } from '@/store/slices/tabs-chat';
import { newSession, nextId, PAST_SESSIONS_KEY } from '@/store/slices/tabs-kit';
import { createTabsSessionSlice } from '@/store/slices/tabs-sessions';
import { createTabsSwitchSlice } from '@/store/slices/tabs-switch';
import type { AppValues } from '@/store/use-app-values-store';
import type { GraphHistory } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';

export {
  EMPTY_SNAPSHOT,
  holdsSession,
  lineageOf,
  nextActiveId,
  PAST_SESSIONS_KEY,
  SESSION_LOCK_PREFIX,
  whenSessionsClaimed,
} from '@/store/slices/tabs-kit';

export type TabKind = 'workflow' | 'image' | 'chat';

export interface TabSnapshot {
  readonly workflow: Workflow | null;
  readonly name: string;
  readonly savedPath: string | null;
  readonly savedOn?: string | null | undefined;
  readonly savedOwn?: boolean | undefined;
  readonly dirty: boolean;
  readonly selectedNodeIds: readonly NodeId[];
  readonly hiddenCandidates: ReadonlySet<NodeId>;
  readonly appValues: AppValues;
  readonly history?: GraphHistory | undefined;
  readonly dialogs?: Readonly<Record<string, unknown>> | undefined;
}

export interface Tab {
  readonly id: string;
  readonly kind: TabKind;
  readonly runSession?: string | undefined;
  readonly origin?: string | undefined;
  readonly chatId?: string | undefined;
  readonly chatComfyUrl?: string | undefined;
  readonly chatBoth?: boolean | undefined;
}

export interface TabsState {
  readonly tabs: readonly Tab[];
  readonly activeId: string;
  readonly snapshots: Readonly<Record<string, TabSnapshot>>;

  readonly addTab: () => string;
  readonly addChatTab: (chatId?: string) => string;
  readonly openChatTab: (init?: {
    readonly profileId: string | null;
    readonly model: string;
  }) => string;
  readonly openExistingChat: (chatId: string, place?: ChatPlace) => string;
  readonly replaceChat: (tabId: string, chatId: string, place?: ChatPlace) => void;
  readonly setTabChat: (tabId: string, chatId: string) => void;
  readonly setChatPlace: (chatId: string, place: ChatPlace) => void;
  readonly openImageTab: (name: string) => string;
  readonly selectTab: (id: string) => void;
  readonly closeTab: (id: string) => void;
  readonly duplicateTab: (id: string) => string | null;
  readonly moveTab: (id: string, index: number) => void;
  readonly prepareOpen: () => void;
  readonly readTab: (id: string) => TabSnapshot | null;
  readonly advanceTabSeeds: (id: string, definitions: NodeDefinitionMap) => void;
  readonly refreshHiddenCandidates: () => void;
  readonly restore: (
    tabs: readonly Tab[],
    activeId: string,
    snapshots: Readonly<Record<string, TabSnapshot>>,
  ) => void;
  readonly adopt: (
    entries: readonly { readonly session: string; readonly snapshot: TabSnapshot }[],
  ) => Promise<string[]>;
  readonly pastSessions: readonly string[];
  readonly renewSession: (id: string) => void;
}

export interface TabLabel {
  readonly name: string;
  readonly dirty: boolean;
  readonly fallbackName?: string | undefined;
  readonly busy?: boolean | undefined;
  readonly busyLabel?: string | undefined;
  readonly closeMessage?: string | undefined;
}

const firstId = nextId();

export const useTabsStore = create<TabsState>()((...store) => ({
  tabs: [{ id: firstId, kind: 'workflow', runSession: newSession() }],
  activeId: firstId,
  snapshots: {},
  pastSessions: readTabList(PAST_SESSIONS_KEY),
  ...createTabsSessionSlice(...store),
  ...createTabsChatSlice(...store),
  ...createTabsSwitchSlice(...store),
}));

export function ownSessions(state: TabsState): readonly string[] {
  const current = state.tabs.flatMap((tab) =>
    tab.runSession === undefined ? [] : [tab.runSession],
  );
  return [...current, ...state.pastSessions.filter((id) => !current.includes(id))];
}

export function activeSession(state: TabsState): string | null {
  const tab = state.tabs.find((item) => item.id === state.activeId);
  return tab?.kind === 'workflow' ? (tab.runSession ?? null) : null;
}

function arrangeChatTabsFirst(): void {
  if (!useSettingsStore.getState().chatTabsFirst) return;
  const { tabs } = useTabsStore.getState();
  const arranged = stablePartition(tabs, (tab) => tab.kind === 'chat');
  if (arranged !== tabs) useTabsStore.setState({ tabs: arranged });
}

useTabsStore.subscribe((state, previous) => {
  if (state.tabs !== previous.tabs) arrangeChatTabsFirst();
});
useSettingsStore.subscribe((state, previous) => {
  if (state.chatTabsFirst && !previous.chatTabsFirst) arrangeChatTabsFirst();
});
