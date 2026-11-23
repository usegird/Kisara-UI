import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useReusedItems } from '@/hooks/ui/use-reused-items';
import { retryCount } from '@/queue/connection-status';
import { timeoutMessage } from '@/queue/execution';
import type { ExecutionProgress } from '@/queue/execution-state';
import {
  buildQueueTasks,
  otherRuns,
  type OtherRuns,
  type QueueTask,
  type TaskStall,
} from '@/queue/queue-tasks';
import { previousTimingsOf, runProgressOf } from '@/queue/run-progress';
import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useQueueStore } from '@/store/use-queue-store';
import { ownSessions, useTabsStore } from '@/store/use-tabs-store';
import { useTaskLogStore } from '@/store/use-task-log-store';

const NOW_TICK_MS = 1000;

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

export function useQueueTasks(): readonly QueueTask[] {
  const running = useQueueStore((state) => state.running);
  const pending = useQueueStore((state) => state.pending);
  const history = useQueueStore((state) => state.history);
  const logged = useTaskLogStore((state) => state.entries);
  const sessions = useTabsStore(useShallow(ownSessions));

  const status = useExecutionStore((state) => state.status);
  const promptId = useExecutionStore((state) => state.promptId);
  const startedAt = useExecutionStore((state) => state.startedAt);
  const finishedAt = useExecutionStore((state) => state.finishedAt);
  const error = useExecutionStore((state) => state.error);
  const outputsById = useExecutionStore((state) => state.outputsById);

  const timeout = useConnectionStore((state) => state.socketTimeout);
  const timedOut = timeout !== null;
  const retry = useConnectionStore((state) => retryCount(state.socketStatus, state.socketRetry));
  const stall = stallOf(timeout, retry);

  const now = useNow(
    !timedOut && (status === 'running' || status === 'queued' || running.length > 0),
  );

  const progress = useRunProgress(now);

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

function useRunProgress(now: number): ExecutionProgress | null {
  const promptId = useExecutionStore((state) => state.promptId);
  const step = useExecutionStore((state) => state.progress);
  const runningNode = useExecutionStore((state) => state.runningNode);
  const nodeStates = useExecutionStore((state) => state.nodeStates);
  const cachedNodes = useExecutionStore((state) => state.cachedNodes);
  const promptNodesById = useExecutionStore((state) => state.promptNodesById);
  const nodeTimingsById = useExecutionStore((state) => state.nodeTimingsById);

  const nodeIds = promptId === null ? undefined : promptNodesById[promptId];
  if (promptId === null || nodeIds === undefined) return step;

  return runProgressOf({
    nodeIds,
    nodeStates,
    cachedNodes,
    timings: nodeTimingsById[promptId] ?? [],
    runningNode,
    step,
    previous: previousTimingsOf(promptId, promptNodesById, nodeTimingsById),
    now,
  });
}

export function useOtherRuns(): OtherRuns {
  const sessions = useTabsStore(useShallow(ownSessions));
  return useQueueStore(useShallow((state) => otherRuns(state.running, state.pending, sessions)));
}

function stallOf(
  timeout: Parameters<typeof timeoutMessage>[0] | null,
  retry: string | null,
): TaskStall | null {
  if (timeout !== null) return { message: timeoutMessage(timeout), unknown: true };
  if (retry === null) return null;
  return { message: retry, unknown: false };
}
