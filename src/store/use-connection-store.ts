import { create } from 'zustand';

import type { ConnectionDiagnosis, SocketGiveUp, SocketStatus } from '@/port/connection';
import type { ConnectionStatus } from '@/queue/connection-status';
import { comfyPort } from '@/store/ports/comfy-port';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 接続状態。失敗理由は握り潰さず診断つきで保持する（原因が切り分かる表示にするため）。
// ─────────────────────────────

/** ComfyUI との接続と通知の口の状態 */
interface ConnectionState {
  readonly status: ConnectionStatus;
  readonly socketStatus: SocketStatus;
  /** 通知の張り直しが何回目か。開いている間と張る前は 0 */
  readonly socketRetry: number;
  /**
   * 通知の張り直しを諦めた理由（タイムアウト・切断扱い）。諦めていなければ null。**次に開くまで**残す。
   * 張り直しで接続を確かめ直している間も、届かない相手を実行中と見なさないため。
   * 残っている間は実行を送らない
   */
  readonly socketTimeout: SocketGiveUp | null;
  /**
   * 通知の口を疑った回数。増えたら口を閉じて張り直す（`useComfySocket` が見る）。
   * 相手が応答しないと HTTP で分かっても、口には切れたことが届かないことがある
   */
  readonly socketSuspicion: number;
  /**
   * 直近の失敗理由。接続の案内の出し分けに使う
   */
  readonly diagnosis: ConnectionDiagnosis | null;
  /**
   * つながっている所から接続し直す途中で、いったん未接続にしている間（`useComfyConnect`）。
   * 通知の口が閉じ、張り直しから先は初めて接続したときと同じ手続きになる
   */
  readonly pausing: boolean;
  /** 未接続にして、接続し直すまでの間を示す */
  readonly pause: () => void;
  readonly resume: () => void;
  /**
   * `/features` で疎通を確認する。失敗時は原因を推定して残す。
   * 「CORS か未起動か」が残るときだけ、中身を読まない要求で届くかを確かめて分ける
   */
  readonly probe: (baseUrl: string) => Promise<boolean>;
  readonly beginConnect: () => void;
  readonly succeed: () => void;
  readonly fail: (diagnosis: ConnectionDiagnosis) => void;
  readonly setSocketStatus: (status: SocketStatus) => void;
  readonly setSocketRetry: (attempt: number) => void;
  readonly timeOutSocket: (reason: SocketGiveUp) => void;
  readonly suspectSocket: () => void;
  readonly reset: () => void;
}

const INITIAL = {
  status: 'disconnected' as ConnectionStatus,
  socketStatus: 'closed' as SocketStatus,
  socketRetry: 0,
  socketTimeout: null,
  socketSuspicion: 0,
  diagnosis: null,
  pausing: false,
};

export const useConnectionStore = create<ConnectionState>()((set) => ({
  ...INITIAL,

  probe: async (baseUrl) => {
    set({ status: 'connecting', diagnosis: null });
    try {
      await comfyPort().connection.check(baseUrl);
      set({ status: 'connected', diagnosis: null });
      return true;
    } catch (error) {
      const diagnosis = await comfyPort().connection.diagnose(error, baseUrl);
      set({ status: 'failed', diagnosis });
      return false;
    }
  },
  beginConnect: () => set({ status: 'connecting', diagnosis: null }),
  pause: () => set({ status: 'disconnected', diagnosis: null, pausing: true }),
  resume: () => set({ pausing: false }),
  succeed: () => set({ status: 'connected', diagnosis: null }),
  fail: (diagnosis) => set({ status: 'failed', diagnosis }),
  setSocketStatus: (socketStatus) =>
    set(
      socketStatus === 'open'
        ? { socketStatus, socketRetry: 0, socketTimeout: null }
        : socketStatus === 'connecting'
          ? { socketStatus, socketRetry: 0 }
          : { socketStatus },
    ),
  setSocketRetry: (socketRetry) => set({ socketRetry }),
  timeOutSocket: (socketTimeout) => set({ socketTimeout }),
  suspectSocket: () => set((state) => ({ socketSuspicion: state.socketSuspicion + 1 })),
  reset: () => set(INITIAL),
}));

/**
 * つないでいる ComfyUI の接続先。つないでいなければ null（会話の置き場）
 */
export function connectedComfyUrl(): string | null {
  if (useConnectionStore.getState().status !== 'connected') return null;
  const baseUrl = useSettingsStore.getState().baseUrl;
  return baseUrl.trim().length === 0 ? null : baseUrl;
}
