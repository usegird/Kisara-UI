import { useEffect } from 'react';

import { hasRunInFlight } from '@/queue/execution-state';
import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// キューの取り直しと、サーバーとの突き合わせ。止まっている間は問い合わせない。
// ─────────────────────────────

/** 見張りの間隔。実行中だと見ている間だけ動く */
export const WATCH_INTERVAL_MS = 5_000;

/**
 * 実行の状況が動いたとき・通知の口が張り直されたとき・実行中だと見ている間の見張りでキューを
 * 取り直し、手元の実行状況と突き合わせる（どこにも居ない実行を実行中のままにしない）。
 */
export function useQueueWatch(): void {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const connected = useConnectionStore((state) => state.status === 'connected');
  const socketStatus = useConnectionStore((state) => state.socketStatus);
  // 通知を諦めたら見張りも止める。届かない相手に問い合わせ続けない
  const timedOut = useConnectionStore((state) => state.socketTimeout !== null);
  const suspectSocket = useConnectionStore((state) => state.suspectSocket);

  const refresh = useQueueStore((state) => state.refresh);
  const poll = useQueueStore((state) => state.poll);
  const running = useQueueStore((state) => state.running);
  const pending = useQueueStore((state) => state.pending);
  const history = useQueueStore((state) => state.history);
  const fetchedAt = useQueueStore((state) => state.fetchedAt);
  const requestedAt = useQueueStore((state) => state.requestedAt);

  const status = useExecutionStore((state) => state.status);
  const queueRemaining = useExecutionStore((state) => state.queueRemaining);
  const reconcile = useExecutionStore((state) => state.reconcile);

  // 状況が動いたときと、通知が張り直されたとき（切断中に終わっていることがある）
  useEffect(() => {
    if (!connected) return;
    void refresh(baseUrl);
  }, [connected, baseUrl, refresh, status, queueRemaining, socketStatus]);

  const inFlight = hasRunInFlight(status, running.length + pending.length);

  useEffect(() => {
    if (!connected || !inFlight || timedOut) return;

    // 見張りは軽い `GET /queue` だけで、変化したときにだけ履歴ごと取り直す（ストアの `poll`）。
    // 取れなければ、通知の口も死んでいると見なして張り直させる。
    // 切れたことが口に届かない構成では、これが無いと再接続が始まらない
    const tick = async (): Promise<void> => {
      if (!(await poll(baseUrl))) suspectSocket();
    };
    const timer = setInterval(() => void tick(), WATCH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [connected, inFlight, timedOut, baseUrl, poll, suspectSocket]);

  // 取れたものと突き合わせる。一度も取れていないうちは結論を出さない。
  // 問い合わせ始めた時刻を添え、投げる前に問い合わせた見え方では決めさせない
  useEffect(() => {
    if (fetchedAt === null) return;

    reconcile({
      active: [...running, ...pending].map((entry) => entry.promptId),
      finished: history,
      requestedAt: requestedAt ?? fetchedAt,
    });
  }, [fetchedAt, requestedAt, running, pending, history, reconcile]);
}
