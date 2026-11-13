import { create } from 'zustand';

import type { HistoryEntry, QueueEntry } from '@/port/history';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { ownSessions, useTabsStore } from '@/store/use-tabs-store';
import { useTaskLogStore } from '@/store/use-task-log-store';

// ─────────────────────────────
// タスクキュー（`GET /queue` + `GET /history`）の状態。取り直すのは実行状態が動いたときと実行中の見張りで、
// 見張りは軽い `GET /queue` だけを見る。取得は通信の窓口に任せ、ここは状態を持つだけ。
// ─────────────────────────────

/**
 * 見張りの問い合わせを待つ上限。軽い要求なので長く待たない。
 * 過ぎたら相手が応答しないと見なす
 */
const POLL_TIMEOUT_MS = 5_000;

/**
 * 取り直すときの履歴の件数。増やすと `/history` の応答が重くなる。
 * **最初の 1 回だけは全件**読む（読み込み直しても ComfyUI に残っているものを全部出す）
 */
export const HISTORY_LIMIT = 20;

/** キューに居る実行 id（実行中 → 待機の順） */
export function queueIds(entries: {
  readonly running: readonly QueueEntry[];
  readonly pending: readonly QueueEntry[];
}): string[] {
  return [...entries.running, ...entries.pending].map((entry) => entry.promptId);
}

/** 見張りで取った並びが、手元と違うか */
export function queueChanged(
  before: { readonly running: readonly QueueEntry[]; readonly pending: readonly QueueEntry[] },
  after: { readonly running: readonly QueueEntry[]; readonly pending: readonly QueueEntry[] },
): boolean {
  const a = queueIds(before);
  const b = queueIds(after);

  return a.length !== b.length || a.some((id, index) => id !== b[index]);
}

/** キューと履歴と、取り直す・見張る操作 */
interface QueueState {
  readonly running: readonly QueueEntry[];
  readonly pending: readonly QueueEntry[];
  readonly history: readonly HistoryEntry[];
  readonly error: string | null;
  readonly loading: boolean;
  /** 最後に取れた時刻（epoch ミリ秒）。一度も取れていなければ null */
  readonly fetchedAt: number | null;
  /** 最後に取れたものを問い合わせ始めた時刻（epoch ミリ秒）。突き合わせが古い見え方で決めないため */
  readonly requestedAt: number | null;
  /**
   * 取り直す。`full` なら履歴を全件読む（通知を張り直したとき。ComfyUI の再起動の後を
   * まとめて出し、実行の記録の起動を決め直す）。
   * 取り直しの最中に呼ばれたら、終わってから 1 回だけ取り直す（返すのはその分まで終わる Promise）
   */
  readonly refresh: (baseUrl: string, full?: boolean) => Promise<void>;
  /** 見張り。並びが変わっていたときだけ履歴ごと取り直す。取れなければ false */
  readonly poll: (baseUrl: string) => Promise<boolean>;
  readonly clear: () => void;
}

const EMPTY = {
  running: [],
  pending: [],
  history: [],
  error: null,
  loading: false,
  fetchedAt: null,
  requestedAt: null,
};

export const useQueueStore = create<QueueState>()((set, get) => {
  /**
   * 走っている取り直し。**1 本だけ**にする（重なると、遅れて返った古い応答で並びが巻き戻る）
   */
  let inFlight: Promise<void> | null = null;
  /** 走っている間に来た依頼。終わってから 1 回だけ取り直す（全件の依頼があれば全件） */
  let queued: { readonly baseUrl: string; readonly full: boolean } | null = null;

  const load = async (baseUrl: string, full: boolean): Promise<void> => {
    set({ loading: true });
    const requestedAt = Date.now();
    // まだ一度も取れていなければ全件（以後は手元の控えに足していく）
    const all = full || get().fetchedAt === null;
    try {
      const [queue, history] = await Promise.all([
        comfyPort().queue.fetchQueue(baseUrl),
        comfyPort().queue.fetchHistory(baseUrl, all ? undefined : HISTORY_LIMIT),
      ]);
      // 履歴はサーバー再起動で消えるので、**応答ごと**端末側にも控える。
      // 控えるのはこのブラウザのタブのセッションで送った実行だけ
      const own = ownSessions(useTabsStore.getState());
      useTaskLogStore.getState().record(
        history.entries.filter((entry) => entry.session !== null && own.includes(entry.session)),
        history.raw,
      );
      // 再起動をまたいで残す記録は接続先のユーザーフォルダへ。待たない
      void useRunHistoryStore.getState().ingest(baseUrl, history.raw);
      set({
        running: queue.running,
        pending: queue.pending,
        history: history.entries,
        error: null,
        loading: false,
        fetchedAt: Date.now(),
        requestedAt,
      });
    } catch (error) {
      set({
        loading: false,
        error: formatComfyFailure(error),
      });
    }
  };

  return {
    ...EMPTY,

    refresh: (baseUrl, full = false) => {
      if (baseUrl.length === 0) return Promise.resolve();
      if (inFlight !== null) {
        queued = { baseUrl, full: full || (queued?.full ?? false) };
        return inFlight;
      }
      const run = async (): Promise<void> => {
        let job: { readonly baseUrl: string; readonly full: boolean } | null = { baseUrl, full };
        while (job !== null) {
          await load(job.baseUrl, job.full);
          job = queued;
          queued = null;
        }
      };
      inFlight = run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },

    // 見張りは軽い方だけを見る。履歴は数百 KB になりうるので、変化したときだけ取り直す
    poll: async (baseUrl) => {
      if (baseUrl.length === 0) return true;

      try {
        const queue = await comfyPort().queue.fetchQueue(baseUrl, { timeoutMs: POLL_TIMEOUT_MS });
        if (queueChanged(get(), queue)) {
          await get().refresh(baseUrl);
          return true;
        }
        // 並びが同じでも、取れたことは記録する（突き合わせの拠り所になる）。履歴は前に取ったものの
        // ままなので、問い合わせ始めた時刻（`requestedAt`）は進めない
        set({ error: null, fetchedAt: Date.now() });
        return true;
      } catch (error) {
        set({ error: formatComfyFailure(error) });
        return false;
      }
    },

    clear: () => set(EMPTY),
  };
});
