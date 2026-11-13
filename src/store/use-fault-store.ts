import { create } from 'zustand';

import { t } from '@/i18n';
import { traceFault } from '@/lib/trace';
import { formatFault } from '@/queue/comfy-failure-text';

// ─────────────────────────────
// 想定外の失敗（描けなかった部品と、誰も受けなかった失敗）の控え。画面は止めずにトーストで知らせる。
// 保存はしない（読み込み直せば消える）。
// ─────────────────────────────

/** 覚えておく件数。知らせは届いた 1 件ごとに出す */
const FAULT_LIMIT = 20;

/** 想定外の失敗の 1 件 */
interface Fault {
  readonly id: number;
  /** どこで起きたか（部品名・操作名） */
  readonly where: string;
  readonly message: string;
  readonly at: number;
}

/** 想定外の失敗の控えと、知らせる・消す操作 */
interface FaultState {
  readonly faults: readonly Fault[];
  readonly report: (where: string, message: string) => void;
  /** 控えを消す */
  readonly clear: () => void;
}

let nextId = 1;

export const useFaultStore = create<FaultState>()((set) => ({
  faults: [],

  report: (where, message) =>
    set((state) => {
      // 同じ失敗が続けて届いたら 1 件にまとめる（描き直しのたびに同じものが来る）。間に別の失敗を
      // 挟んでまた起きたものは、新しく知らせる（知らせの側で同じ文面は回数にまとまる）
      const latest = state.faults[0];
      if (latest !== undefined && latest.where === where && latest.message === message) {
        return state;
      }
      return {
        faults: [{ id: nextId++, where, message, at: Date.now() }, ...state.faults].slice(
          0,
          FAULT_LIMIT,
        ),
      };
    }),

  clear: () => set({ faults: [] }),
}));

/**
 * 誰も受けなかった失敗を控えに回す。**押した操作の途中の失敗は描画を止めない**ので、
 * 黙って消えないよう、ここで拾って知らせる。外すための関数を返す
 */
export function installFaultHandlers(target: Window = window): () => void {
  // 描いている最中に届くことがある（下の層が閉じ込めた失敗を知らせたとき）。
  // その場でストアを変えると描画中の更新になるので、描き終わってから控える
  const later = (where: string, message: string): void =>
    queueMicrotask(() => useFaultStore.getState().report(where, message));
  // 診断のログには投げられた物をそのまま渡す（スタックトレースと原因の連なりを残す）
  const onError = (event: ErrorEvent): void => {
    const where = t('fault.where.processing');
    traceFault(where, event.error ?? event.message);
    later(where, formatFault(event.error ?? event.message));
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    const where = t('fault.where.operation');
    traceFault(where, event.reason);
    later(where, formatFault(event.reason));
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
