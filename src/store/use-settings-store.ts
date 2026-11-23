import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ExpressionMethod } from '@/chat/expression-tool';
import type { UnitLink } from '@/chat/types';
import type { SearchEngine } from '@/chat/web-tools';
import type { ModelSort } from '@/graph/model-files';
import type {
  DialogLayouts,
  DialogMode,
  DialogRect,
  PaneDock,
  PaneDocks,
  PanePins,
  PaneWidths,
} from '@/lib/dialog-rect';
import type { FloatingPosition } from '@/lib/floating-position';
import { isRecord } from '@/lib/guards';
import { newShortId } from '@/lib/id';
import { claimTabId, readTabId } from '@/lib/tab-id';
import type { ThemePreference } from '@/lib/theme';
import type { TraceArea, TraceLevel, TraceLevels } from '@/lib/trace';
import type { GenerationParams } from '@/port/llm-port';
import { settingsStorage } from '@/store/persist/settings-storage';
import type { ChatImagePlace } from '@/store/settings-fields/chat-image';
import type { ColumnKey, ColumnWidths } from '@/store/settings-fields/column-widths';
import type { ColumnZooms, ZoomColumn } from '@/store/settings-fields/column-zoom';
import type { Safeguards } from '@/store/settings-fields/safeguards';
import {
  initialSettings,
  readSettings,
  storedSettings,
} from '@/store/settings-fields/settings-table';
import type { ViewerGrid } from '@/store/settings-fields/viewer-grid';
import { createSettingsChatSlice } from '@/store/slices/settings-chat';
import { createSettingsConnectionSlice } from '@/store/slices/settings-connection';
import { createSettingsLoreSlice } from '@/store/slices/settings-lore';
import { createSettingsPanelsSlice } from '@/store/slices/settings-panels';
import { createSettingsViewSlice } from '@/store/slices/settings-view';

export { holdSettingsWrites } from '@/store/persist/settings-storage';

export interface ComfyToolTarget {
  readonly id: string;
  readonly tabId: string;
  readonly path: string | null;
  readonly name: string;
}

export type SidePanelDock = 'right' | 'bottom';

