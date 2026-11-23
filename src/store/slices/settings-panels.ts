import type { StateCreator } from 'zustand';

import { normalizePaneSize } from '@/lib/dialog-rect';
import { normalizeChatCardWidth } from '@/store/settings-fields/chat-card-width';
import { normalizeChatSidebarWidth } from '@/store/settings-fields/chat-sidebar-width';
import { normalizePromptAdvisorWidth } from '@/store/settings-fields/prompt-advisor-width';
import { normalizingSetterOf, setterOf } from '@/store/settings-fields/settings-table';
import type { SettingsState } from '@/store/use-settings-store';

type SettingsPanelsActions = Pick<
  SettingsState,
  | 'setDialogMode'
  | 'setDialogRect'
  | 'setNodeSearchListWidth'
  | 'setDialogPaneWidth'
  | 'setDialogPaneDock'
  | 'setDialogPanePin'
  | 'setSidePanelDock'
  | 'setTaskDetailImageRatio'
  | 'setSidePanelHeight'
  | 'setSidePanelCollapsed'
  | 'resizeChatSidebar'
  | 'setChatSidebarCollapsed'
  | 'resizePromptAdvisor'
  | 'resizeChatCard'
>;

export const createSettingsPanelsSlice: StateCreator<
  SettingsState,
  [['zustand/persist', unknown]],
  [],
  SettingsPanelsActions
> = (set) => ({
  setDialogMode: (id, mode) =>
    set((state) => ({
      dialogLayouts: { ...state.dialogLayouts, [id]: { ...state.dialogLayouts[id], mode } },
    })),
  setDialogRect: (id, rect) =>
    set((state) => ({
      dialogLayouts: { ...state.dialogLayouts, [id]: { ...state.dialogLayouts[id], rect } },
    })),
  setNodeSearchListWidth: normalizingSetterOf(set, 'nodeSearchListWidth'),
  setDialogPaneWidth: (key, width) =>
    set((state) => ({
      dialogPaneWidths: { ...state.dialogPaneWidths, [key]: normalizePaneSize(width) },
    })),
  setDialogPaneDock: (key, dock) =>
    set((state) => ({ dialogPaneDocks: { ...state.dialogPaneDocks, [key]: dock } })),
  setDialogPanePin: (key, pinned) =>
    set((state) => ({ dialogPanePins: { ...state.dialogPanePins, [key]: pinned } })),
  setSidePanelDock: setterOf(set, 'sidePanelDock'),
  setTaskDetailImageRatio: normalizingSetterOf(set, 'taskDetailImageRatio'),
  setSidePanelHeight: normalizingSetterOf(set, 'sidePanelHeight'),
  setSidePanelCollapsed: setterOf(set, 'sidePanelCollapsed'),
  resizeChatSidebar: (delta) =>
    set((state) => ({
      chatSidebarWidth: normalizeChatSidebarWidth(state.chatSidebarWidth + delta),
    })),
  setChatSidebarCollapsed: setterOf(set, 'chatSidebarCollapsed'),
  resizePromptAdvisor: (delta) =>
    set((state) => ({
      promptAdvisorWidth: normalizePromptAdvisorWidth(state.promptAdvisorWidth + delta),
    })),
  resizeChatCard: (delta) =>
    set((state) => ({
      chatCardWidth: normalizeChatCardWidth(state.chatCardWidth + delta),
    })),
});
