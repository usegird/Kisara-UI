import type { StateCreator } from 'zustand';

import { pushUrlHistory, trimBaseUrl } from '@/lib/url-history';
import type { GenerationParams } from '@/port/llm-port';
import { forgetDefinitionsOf } from '@/store/persist/object-info-cache';
import { setterOf } from '@/store/settings-fields/settings-table';
import type { SettingsState } from '@/store/use-settings-store';

type SettingsConnectionActions = Pick<
  SettingsState,
  | 'setBaseUrl'
  | 'rememberBaseUrl'
  | 'rememberLlmUrl'
  | 'forgetLlmUrl'
  | 'forgetBaseUrl'
  | 'setLlmTarget'
  | 'setLlmParam'
  | 'setLlmParams'
  | 'setLlmSystemPrompt'
  | 'setLlmSystemTemplate'
  | 'setEmbeddingModel'
  | 'setTraceLevel'
>;

export const createSettingsConnectionSlice: StateCreator<
  SettingsState,
  [['zustand/persist', unknown]],
  [],
  SettingsConnectionActions
> = (set, get) => ({
  setBaseUrl: (baseUrl) => set({ baseUrl: trimBaseUrl(baseUrl) }),
  rememberBaseUrl: (baseUrl) =>
    set((state) => ({
      baseUrlHistory: pushUrlHistory(state.baseUrlHistory, trimBaseUrl(baseUrl)),
    })),
  rememberLlmUrl: (url) =>
    set((state) => ({ llmUrlHistory: pushUrlHistory(state.llmUrlHistory, url) })),
  forgetLlmUrl: (url) =>
    set((state) => ({ llmUrlHistory: state.llmUrlHistory.filter((item) => item !== url) })),
  forgetBaseUrl: (baseUrl) => {
    set((state) => ({
      baseUrlHistory: state.baseUrlHistory.filter((item) => item !== baseUrl),
    }));
    const { baseUrl: current, baseUrlHistory } = get();
    void forgetDefinitionsOf(baseUrl, [current, ...baseUrlHistory]);
  },
  setLlmTarget: (patch) =>
    set((state) => ({
      llmProfileId: patch.profileId === undefined ? state.llmProfileId : patch.profileId,
      llmModel: patch.model ?? state.llmModel,
    })),
  setLlmParam: (key, value) =>
    set((state) => {
      const llmParams: GenerationParams = { ...state.llmParams };
      if (value === undefined) delete llmParams[key];
      else llmParams[key] = value;
      return { llmParams };
    }),
  setLlmParams: setterOf(set, 'llmParams'),
  setLlmSystemPrompt: setterOf(set, 'llmSystemPrompt'),
  setLlmSystemTemplate: setterOf(set, 'llmSystemTemplate'),
  setEmbeddingModel: setterOf(set, 'embeddingModel'),
  setTraceLevel: (area, level) =>
    set((state) => ({ traceLevels: { ...state.traceLevels, [area]: level } })),
});
