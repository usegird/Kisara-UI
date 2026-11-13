import type { StateCreator } from 'zustand';

import { pushUrlHistory, trimBaseUrl } from '@/lib/url-history';
import type { GenerationParams } from '@/port/llm-port';
import { forgetDefinitionsOf } from '@/store/persist/object-info-cache';
import { setterOf } from '@/store/settings-fields/settings-table';
import type { SettingsState } from '@/store/use-settings-store';

// ─────────────────────────────
// 設定のストアの、接続先の URL と履歴・LLM の接続の設定とモデル・生成の設定・近似判定のモデル・追跡の段の操作。
// ─────────────────────────────

/** この slice が持つ操作 */
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

/** 接続先の URL と履歴・LLM の接続の設定とモデル・生成の設定・近似判定のモデル・追跡の段の操作を作る */
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
    // その接続先のノード定義の控えも消す（今の接続先・残る履歴と同じ相手なら残す）
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