export interface SettingsState {
  readonly baseUrl: string;
  readonly baseUrlHistory: readonly string[];
  readonly llmUrlHistory: readonly string[];
  readonly clientId: string;
  readonly showControlNodes: boolean;
  readonly showUnlinkedNodes: boolean;
  readonly showPassedLines: boolean;
  readonly theme: ThemePreference;
  readonly columnWidths: ColumnWidths;
  readonly columnZooms: ColumnZooms;
  readonly narrowZoom: number;
  readonly modelCardHeight: number;
  readonly modelSort: ModelSort;
  readonly imageSortAscending: boolean;
  readonly loraCopyFormat: string;
  readonly tagSourcesOff: readonly string[];
  readonly recordRunHistory: boolean;
  readonly runHistoryLimit: number;
  readonly safeguards: Safeguards;
  readonly controlPosition: FloatingPosition | null;
  readonly taskDetailImageRatio: number;
  readonly viewerGrid: ViewerGrid;
  readonly slideshowSeconds: number;
  readonly dialogLayouts: DialogLayouts;
  readonly nodeSearchListWidth: number;
  readonly dialogPaneWidths: PaneWidths;
  readonly dialogPaneDocks: PaneDocks;
  readonly dialogPanePins: PanePins;
  readonly sidePanelDock: SidePanelDock;
  readonly sidePanelHeight: number;
  readonly sidePanelCollapsed: boolean;
  readonly chatSidebarWidth: number;
  readonly chatSidebarCollapsed: boolean;
  readonly promptAdvisorWidth: number;
  readonly chatCardWidth: number;
  readonly chatComfyBackup: boolean;
  readonly chatComfyTools: boolean;
  readonly chatComfyToolsSkipConfirm: boolean;
  readonly chatComfyToolsArgGuide: string;
  readonly chatComfyToolTargets: readonly ComfyToolTarget[];
  readonly squashSystemMessages: boolean;
  readonly chatMaxMegabytes: number;
  readonly chatLogWindow: number;
  readonly loreDictionariesOn: boolean;
  readonly playbooksOn: boolean;
  readonly playbookCardFolded: boolean;
  readonly playbooksHidden: readonly string[];
  readonly webSearchEngine: SearchEngine;
  readonly webSearchMaxCalls: number;
  readonly webFetchMaxTokens: number;
  readonly loreSemantic: boolean;
  readonly traceLevels: TraceLevels;
  readonly embeddingModel: string;
  readonly loreDictionaryIds: readonly string[];
  readonly llmProfileId: string | null;
  readonly llmModel: string;
  readonly llmParams: GenerationParams;
  readonly llmSystemPrompt: string;
  readonly llmSystemTemplate: UnitLink | null;
  readonly chatShowAvatar: boolean;
  readonly chatExpression: boolean;
  readonly chatExpressionMethod: ExpressionMethod;
  readonly chatTabsFirst: boolean;
  readonly chatImagePlace: ChatImagePlace;
  readonly chatImageWidth: number;
  readonly chatImageHeight: number;
  readonly chatImageFocusX: number;
  readonly chatImageFocusY: number;
  readonly setBaseUrl: (baseUrl: string) => void;
  readonly rememberBaseUrl: (baseUrl: string) => void;
  readonly forgetBaseUrl: (baseUrl: string) => void;
  readonly rememberLlmUrl: (url: string) => void;
  readonly forgetLlmUrl: (url: string) => void;
  readonly setShowControlNodes: (show: boolean) => void;
  readonly setShowUnlinkedNodes: (show: boolean) => void;
  readonly setShowPassedLines: (show: boolean) => void;
  readonly setTheme: (theme: ThemePreference) => void;
  readonly resizeColumn: (column: ColumnKey, delta: number) => void;
  readonly stepColumnZoom: (column: ZoomColumn, direction: number) => void;
  readonly resetColumnZoom: (column: ZoomColumn) => void;
  readonly stepNarrowZoom: (direction: number) => void;
  readonly resetNarrowZoom: () => void;
  readonly setModelCardHeight: (height: number) => void;
  readonly setModelSort: (patch: Partial<ModelSort>) => void;
  readonly setImageSortAscending: (ascending: boolean) => void;
  readonly setLoraCopyFormat: (format: string) => void;
  readonly setTagSourceOn: (key: string, on: boolean) => void;
  readonly setRecordRunHistory: (record: boolean) => void;
  readonly setRunHistoryLimit: (limit: number) => void;
  readonly moveControl: (from: FloatingPosition, dx: number, dy: number) => void;
  readonly setViewerGrid: (patch: Partial<ViewerGrid>) => void;
  readonly setSlideshowSeconds: (seconds: number) => void;
  readonly setDialogMode: (id: string, mode: DialogMode) => void;
  readonly setDialogRect: (id: string, rect: DialogRect) => void;
  readonly setNodeSearchListWidth: (width: number) => void;
  readonly setDialogPaneWidth: (key: string, width: number) => void;
  readonly setDialogPaneDock: (key: string, dock: PaneDock) => void;
  readonly setDialogPanePin: (key: string, pinned: boolean) => void;
  readonly setSidePanelDock: (dock: SidePanelDock) => void;
  readonly setTaskDetailImageRatio: (ratio: number) => void;
  readonly setSidePanelHeight: (height: number) => void;
  readonly setSidePanelCollapsed: (collapsed: boolean) => void;
  readonly resizeChatSidebar: (delta: number) => void;
  readonly resizePromptAdvisor: (delta: number) => void;
  readonly resizeChatCard: (delta: number) => void;
  readonly setChatSidebarCollapsed: (collapsed: boolean) => void;
  readonly setChatComfyBackup: (on: boolean) => void;
  readonly setChatComfyTools: (on: boolean) => void;
  readonly setChatComfyToolsSkipConfirm: (on: boolean) => void;
  readonly setChatComfyToolsArgGuide: (text: string) => void;
  readonly setLoreDictionariesOn: (on: boolean) => void;
  readonly setPlaybooksOn: (on: boolean) => void;
  readonly setPlaybookCardFolded: (folded: boolean) => void;
  readonly setPlaybookShown: (key: string, shown: boolean) => void;
  readonly setSquashSystemMessages: (on: boolean) => void;
  readonly setChatMaxMegabytes: (megabytes: number) => void;
  readonly setChatLogWindow: (count: number) => void;
  readonly setWebSearchEngine: (engine: SearchEngine) => void;
  readonly setWebSearchMaxCalls: (calls: number) => void;
  readonly setWebFetchMaxTokens: (tokens: number) => void;
  readonly setLoreSemantic: (on: boolean) => void;
  readonly setTraceLevel: (area: TraceArea, level: TraceLevel) => void;
  readonly setEmbeddingModel: (value: string) => void;
  readonly setLoreDictionaryEnabled: (id: string, on: boolean) => void;
  readonly keepLoreDictionaryIds: (ids: ReadonlySet<string>) => void;
  readonly keepOwnPlaybookIds: (ids: ReadonlySet<string>) => void;
  readonly addChatComfyToolTarget: (target: ComfyToolTarget) => void;
  readonly removeChatComfyToolTarget: (id: string) => void;
  readonly updateChatComfyToolTarget: (
    id: string,
    patch: Partial<Pick<ComfyToolTarget, 'tabId' | 'path'>>,
  ) => void;
  readonly setLlmTarget: (patch: {
    readonly profileId?: string | null;
    readonly model?: string;
  }) => void;
  readonly setLlmParam: <K extends keyof GenerationParams>(
    key: K,
    value: GenerationParams[K] | undefined,
  ) => void;
  readonly setLlmParams: (params: GenerationParams) => void;
  readonly setLlmSystemPrompt: (text: string) => void;
  readonly setLlmSystemTemplate: (template: UnitLink | null) => void;
  readonly setChatShowAvatar: (on: boolean) => void;
  readonly setChatExpression: (on: boolean) => void;
  readonly setChatExpressionMethod: (method: ExpressionMethod) => void;
  readonly setChatTabsFirst: (on: boolean) => void;
  readonly setChatImagePlace: (place: ChatImagePlace) => void;
  readonly setChatImageSize: (width: number, height: number) => void;
  readonly setChatImageFocus: (x: number, y: number) => void;
}

