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
import { useNodePacksStore } from '@/store/use-node-packs-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useStylesStore } from '@/store/use-styles-store';
import { useTagsStore } from '@/store/use-tags-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

export const FULL_REFRESH_GAP_MS = 60_000;

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
    let fullAt = Date.now();
    const socket = comfyPort().events.connect({
      baseUrl,
      clientId,
      onEvent: (event) => {
        if (event.type === 'manager_queue') {
          useNodePacksStore.getState().applyQueueStatus(event);
          return;
        }
        applyEvent(event);
        emitComfyEvent(event);
      },
      onStatus: (status) => {
        setSocketStatus(status);
        if (status !== 'open') return;
        retryFailedLists(baseUrl, retryModels);
        if (opened) {
          const full = Date.now() - fullAt >= FULL_REFRESH_GAP_MS;
          if (full) fullAt = Date.now();
          void useQueueStore.getState().refresh(baseUrl, full);
        }
        opened = true;
      },
      onRetry: setSocketRetry,
      reconnect: RECONNECT_POLICY,
      countsDrop: () => {
        const queue = useQueueStore.getState();
        const queued = queue.running.length + queue.pending.length;
        return hasRunInFlight(useExecutionStore.getState().status, queued);
      },
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

  useEffect(() => {
    if (suspicion > 0) socketRef.current?.suspect();
  }, [suspicion]);
}
