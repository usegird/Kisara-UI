import { create } from 'zustand';

import { createBaseUrlActions } from '@/store/kit/base-url-resource';
import { registerTabScopedValue } from '@/store/kit/tab-scoped';
import { comfyPort } from '@/store/ports/comfy-port';

// ─────────────────────────────
// ワイルドカードの名前の一覧（接続先の Impact Pack から、接続したときに 1 回だけ取る）と、
// 一覧の画面（ノードの上に重ねる）を開いているか。
// ─────────────────────────────

/** 一覧の取得の段階。`unavailable` は接続先に経路が無い */
type WildcardsStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

/** ワイルドカードの名前の一覧と、取る操作・画面の開閉 */
interface WildcardsState {
  readonly status: WildcardsStatus;
  readonly names: readonly string[];
  /** どの接続先の一覧か。変わったら取り直す */
  readonly baseUrl: string;
  readonly error: string | null;
  /** その接続先の分が未取得のときだけ取る */
  readonly ensure: (baseUrl: string) => Promise<void>;
  /** 手動の取り直し */
  readonly refresh: (baseUrl: string) => Promise<void>;
  /** 未取得に戻す（接続し直すとき）。一覧は残し、次の `ensure` で取り直す */
  readonly invalidate: () => void;
  /** ワイルドカードの画面を重ねているか（重ねる先は別の部品なので、状態で受け渡す） */
  readonly panelOpen: boolean;
  readonly openPanel: () => void;
  readonly closePanel: () => void;
}

export const useWildcardsStore = create<WildcardsState>()((set, get) => ({
  status: 'idle',
  names: [],
  baseUrl: '',
  error: null,
  ...createBaseUrlActions(set, get, async (baseUrl): Promise<Partial<WildcardsState>> => {
    const names = await comfyPort().assets.fetchWildcards(baseUrl, {});
    return names === null
      ? { status: 'unavailable', names: [] }
      : { status: 'ready', names, error: null };
  }),
  panelOpen: false,
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
}));

// ワイルドカードの画面はタブのもの
registerTabScopedValue('wildcards', {
  current: () => (useWildcardsStore.getState().panelOpen ? true : null),
  isValue: (saved): saved is true => saved === true,
  open: () => useWildcardsStore.getState().openPanel(),
  close: () => useWildcardsStore.getState().closePanel(),
});
