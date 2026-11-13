import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useRunWorkflow } from '@/hooks/run/use-run-workflow';
import { useExecutionStore } from '@/store/use-execution-store';
import { repeatOutcome, useRepeatStore, type RepeatJob } from '@/store/use-repeat-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';
import { useTaskLogStore } from '@/store/use-task-log-store';

// ─────────────────────────────
// 繰り返し実行を始める手続きと送り。送りを 2 か所に置くと二重に投げるので、別のフックにする。
// `POST /prompt` は GPU を消費するので、始めるのは画面の明示操作だけ。
// ─────────────────────────────

/** 投げ終えたら、まだそのタブの繰り返しの最中かを確かめてから id を覚える */
function settle(tabId: string, promptId: string | null): void {
  const repeat = useRepeatStore.getState();
  if (!repeat.jobs.some((job) => job.tabId === tabId)) return;
  if (promptId === null) repeat.stop(tabId);
  else repeat.submitted(tabId, promptId);
}

/** 繰り返しを始める（選んだときのタブに結び付け、1 回目を投げる）。最中のタブでは何もしない */
export function useStartRepeatRun(): (tabId: string) => Promise<void> {
  const { runTab } = useRunWorkflow();

  return async (tabId: string) => {
    if (!useRepeatStore.getState().begin(tabId)) return;
    settle(tabId, await runTab(tabId));
  };
}

/** 待っている間に止められたり始め直されたりしていないか（手放したときのままか） */
function stillWaiting(job: RepeatJob): boolean {
  const current = useRepeatStore.getState().jobs.find((item) => item.tabId === job.tabId);
  return current !== undefined && current.promptId === null && current.count === job.count;
}

/**
 * 繰り返しの送り。右の列で 1 か所だけ呼ぶ（キューの見張りと同じく、どのタブを見ていても続ける）。
 * 繰り返しごとに決着を見て次を投げる。一瞬で終わる実行（失敗・出力のキャッシュ）でキューを
 * 埋めないよう、設定の防御機構の値（続けて失敗した回数・最短の間隔・回数の上限）で止める。
 */
export function useRepeatRunDriver(): void {
  const { runTab } = useRunWorkflow();
  // 最短の間隔を待っている送り。右の列を外したら捨てる
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const jobs = useRepeatStore((state) => state.jobs);
  const tabIds = useTabsStore(useShallow((state) => state.tabs.map((tab) => tab.id)));
  const execution = useExecutionStore(
    useShallow((state) => ({ promptId: state.promptId, status: state.status })),
  );
  // 繰り返しごとの今の実行の控え（成否）。並びは `jobs` と同じ
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
      // 対象のタブを閉じたら止まる。走っている分はそのまま
      if (!tabIds.includes(job.tabId)) {
        repeat.stop(job.tabId);
        return;
      }
      // 投げている途中は待つ
      if (job.promptId === null) return;

      const outcome = repeatOutcome(job.promptId, { execution, logged: logged[at] ?? null });
      if (outcome === 'pending') return;
      // 失敗が続いた・投げる回数の上限に届いたときは終える。実行中の失敗だけなら次を投げる
      const failed = outcome === 'failed';
      if (
        (failed && job.failures + 1 >= limits.repeatFailureLimit) ||
        job.count >= limits.repeatMaxRuns
      ) {
        repeat.stop(job.tabId);
        return;
      }

      // **同じ実行から 2 回投げない。** 先に手放してから投げる
      repeat.release(job.tabId, failed);
      const { tabId } = job;
      const settleTab = (promptId: string | null): void => settle(tabId, promptId);
      // 前に投げてから最短の間隔が過ぎるまで待つ。待つ間に止められたら投げない
      const wait = Math.max(0, job.sentAt + limits.repeatMinIntervalMs - Date.now());
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        if (!stillWaiting(job)) return;
        void runTab(tabId).then(settleTab);
      }, wait);
      timers.current.add(timer);
    });
  }, [jobs, tabIds, execution, logged, runTab]);
}
