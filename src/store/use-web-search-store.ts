import { create } from 'zustand';

import { isCloudService } from '@/chat/cloud-service';
import {
  availableWebModes,
  webToolsOf,
  type WebMode,
  type WebSettings,
  type WebTools,
} from '@/chat/web-tools';
import { useSettingsStore } from '@/store/use-settings-store';

export type WebState = 'off' | WebMode;

export type WebScope = 'chat' | 'advisor';

const ORDER: readonly WebState[] = ['off', 'search'];

interface WebSearchState {
  readonly modes: Readonly<Record<WebScope, WebState>>;
  readonly agreed: boolean;
  readonly setMode: (scope: WebScope, mode: WebState) => void;
  readonly cycle: (scope: WebScope) => void;
  readonly agree: () => void;
}

function currentWebSettings(): WebSettings {
  const settings = useSettingsStore.getState();
  return {
    search: settings.webSearchEngine,
    calls: settings.webSearchMaxCalls,
    contentTokens: settings.webFetchMaxTokens,
  };
}

export function webModesFor(baseUrl: string, settings: WebSettings): WebMode[] {
  return isCloudService(baseUrl) ? availableWebModes(settings) : [];
}

export function effectiveWebState(mode: WebState, modes: readonly WebMode[]): WebState {
  return mode !== 'off' && modes.includes(mode) ? mode : 'off';
}

export function webToolsFor(baseUrl: string, scope: WebScope): WebTools | null {
  const settings = currentWebSettings();
  const chosen = useWebSearchStore.getState().modes[scope];
  const mode = effectiveWebState(chosen, webModesFor(baseUrl, settings));
  return mode === 'off' ? null : webToolsOf(mode, settings);
}

export const useWebSearchStore = create<WebSearchState>()((set, get) => ({
  modes: { chat: 'off', advisor: 'off' },
  agreed: false,
  setMode: (scope, mode) => set({ modes: { ...get().modes, [scope]: mode } }),
  cycle: (scope) => {
    const modes = availableWebModes(currentWebSettings());
    const states = ORDER.filter((state) => state === 'off' || modes.includes(state));
    const at = states.indexOf(get().modes[scope]);
    get().setMode(scope, states[(at + 1) % states.length] ?? 'off');
  },
  agree: () => set({ agreed: true }),
}));
