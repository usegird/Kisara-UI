import { normalizeExpressionMethod } from '@/chat/expression-tool';
import { parseParams } from '@/chat/file';
import { parseUnitLink } from '@/chat/prompt-parse';
import {
  CHAT_LOG_WINDOW_DEFAULT,
  CHAT_MAX_MB_DEFAULT,
  normalizeChatLogWindow,
  normalizeChatMaxMegabytes,
} from '@/chat/size';
import {
  DEFAULT_SEARCH_ENGINE,
  normalizeContentTokens,
  normalizeSearchEngine,
  normalizeWebCalls,
  WEB_CALLS,
  WEB_CONTENT_TOKENS,
} from '@/chat/web-tools';
import {
  DEFAULT_LORA_COPY_FORMAT,
  DEFAULT_MODEL_SORT,
  normalizeModelSort,
} from '@/graph/model-files';
import {
  DEFAULT_SIDE_LIST_WIDTH,
  normalizeDialogLayouts,
  normalizePaneDocks,
  normalizePanePins,
  normalizePaneWidths,
  normalizeSideListWidth,
} from '@/lib/dialog-rect';
import { normalizeFloatingPosition } from '@/lib/floating-position';
import { isRecord, isUnknownArray, stringOr } from '@/lib/guards';
import { normalizeThemePreference, THEME_DEFAULT } from '@/lib/theme';
import { DEFAULT_TRACE_LEVELS, parseTraceLevels, storedTraceLevels } from '@/lib/trace';
import { normalizeUrlHistory } from '@/lib/url-history';
import { CARD_HEIGHT_DEFAULT, normalizeCardHeight } from '@/store/settings-fields/card-size';
import { CHAT_CARD_WIDTH, normalizeChatCardWidth } from '@/store/settings-fields/chat-card-width';
import {
  CHAT_IMAGE_FOCUS,
  CHAT_IMAGE_SIZE,
  normalizeChatImageFocus,
  normalizeChatImagePlace,
  normalizeChatImageSize,
} from '@/store/settings-fields/chat-image';
import {
  CHAT_SIDEBAR_WIDTH,
  normalizeChatSidebarWidth,
} from '@/store/settings-fields/chat-sidebar-width';
import {
  DEFAULT_COLUMN_WIDTHS,
  normalizeColumnWidths,
} from '@/store/settings-fields/column-widths';
import {
  DEFAULT_COLUMN_ZOOMS,
  normalizeColumnZooms,
  normalizeZoom,
  ZOOM_DEFAULT,
} from '@/store/settings-fields/column-zoom';
import {
  normalizePromptAdvisorWidth,
  PROMPT_ADVISOR_WIDTH,
} from '@/store/settings-fields/prompt-advisor-width';
import {
  normalizeRunHistoryLimit,
  RUN_HISTORY_LIMIT_DEFAULT,
} from '@/store/settings-fields/run-history-limit';
import {
  DEFAULT_SAFEGUARDS,
  normalizeSafeguards,
  safeguardOverrides,
} from '@/store/settings-fields/safeguards';
import {
  DEFAULT_SIDE_PANEL_HEIGHT,
  normalizeSidePanelHeight,
} from '@/store/settings-fields/side-panel-height';
import {
  normalizeSlideshowSeconds,
  SLIDESHOW_SECONDS_DEFAULT,
} from '@/store/settings-fields/slideshow';
import { DEFAULT_SPLIT_RATIO, normalizeSplitRatio } from '@/store/settings-fields/split-ratio';
import { DEFAULT_VIEWER_GRID, normalizeViewerGrid } from '@/store/settings-fields/viewer-grid';
import type { ComfyToolTarget, SettingsState } from '@/store/use-settings-store';

type PersistedSettings = Omit<
  {
    [
      K in keyof SettingsState as SettingsState[K] extends (...args: never[]) => unknown ? never : K
    ]: SettingsState[K];
  },
  'clientId'
>;
export type PersistedKey = keyof PersistedSettings;

interface SettingsField<T> {
  readonly initial: T;
  readonly read: (raw: unknown) => T;
  readonly store?: (value: T) => unknown;
}

const isTrue = (raw: unknown): boolean => raw === true;
const isNotFalse = (raw: unknown): boolean => raw !== false;
const textOf = (raw: unknown): string => stringOr(raw);

