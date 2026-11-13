import { useEffect, useRef } from 'react';

import type { EventConnection } from '@/port/comfy-port';
import { timeoutMessage } from '@/queue/execution';
import { hasRunInFlight } from '@/queue/execution-state';
import { RECONNECT_POLICY } from '@/queue/reconnect-policy';
import { comfyPort } from '@/store/ports/comfy-port';
import { emitComfyEvent } from '@/store/run/comfy-event-listeners';
import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useModelFilesStore } from '@/store/use-model-files-store';
import { useModelNotesStore } from '@/store/use-model-notes-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useStylesStore } from '@/store/use-styles-store';
import { useTagsStore } from '@/store/use-tags-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

// ─────────────────────────────
// 実行状況の WebSocket を1本だけ張り、実行ストアへ流す。メッセージの検証・再接続・切断表示は
// 通信の窓口（`events.connect`）が持つ。
// ─────────────────────────────

/**
 * 張り直しで開いたときに、履歴を全件取り直す最短の間隔。
 */
export const FULL_REFRESH_GAP_MS = 60_000;

/** 取れなかった一覧（モデル・スタイル・タグ辞書・ワイルドカード・メモの拡張）だけを取り直す */
function retryFailedLists(baseUrl: string, retryModels: (baseUrl: string) => Promise<void>): void {
  void retryModels(baseUrl);
  const styles = useStylesStore.getState();
  if (styles.status === 'error') void styles.refresh(baseUrl);
  const tags = useTagsStore.getState();
  if (tags.status === 'error') void tags.refresh(baseUrl);
  const wildcards = useWildcardsStore.getState();
  const missing = wildcards.status === 'error' || wildcards.status === 'unavailable';
  if (wildcards.baseUrl === baseUrl && missing) void wildcards.refresh(baseUrl);
  const notes = useModelNotesStore.getState();
  const noNotes = notes.status === 'error' || (notes.status === 'ready' && !notes.pysssss);
  if (notes.baseUrl === baseUrl && noNotes) void notes.refresh(baseUrl);
}

/**
 * 接続先へ実行状況の通知の口を張り、届いた通知を実行ストアと見張りへ配る。
 * 口が開いたら（ComfyUI の再起動・接続し直しの後を含む）、取れなかった一覧を取り直す。
 */
export function useComfySocket(baseUrl: string, clientId: string, enabled: boolean): void {
  const applyEvent = useExecutionStore((state) => state.applyEvent);
  const setSocketStatus = useConnectionStore((state) => state.setSocketStatus);
  const setSocketRetry = useConnectionStore((state) => state.setSocketRetry);
  const timeOutSocket = useConnectionStore((state) => state.timeOutSocket);
  const markUnknown = useExecutionStore((state) => state.markUnknown);
  const retryModels = useModelFilesStore((state) => state.retryFailed);
  const suspicion = useConnectionStore((state) => state.socketSuspicion);
  const socketRef = useRef<EventConnection | null>(null);

  useEffect(() => {
    if (!enabled || baseUrl.length === 0) return;

    let opened = false;
    // 張り直しで開いたときの全件取得は間を置く（落ちては上がる相手に全件を取り続けない）。
    // 最初の取り直しが全件なので、張った時点から数える
    let fullAt = Date.now();
    const socket = comfyPort().events.connect({
      baseUrl,
      clientId,
      onEvent: (event) => {
        applyEvent(event);
        // 会話から呼んだワークフローの完了の見張りなどへ配る
        emitComfyEvent(event);
      },
      onStatus: (status) => {
        setSocketStatus(status);
        if (status !== 'open') return;
        retryFailedLists(baseUrl, retryModels);
        // 張り直しで開いたときはキューを全件取り直す（再起動の後の履歴をまとめて出し、実行の記録の
        // 起動を決め直す）。最初に開いたときは取り直さない（最初の取り直しは元から全件読む）
        if (opened) {
          const full = Date.now() - fullAt >= FULL_REFRESH_GAP_MS;
          if (full) fullAt = Date.now();
          void useQueueStore.getState().refresh(baseUrl, full);
        }
        opened = true;
      },
      onRetry: setSocketRetry,
      reconnect: RECONNECT_POLICY,
      // 実行中・待機のものがある間の切れだけを数える。何もしていない間に切れても失うものは無い
      countsDrop: () => {
        const queue = useQueueStore.getState();
        const queued = queue.running.length + queue.pending.length;
        return hasRunInFlight(useExecutionStore.getState().status, queued);
      },
      // 諦めたら、動いているはずの実行を**実行中のまま残さない**（不明にする）
      onGiveUp: (reason) => {
        timeOutSocket(reason);
        markUnknown(timeoutMessage(reason));
      },
    });

    socketRef.current = socket;

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [
    baseUrl,
    clientId,
    enabled,
    applyEvent,
    setSocketStatus,
    setSocketRetry,
    timeOutSocket,
    markUnknown,
    retryModels,
  ]);

  // HTTP で応答が無いと分かったら、開いているつもりの口を閉じて張り直す
  useEffect(() => {
    if (suspicion > 0) socketRef.current?.suspect();
  }, [suspicion]);
}
