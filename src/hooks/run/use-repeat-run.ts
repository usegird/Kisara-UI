import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useRunWorkflow } from '@/hooks/run/use-run-workflow';
import { useExecutionStore } from '@/store/use-execution-store';
import { useQueueStore } from '@/store/use-queue-store';
import { repeatOutcome, useRepeatStore, type RepeatJob } from '@/store/use-repeat-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';
import { useTaskLogStore } from '@/store/use-task-log-store';

function settle(tabId: string, promptId: string | null): void {
  const repeat = useRepeatStore.getState();
  if (!repeat.jobs.some((job) => job.tabId === tabId)) return;
  if (promptId === null) repeat.stop(tabId);
  else repeat.submitted(tabId, promptId);
}

export function useStartRepeatRun(): (tabId: string) => void {
  return (tabId: string) => {
    useRepeatStore.getState().begin(tabId);
  };
}

function isQueueIdle(state: ReturnType<typeof useQueueStore.getState>): boolean {
  return state.fetchedAt !== null && state.running.length === 0 && state.pending.length === 0;
}

function stillWaiting(job: RepeatJob): boolean {
  const current = useRepeatStore.getState().jobs.find((item) => item.tabId === job.tabId);
  return (
    current !== undefined &&
    current.promptId === null &&
    !current.sending &&
    current.count === job.count
  );
}

export function useRepeatRunDriver(): void {
  const { runTab } = useRunWorkflow();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const jobs = useRepeatStore((state) => state.jobs);
  const tabIds = useTabsStore(useShallow((state) => state.tabs.map((tab) => tab.id)));
  const idle = useQueueStore(isQueueIdle);
  const execution = useExecutionStore(
    useShallow((state) => ({ promptId: state.promptId, status: state.status })),
  );
  const logged = useTaskLogStore(
    useShallow((state) =>
      jobs.map((job) =>
        job.promptId === null
          ? null
          : (state.entries.find((entry) => entry.promptId === job.promptId)?.success ?? null),
      ),
    ),
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  useEffect(() => {
    const repeat = useRepeatStore.getState();
    const limits = useSettingsStore.getState().safeguards;
    jobs.forEach((job, at) => {
      if (!tabIds.includes(job.tabId)) {
        repeat.stop(job.tabId);
        return;
      }
      if (job.sending) return;

      if (job.promptId !== null) {
        const outcome = repeatOutcome(job.promptId, { execution, logged: logged[at] ?? null });
        if (outcome === 'pending') return;
        const failed = outcome === 'failed';
        if (
          (failed && job.failures + 1 >= limits.repeatFailureLimit) ||
          job.count >= limits.repeatMaxRuns
        ) {
          repeat.stop(job.tabId);
          return;
        }
        repeat.release(job.tabId, failed);
        return;
      }

      if (!idle || timers.current.has(job.tabId)) return;
      scheduleSend(timers.current, job, limits.repeatMinIntervalMs, runTab);
    });
  }, [jobs, tabIds, idle, execution, logged, runTab]);
}

function scheduleSend(
  timers: Map<string, ReturnType<typeof setTimeout>>,
  job: RepeatJob,
  minIntervalMs: number,
  runTab: (tabId: string) => Promise<string | null>,
): void {
  const { tabId } = job;
  const wait = Math.max(0, job.sentAt + minIntervalMs - Date.now());
  const timer = setTimeout(() => {
    timers.delete(tabId);
    if (!stillWaiting(job) || !isQueueIdle(useQueueStore.getState())) return;
    useRepeatStore.getState().send(tabId);
    void runTab(tabId).then((promptId) => settle(tabId, promptId));
  }, wait);
  timers.set(tabId, timer);
}
