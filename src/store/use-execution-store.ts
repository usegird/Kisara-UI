import { create } from 'zustand';

import type { ComfyEvent } from '@/port/run';
import { reconcileExecution, reduceExecution, type QueuePresence } from '@/queue/execution';
import {
  clearRun,
  INITIAL_EXECUTION,
  type ExecutionError,
  type ExecutionSnapshot,
} from '@/queue/execution-state';

// ─────────────────────────────
// 実行の状況のストア。通知の反映と突き合わせの実体は `queue/execution.ts` にあり、
// ここは時刻を刻んで呼ぶだけ。
// ─────────────────────────────

/** 実行の状況と、受理・通知・立て直しを反映する操作 */
export interface ExecutionState extends ExecutionSnapshot {
  /** `POST /prompt` が受理されたときに呼ぶ。`totalNodes` は送った prompt のノード数 */
  readonly start: (promptId: string, totalNodes?: number) => void;
  readonly applyEvent: (event: ComfyEvent) => void;
  /** キューと履歴の見え方に合わせて立て直す（見張りから呼ぶ） */
  readonly reconcile: (presence: QueuePresence) => void;
  readonly fail: (error: ExecutionError) => void;
  /** 不明にする（通知を諦めたとき）。実行中・待機のときだけ効く */
  readonly markUnknown: (message: string) => void;
  /** 中断操作。**通知を待たずに**手元の実行状態を解く（押せないまま固まらないように） */
  readonly stop: () => void;
  /**
   * 次を投げる前の片付け。今の実行の状況は消すが、**実行 id ごとの記録は残す**
   * （キューの写しを取り直すまで前の実行の画像を出すため。`clearRun`）
   */
  readonly clearForSubmit: () => void;
  readonly reset: () => void;
}

/** 覚えておく自分の実行の数（キューに積める上限の目安） */
const QUEUE_MEMORY = 50;

export const useExecutionStore = create<ExecutionState>()((set) => ({
  ...INITIAL_EXECUTION,

  // 受理応答は**通知より遅れて届くことがある**。その prompt の通知を既に受けていたら、
  // 状態を「キュー待ち」で塗り潰さない（塗り潰すと実行ボタンが押せないまま固まる）
  // 実行中でもキューに足せる。**走っている実行の表示は消さず**、id だけ覚える
  start: (promptId, totalNodes) =>
    set((state) => {
      const submittedIds = [...state.submittedIds, promptId].slice(-QUEUE_MEMORY);
      const totalNodesById =
        totalNodes === undefined
          ? state.totalNodesById
          : { ...state.totalNodesById, [promptId]: totalNodes };

      const submittedAt = Date.now();

      if (state.observedPromptId === promptId) {
        return { ...state, promptId, submittedIds, totalNodesById, submittedAt };
      }

      const busy = state.status === 'running' || state.status === 'queued';
      if (busy) return { ...state, submittedIds, totalNodesById };

      // 前の実行の記録（ノード時刻・出力）は残す（詳細と画像はタスクごとに引く）
      return {
        ...clearRun(state),
        status: 'queued',
        promptId,
        submittedIds,
        totalNodesById,
        submittedAt,
      };
    }),

  // 時刻はイベントに載らないので、状態が動いた瞬間をストア側で刻む（reducer は純関数のまま）
  applyEvent: (event) =>
    set((state) => {
      const next = reduceExecution(state, event);
      if (next === state) return next;

      const started = next.status === 'running' && state.status !== 'running';
      const finished =
        (next.status === 'done' || next.status === 'failed') && next.status !== state.status;

      return {
        ...next,
        startedAt: started ? Date.now() : next.startedAt,
        finishedAt: finished ? Date.now() : next.finishedAt,
      };
    }),

  reconcile: (presence) => set((state) => reconcileExecution(state, presence)),

  markUnknown: (message) =>
    set((state) =>
      state.status === 'running' || state.status === 'queued'
        ? {
            ...state,
            status: 'unknown',
            runningNode: null,
            progress: null,
            finishedAt: Date.now(),
            error: { node: null, message },
          }
        : state,
    ),

  fail: (error) =>
    set({
      status: 'failed',
      error,
      runningNode: null,
      progress: null,
      finishedAt: Date.now(),
    }),

  stop: () =>
    set((state) =>
      state.status === 'running' || state.status === 'queued'
        ? {
            ...state,
            status: 'done',
            runningNode: null,
            progress: null,
            interrupted: true,
            finishedAt: Date.now(),
          }
        : state,
    ),

  clearForSubmit: () => set(clearRun),

  reset: () => set(INITIAL_EXECUTION),
}));