const SETTINGS_FIELDS: { readonly [K in PersistedKey]: SettingsField<PersistedSettings[K]> } = {
  baseUrl: { initial: '', read: textOf },
  baseUrlHistory: { initial: [], read: normalizeUrlHistory },
  llmUrlHistory: { initial: [], read: normalizeUrlHistory },
  showControlNodes: { initial: false, read: isTrue },
  showUnlinkedNodes: { initial: false, read: isTrue },
  showPassedLines: { initial: false, read: isTrue },
  theme: { initial: THEME_DEFAULT, read: normalizeThemePreference },
  columnWidths: { initial: DEFAULT_COLUMN_WIDTHS, read: normalizeColumnWidths },
  columnZooms: { initial: DEFAULT_COLUMN_ZOOMS, read: normalizeColumnZooms },
  narrowZoom: { initial: ZOOM_DEFAULT, read: normalizeZoom },
  modelCardHeight: { initial: CARD_HEIGHT_DEFAULT, read: normalizeCardHeight },
  modelSort: { initial: DEFAULT_MODEL_SORT, read: normalizeModelSort },
  imageSortAscending: { initial: true, read: isNotFalse },
  loraCopyFormat: {
    initial: DEFAULT_LORA_COPY_FORMAT,
    read: (raw) => stringOr(raw, DEFAULT_LORA_COPY_FORMAT),
  },
  tagSourcesOff: { initial: [], read: normalizeDictionaryIds },
  recordRunHistory: { initial: false, read: isTrue },
  runHistoryLimit: { initial: RUN_HISTORY_LIMIT_DEFAULT, read: normalizeRunHistoryLimit },
  safeguards: { initial: DEFAULT_SAFEGUARDS, read: normalizeSafeguards, store: safeguardOverrides },
  controlPosition: { initial: null, read: normalizeFloatingPosition },
  viewerGrid: { initial: DEFAULT_VIEWER_GRID, read: normalizeViewerGrid },
  slideshowSeconds: { initial: SLIDESHOW_SECONDS_DEFAULT, read: normalizeSlideshowSeconds },
  taskDetailImageRatio: { initial: DEFAULT_SPLIT_RATIO, read: normalizeSplitRatio },
  dialogLayouts: { initial: {}, read: normalizeDialogLayouts },
  nodeSearchListWidth: { initial: DEFAULT_SIDE_LIST_WIDTH, read: normalizeSideListWidth },
  dialogPaneWidths: { initial: {}, read: normalizePaneWidths },
  dialogPaneDocks: { initial: {}, read: normalizePaneDocks },
  dialogPanePins: { initial: {}, read: normalizePanePins },
  sidePanelDock: { initial: 'right', read: (raw) => (raw === 'bottom' ? 'bottom' : 'right') },
  sidePanelHeight: { initial: DEFAULT_SIDE_PANEL_HEIGHT, read: normalizeSidePanelHeight },
  sidePanelCollapsed: { initial: false, read: isTrue },
  chatSidebarWidth: { initial: CHAT_SIDEBAR_WIDTH.initial, read: normalizeChatSidebarWidth },
  chatSidebarCollapsed: { initial: false, read: isTrue },
  promptAdvisorWidth: { initial: PROMPT_ADVISOR_WIDTH.initial, read: normalizePromptAdvisorWidth },
  chatCardWidth: { initial: CHAT_CARD_WIDTH.initial, read: normalizeChatCardWidth },
  chatComfyBackup: { initial: false, read: isTrue },
  chatComfyTools: { initial: false, read: isTrue },
  chatComfyToolsSkipConfirm: { initial: false, read: isTrue },
  chatComfyToolsArgGuide: { initial: '', read: textOf },
  squashSystemMessages: { initial: false, read: isTrue },
  chatMaxMegabytes: { initial: CHAT_MAX_MB_DEFAULT, read: normalizeChatMaxMegabytes },
  chatLogWindow: { initial: CHAT_LOG_WINDOW_DEFAULT, read: normalizeChatLogWindow },
  loreDictionariesOn: { initial: true, read: isNotFalse },
  playbooksOn: { initial: true, read: isNotFalse },
  playbookCardFolded: { initial: false, read: isTrue },
  playbooksHidden: { initial: [], read: normalizeDictionaryIds },
  webSearchEngine: { initial: DEFAULT_SEARCH_ENGINE, read: normalizeSearchEngine },
  webSearchMaxCalls: { initial: WEB_CALLS.initial, read: normalizeWebCalls },
  webFetchMaxTokens: { initial: WEB_CONTENT_TOKENS.initial, read: normalizeContentTokens },
  loreSemantic: { initial: false, read: isTrue },
  traceLevels: { initial: DEFAULT_TRACE_LEVELS, read: parseTraceLevels, store: storedTraceLevels },
  embeddingModel: { initial: '', read: textOf },
  chatComfyToolTargets: { initial: [], read: normalizeToolTargets },
  loreDictionaryIds: { initial: [], read: normalizeDictionaryIds },
  llmProfileId: { initial: null, read: (raw) => stringOr(raw, null) },
  llmModel: { initial: '', read: textOf },
  llmParams: { initial: {}, read: parseParams },
  llmSystemPrompt: { initial: '', read: textOf },
  llmSystemTemplate: { initial: null, read: parseUnitLink },
  chatShowAvatar: { initial: true, read: isNotFalse },
  chatExpression: { initial: false, read: isTrue },
  chatExpressionMethod: { initial: 'tool', read: normalizeExpressionMethod },
  chatTabsFirst: { initial: true, read: isNotFalse },
  chatImagePlace: { initial: 'right', read: normalizeChatImagePlace },
  chatImageWidth: {
    initial: CHAT_IMAGE_SIZE.width,
    read: (raw) => normalizeChatImageSize(raw, CHAT_IMAGE_SIZE.width),
  },
  chatImageHeight: {
    initial: CHAT_IMAGE_SIZE.height,
    read: (raw) => normalizeChatImageSize(raw, CHAT_IMAGE_SIZE.height),
  },
  chatImageFocusX: { initial: CHAT_IMAGE_FOCUS, read: normalizeChatImageFocus },
  chatImageFocusY: { initial: CHAT_IMAGE_FOCUS, read: normalizeChatImageFocus },
};

