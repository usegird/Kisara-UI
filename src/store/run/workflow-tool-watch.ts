import {
  findQueuedCall,
  queuedToolCalls,
  type PendingCallKind,
  type QueuedCall,
} from '@/chat/tool-calls';
import { passesOutput } from '@/graph/workflow-tool';
import { t } from '@/i18n';
import type { OutputFileRef } from '@/port/files';
import type { ComfyEvent } from '@/port/run';
import { formatHistoryFailure, formatRunError } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { listenComfyEvents } from '@/store/run/comfy-event-listeners';
import { useChatStore } from '@/store/use-chat-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { queueIds, useQueueStore } from '@/store/use-queue-store';
import { useSettingsStore } from '@/store/use-settings-store';

interface Watched {
  readonly chatId: string;
  readonly messageId: string;
  readonly callId: string;
  readonly outputs: readonly string[];
  readonly files: OutputFileRef[];
  recovered?: true;
}

export const watching = new Map<string, Watched>();

function settle(promptId: string, update: (watched: Watched) => void): void {
  const watched = watching.get(promptId);
  if (watched === undefined) return;
  watching.delete(promptId);
  const chat = useChatStore.getState().chats[watched.chatId];
  if (chat === undefined || findQueuedCall(chat, promptId) === null) return;
  update(watched);
}

function collectOutput(promptId: string, event: Extract<ComfyEvent, { type: 'executed' }>): void {
  const watched = watching.get(promptId);
  if (watched === undefined || event.node === null) return;
  if (passesOutput(watched.outputs, event.node)) watched.files.push(...event.files);
}

export function observeToolRun(event: ComfyEvent): void {
  if (event.type === 'unknown' || event.type === 'status' || event.type === 'manager_queue') {
    return;
  }
  const promptId = event.promptId;
  if (promptId === null || !watching.has(promptId)) return;
  if (watching.get(promptId)?.recovered === true) return;
  const setState = useChatStore.getState().setToolCall;
  switch (event.type) {
    case 'executed':
      collectOutput(promptId, event);
      return;
    case 'executing':
      if (event.node !== null) return;
      break;
    case 'execution_success':
      break;
    case 'execution_error':
      settle(promptId, (w) =>
        setState(w.chatId, w.messageId, w.callId, {
          kind: 'failed',
          message: formatRunError(event.message),
        }),
      );
      return;
    case 'execution_interrupted':
      settle(promptId, (w) =>
        setState(w.chatId, w.messageId, w.callId, {
          kind: 'failed',
          message: t('llm.tool.interrupted'),
        }),
      );
      return;
    default:
      return;
  }
  settle(promptId, (w) =>
    setState(w.chatId, w.messageId, w.callId, {
      kind: 'done',
      images: w.files,
    }),
  );
}

const resolving = new Set<string>();

async function resolveFromHistory(
  baseUrl: string,
  chatId: string,
  queued: QueuedCall,
  kind: PendingCallKind = 'queued',
): Promise<void> {
  const { promptId } = queued;
  const detail = await comfyPort()
    .queue.fetchHistoryItem(baseUrl, promptId)
    .catch(() => undefined);
  if (detail === undefined) return;
  watching.delete(promptId);
  const chat = useChatStore.getState().chats[chatId];
  if (chat === undefined || findQueuedCall(chat, promptId, kind) === null) return;
  const setState = useChatStore.getState().setToolCall;
  const { messageId, callId, outputs } = queued;
  if (detail === null) {
    if (kind === 'unknown') return;
    setState(chatId, messageId, callId, {
      kind: 'unknown',
      promptId,
      ...(outputs.length === 0 ? {} : { outputs }),
    });
  } else if (detail.success === false) {
    setState(chatId, messageId, callId, {
      kind: 'failed',
      message: formatHistoryFailure(detail.error) ?? '',
    });
  } else {
    const images = Object.entries(detail.nodeOutputs).flatMap(([node, files]) =>
      passesOutput(queued.outputs, node) ? files : [],
    );
    setState(chatId, messageId, callId, { kind: 'done', images });
  }
}

function reconcileQueuedCalls(): void {
  if (useConnectionStore.getState().status !== 'connected') return;
  const queue = useQueueStore.getState();
  const baseUrl = useSettingsStore.getState().baseUrl;
  if (queue.fetchedAt === null || baseUrl.length === 0) return;
  const live = new Set(queueIds(queue));
  for (const [chatId, chat] of Object.entries(useChatStore.getState().chats)) {
    for (const queued of queuedToolCalls(chat)) {
      const { promptId } = queued;
      const watched = watching.get(promptId);
      if (watched !== undefined && watched.recovered !== true) continue;
      if (live.has(promptId)) {
        if (watched === undefined) {
          const { messageId, callId, outputs } = queued;
          watching.set(promptId, {
            chatId,
            messageId,
            callId,
            outputs,
            files: [],
            recovered: true,
          });
        }
        continue;
      }
      if (resolving.has(promptId)) continue;
      resolving.add(promptId);
      void resolveFromHistory(baseUrl, chatId, queued).finally(() => resolving.delete(promptId));
    }
  }
}

export function startToolRunWatch(): void {
  listenComfyEvents(observeToolRun);
  useQueueStore.subscribe((state, previous) => {
    if (state.fetchedAt !== previous.fetchedAt) reconcileQueuedCalls();
  });
  useChatStore.subscribe((state) => {
    const ids = Object.keys(state.chats).join(' ');
    if (ids === chatIds) return;
    chatIds = ids;
    reconcileQueuedCalls();
  });
  useConnectionStore.subscribe((state, previous) => {
    if (previous.status === 'connected' && state.status !== 'connected') {
      for (const watched of watching.values()) watched.recovered = true;
    }
    if (previous.status !== 'connected' && state.status === 'connected') recheckUnknownCalls();
  });
  reconcileQueuedCalls();
}

let chatIds = '';

function recheckUnknownCalls(): void {
  const baseUrl = useSettingsStore.getState().baseUrl;
  if (baseUrl.length === 0) return;
  for (const [chatId, chat] of Object.entries(useChatStore.getState().chats)) {
    for (const unknown of queuedToolCalls(chat, 'unknown')) {
      const { promptId } = unknown;
      if (resolving.has(promptId)) continue;
      resolving.add(promptId);
      void resolveFromHistory(baseUrl, chatId, unknown, 'unknown').finally(() =>
        resolving.delete(promptId),
      );
    }
  }
}
