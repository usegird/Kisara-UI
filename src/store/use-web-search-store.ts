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

// ─────────────────────────────
// 会話の Web 検索・取得の状態（会話と構成の相談で別々に持ち、**残さない**）と、費用の注意の承諾。
// OpenRouter につないでいて、検索のエンジンが無効でないときだけ使える。
// ─────────────────────────────

/** Web 検索の状態（切る・検索） */
export type WebState = 'off' | WebMode;

/** 状態を分ける所。会話の本体と構成の相談 */
export type WebScope = 'chat' | 'advisor';

/** 押したときに替わる順（選べない状態は飛ばす） */
const ORDER: readonly WebState[] = ['off', 'search'];

interface WebSearchState {
  readonly modes: Readonly<Record<WebScope, WebState>>;
  /** このページで一度承諾したか。承諾した後は有効にするときも確かめない */
  readonly agreed: boolean;
  readonly setMode: (scope: WebScope, mode: WebState) => void;
  /** 切る ↔ 検索（選べない状態は飛ばす） */
  readonly cycle: (scope: WebScope) => void;
  /** 費用の注意を承諾した */
  readonly agree: () => void;
}

/** 設定の Web 検索・取得の項目 */
function currentWebSettings(): WebSettings {
  const settings = useSettingsStore.getState();
  return {
    search: settings.webSearchEngine,
    calls: settings.webSearchMaxCalls,
    contentTokens: settings.webFetchMaxTokens,
  };
}

/** その接続先で選べる状態（OpenRouter でなければ無い） */
export function webModesFor(baseUrl: string, settings: WebSettings): WebMode[] {
  return isCloudService(baseUrl) ? availableWebModes(settings) : [];
}

/** 今の状態のうち、選べるもの。選べなくなった状態は切ったとみなす */
export function effectiveWebState(mode: WebState, modes: readonly WebMode[]): WebState {
  return mode !== 'off' && modes.includes(mode) ? mode : 'off';
}

/** 送る Web のツール。送らないなら null */
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
