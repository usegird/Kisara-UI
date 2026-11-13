import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useReusedItems } from '@/hooks/ui/use-reused-items';
import { retryCount } from '@/queue/connection-status';
import { timeoutMessage } from '@/queue/execution';
import {
  buildQueueTasks,
  otherRuns,
  type OtherRuns,
  type QueueTask,
  type TaskStall,
} from '@/queue/queue-tasks';
import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useQueueStore } from '@/store/use-queue-store';
import { ownSessions, useTabsStore } from '@/store/use-tabs-store';
import { useTaskLogStore } from '@/store/use-task-log-store';

// ─────────────────────────────
// キュー列に出す並びの組み立て。キューと結果を見る側は全部ここから受け取る
// （列とビューワーで別々に組み立てない）。
// ─────────────────────────────

/** 現在時刻を刻む間隔（1 秒） */
const NOW_TICK_MS = 1000;

/** 1秒ごとの現在時刻。実行中だけ動かす（止まっている間は再描画しない） */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;

    const timer = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(timer);
  }, [active]);

  return active ? now : 0;
}

function taskKey(task: QueueTask): string {
  return task.promptId;
}

/** キュー・履歴・手元の実行状況から、キュー列に出すタスクの並びを組み立てて返す */
export function useQueueTasks(): readonly QueueTask[] {
  const running = useQueueStore((state) => state.running);
  const pending = useQueueStore((state) => state.pending);
  const history = useQueueStore((state) => state.history);
  const logged = useTaskLogStore((state) => state.entries);
  // 出すのはこのブラウザのタブのセッション（今のものと前のもの）で送った実行だけ
  const sessions = useTabsStore(useShallow(ownSessions));

  // ストア全体は購読しない。必要な値だけを個別のセレクタで取る
  const status = useExecutionStore((state) => state.status);
  const promptId = useExecutionStore((state) => state.promptId);
  const progress = useExecutionStore((state) => state.progress);
  const startedAt = useExecutionStore((state) => state.startedAt);
  const finishedAt = useExecutionStore((state) => state.finishedAt);
  const error = useExecutionStore((state) => state.error);
  const outputsById = useExecutionStore((state) => state.outputsById);

  // 通知が途切れているときの一言（リトライの回数・タイムアウト）
  const timeout = useConnectionStore((state) => state.socketTimeout);
  const timedOut = timeout !== null;
  const retry = useConnectionStore((state) => retryCount(state.socketStatus, state.socketRetry));
  const stall = stallOf(timeout, retry);

  // **サーバーが走らせている間も動かす。** 自分が投げた実行でなくても経過時間を出すため
  // （止めないと基準が 0 のままになり、時間が出ない）。諦めたあとは動かさない
  const now = useNow(
    !timedOut && (status === 'running' || status === 'queued' || running.length > 0),
  );

  // 中身が変わらないタスクは前回と同じものを返す。並びは毎回組み直すので、そのままでは
  // 進捗が 1 つ進むたびに履歴の全カードが描き直しになる
  return useReusedItems(
    buildQueueTasks({
      running,
      pending,
      history,
      logged,
      current: {
        promptId,
        status,
        progress,
        startedAt,
        finishedAt,
        error: error?.message ?? null,
        outputsById,
      },
      now,
      stall,
      sessions,
    }),
    taskKey,
  );
}

/** ほかのセッション・画面から送られて、実行中・待機している数 */
export function useOtherRuns(): OtherRuns {
  const sessions = useTabsStore(useShallow(ownSessions));
  return useQueueStore(useShallow((state) => otherRuns(state.running, state.pending, sessions)));
}

/** 通知が途切れているときの一言。諦めた（タイムアウト）なら結果は分からない。途切れていなければ null */
function stallOf(
  timeout: Parameters<typeof timeoutMessage>[0] | null,
  retry: string | null,
): TaskStall | null {
  if (timeout !== null) return { message: timeoutMessage(timeout), unknown: true };
  if (retry === null) return null;
  return { message: retry, unknown: false };
}