export const SETTINGS_KEY = 'kisaraui.settings';

export const useSettingsStore = create<SettingsState>()(
  persist(
    (...store) => ({
      clientId: '',
      ...initialSettings(),
      ...createSettingsConnectionSlice(...store),
      ...createSettingsViewSlice(...store),
      ...createSettingsPanelsSlice(...store),
      ...createSettingsChatSlice(...store),
      ...createSettingsLoreSlice(...store),
    }),
    {
      name: SETTINGS_KEY,
      storage: createJSONStorage(() => settingsStorage),
      partialize: storedSettings,
      merge: (persisted, current) => {
        const saved = isRecord(persisted) ? persisted : {};
        return { ...current, ...saved, ...readSettings(saved) };
      },
    },
  ),
);

export const CLIENT_ID_KEY = 'kisaraui.clientId';

const NO_DICTIONARY_IDS: readonly string[] = [];

export function enabledDictionaryIds(
  state: Pick<SettingsState, 'loreDictionariesOn' | 'loreDictionaryIds'>,
): readonly string[] {
  return state.loreDictionariesOn ? state.loreDictionaryIds : NO_DICTIONARY_IDS;
}

const storedClientId = readTabId(CLIENT_ID_KEY);

export const clientIdReady: Promise<string> = claimTabId(CLIENT_ID_KEY, newShortId).then(
  (clientId) => {
    useSettingsStore.setState({ clientId });
    return clientId;
  },
);

export const clientIdRenewed: Promise<boolean> = clientIdReady.then(
  (clientId) => storedClientId !== null && storedClientId !== clientId,
);
