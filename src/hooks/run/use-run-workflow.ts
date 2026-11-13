import { useCallback, useState } from 'react';

import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { activeRunSource, submitRun, tabRunSource, type RunSource } from '@/store/run/run-submit';
import { useExecutionStore } from '@/store/use-execution-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 実行の呼び出しと、送信中の印・止める・外す操作。投げる手続きは store/run/run-submit.ts。
// `POST /prompt` は GPU を消費するので、画面の明示操作からしか呼ばない。
// ─────────────────────────────

/** 実行を投げる・止める・外す手続きと、送信中の印 */
interface RunWorkflow {
  readonly run: () => Promise<void>;
  /**
   * 指定したタブのワークフローを投げる（繰り返し実行。アクティブなタブは見ない）。
   * 受理された実行の id を返し、投げられなければ null
   */
  readonly runTab: (tabId: string) => Promise<string | null>;
  /** その実行だけを止める（キュー列の実行中のカードから。ほかの画面の実行は止めない） */
  readonly interrupt: (promptId: string) => Promise<void>;
  /** 実行前のタスクをキューから外す（走っている実行には効かない） */
  readonly cancelQueued: (promptId: string) => Promise<void>;
  readonly busy: boolean;
}

/** アクティブなタブか指定したタブのワークフローを投げ、キューの実行を止める・外す手続きを返す */
export function useRunWorkflow(): RunWorkflow {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const clientId = useSettingsStore((state) => state.clientId);
  const fail = useExecutionStore((state) => state.fail);
  const stop = useExecutionStore((state) => state.stop);
  const refreshQueue = useQueueStore((state) => state.refresh);

  const [busy, setBusy] = useState(false);

  // compiler はこのフックを飛ばす（catch の無い try を扱えない）ので、渡す手続きは手で固定する
  const submit = useCallback(
    async (source: RunSource | null): Promise<string | null> => {
      // clientId が決まる前に送ると、その実行の通知がどのタブにも届かない
      if (!source || baseUrl.length === 0 || clientId.length === 0) return null;
      setBusy(true);
      try {
        return await submitRun(source);
      } finally {
        setBusy(false);
      }
    },
    [baseUrl, clientId],
  );

  const run = useCallback(async () => {
    await submit(activeRunSource());
  }, [submit]);

  const runTab = useCallback((tabId: string) => submit(tabRunSource(tabId)), [submit]);

  const interrupt = useCallback(
    async (promptId: string) => {
      if (baseUrl.length === 0) return;
      try {
        await comfyPort().run.interrupt(baseUrl, promptId);
        // 走っていなければ通知は来ない。手元で見ている実行なら、押した時点で手元の状態を解く
        if (useExecutionStore.getState().promptId === promptId) stop();
        // 手元で見ていない実行（読み込み直した後など）は手元の状況が動かないので、
        // キューを取り直して列から消す（待っていると止めたのに残って見える）
        await refreshQueue(baseUrl);
      } catch (error) {
        fail({ node: null, message: formatComfyFailure(error) });
      }
    },
    [baseUrl, fail, stop, refreshQueue],
  );

  const cancelQueued = useCallback(
    async (promptId: string) => {
      if (baseUrl.length === 0) return;
      try {
        await comfyPort().queue.deleteQueued(baseUrl, promptId);
        // 投げた直後で手元が待っている実行なら、通知は来ないので手元の状況を解く
        if (useExecutionStore.getState().promptId === promptId) stop();
        await refreshQueue(baseUrl);
      } catch (error) {
        fail({ node: null, message: formatComfyFailure(error) });
      }
    },
    [baseUrl, fail, stop, refreshQueue],
  );

  return { run, runTab, interrupt, cancelQueued, busy };
}