const SETTINGS_KEYS = Object.keys(SETTINGS_FIELDS) as PersistedKey[];

export type SettingsSet = (patch: Partial<SettingsState>) => void;

function buildSettings(
  valueOf: <K extends PersistedKey>(key: K) => PersistedSettings[K],
): PersistedSettings {
  const values: Partial<PersistedSettings> = {};
  for (const key of SETTINGS_KEYS) setField(values, key, valueOf(key));
  return values as PersistedSettings;
}

function setField<K extends PersistedKey>(
  values: Partial<PersistedSettings>,
  key: K,
  value: PersistedSettings[K],
): void {
  values[key] = value;
}

export function initialSettings(): PersistedSettings {
  return buildSettings((key) => SETTINGS_FIELDS[key].initial);
}

export function readSettings(saved: Readonly<Record<string, unknown>>): PersistedSettings {
  return buildSettings((key) => SETTINGS_FIELDS[key].read(saved[key]));
}

export function storedSettings(state: SettingsState): Record<string, unknown> {
  const stored: Record<string, unknown> = {};
  for (const key of SETTINGS_KEYS) stored[key] = storedValueOf(state, key);
  return stored;
}

function storedValueOf<K extends PersistedKey>(state: SettingsState, key: K): unknown {
  const field: SettingsField<PersistedSettings[K]> = SETTINGS_FIELDS[key];
  return field.store === undefined ? state[key] : field.store(state[key]);
}

export function setterOf<K extends PersistedKey>(
  set: SettingsSet,
  key: K,
): (value: PersistedSettings[K]) => void {
  return (value) => {
    const patch: Partial<PersistedSettings> = {};
    setField(patch, key, value);
    set(patch);
  };
}

export function normalizingSetterOf<K extends PersistedKey>(
  set: SettingsSet,
  key: K,
): (value: unknown) => void {
  const field: SettingsField<PersistedSettings[K]> = SETTINGS_FIELDS[key];
  const assign = setterOf(set, key);
  return (value) => assign(field.read(value));
}

function normalizeDictionaryIds(raw: unknown): string[] {
  if (!isUnknownArray(raw)) return [];
  return [...new Set(raw.filter((item): item is string => typeof item === 'string'))];
}

function normalizeToolTargets(raw: unknown): ComfyToolTarget[] {
  if (!isUnknownArray(raw)) return [];
  const targets: ComfyToolTarget[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const { id, tabId, path, name } = item;
    if (typeof id !== 'string' || typeof tabId !== 'string') continue;
    if (targets.some((target) => target.tabId === tabId)) continue;
    targets.push({
      id,
      tabId,
      path: typeof path === 'string' && path.length > 0 ? path : null,
      name: typeof name === 'string' ? name : '',
    });
  }
  return targets;
}
