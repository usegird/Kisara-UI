import { create } from 'zustand';

import { createConnectDialogFlags, type ConnectDialogFlags } from '@/store/kit/connect-dialog';

// ─────────────────────────────
// 「ComfyUI に接続する」のポップアップを出すか。タブを替えても同じものを見る。
// 出す・閉じるは会話の「LLM に接続する」と同じ（store/kit/connect-dialog）。
// ─────────────────────────────

interface ComfyConnectDialogState extends ConnectDialogFlags {
  /** 起動時の自動接続を試した（試す前に出してすぐ閉じない） */
  readonly autoTried: boolean;
  /**
   * 外部の ComfyUI の注意への合意を待っている接続先。無ければ null
   */
  readonly remotePending: string | null;
  /** つながった。頼まれて出していたら下ろす */
  readonly connected: () => void;
  readonly markAutoTried: () => void;
  /** 外部の接続先の注意を出す（ポップアップも出す） */
  readonly askRemote: (url: string) => void;
  /** 注意を下ろす（合意した・やめた） */
  readonly clearRemote: () => void;
}

export const useComfyConnectDialogStore = create<ComfyConnectDialogState>()((set) => ({
  ...createConnectDialogFlags(set),
  autoTried: false,
  remotePending: null,
  connected: () => set({ requested: false }),
  markAutoTried: () => set({ autoTried: true }),
  askRemote: (url) => set({ requested: true, remotePending: url }),
  clearRemote: () => set({ remotePending: null }),
}));
