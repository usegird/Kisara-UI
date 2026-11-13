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

// ─────────────────────────────
// 会話から呼んだワークフローの完了の見張りと拾い直し。完了は実行の通知で知り、見張りはこの画面を
// 開いている間だけ持つ（残さない）。投入し直さない。
// ─────────────────────────────

interface Watched {
  readonly chatId: string;
  readonly messageId: string;
  readonly callId: string;
  /** 結果として渡す画像を出すノード。空ならすべて */
  readonly outputs: readonly string[];
  readonly files: OutputFileRef[];
  /**
   * 通知を逃したかもしれない（読み込み直す前に投入した・接続が切れた）。通知では決めず、キューから
   * 外れたら履歴で決める
   */
  recovered?: true;
}

/** 実行の id → 待っている呼び出し */
export const watching = new Map<string, Watched>();

/** 待っている呼び出しの状態を変える。会話を閉じていれば何もしない（完了待ちのまま残る） */
function settle(promptId: string, update: (watched: Watched) => void): void {
  const watched = watching.get(promptId);
  if (watched === undefined) return;
  watching.delete(promptId);
  const chat = useChatStore.getState().chats[watched.chatId];
  if (chat === undefined || findQueuedCall(chat, promptId) === null) return;
  update(watched);
}

/**
 * 選んだ出力ノードが出した画像だけを集める
 */
function collectOutput(promptId: string, event: Extract<ComfyEvent, { type: 'executed' }>): void {
  const watched = watching.get(promptId);
  if (watched === undefined || event.node === null) return;
  if (passesOutput(watched.outputs, event.node)) watched.files.push(...event.files);
}

/**
 * 実行の通知を見る（use-comfy-socket から）
 */
export function observeToolRun(event: ComfyEvent): void {
  if (event.type === 'unknown' || event.type === 'status') return;
  const promptId = event.promptId;
  if (promptId === null || !watching.has(promptId)) return;
  // 拾い直している実行は、途中の通知が欠けているので履歴で決める
  if (watching.get(promptId)?.recovered === true) return;
  const setState = useChatStore.getState().setToolCall;
  switch (event.type) {
    case 'executed':
      collectOutput(promptId, event);
      return;
    case 'executing':
      // node が null なら完了（正式な通知は execution_success。互換のため両方受ける）
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

// ─────────────────────────────
// 拾い直し。完了を待つ呼び出しのうち、この画面が通知を見張って
// いないものを、ComfyUI のキューと履歴に照らす。投入し直さない
// ─────────────────────────────

/** 履歴を読んでいる実行の id（重ねて読まない） */
const resolving = new Set<string>();

/**
 * 履歴の 1 件で呼び出しの結果を決める。読めなければ今の状態のまま（次に取り直したときに読む）。
 * 履歴にも無ければ不明にする（不明のものは不明のまま。前へしか進めない）
 */
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

/**
 * 読んである会話の、完了を待つ呼び出しを照らす。接続していてキューを一度でも取れているときだけ。
 * キューにあれば外れるまで待ち、無ければ履歴を読む。この画面が見張っている実行は通知に任せる
 */
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

/**
 * 通知とストアの見張りを始める。呼び出しの受け手を渡した後に 1 回だけ呼ぶ
 */
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
    // 切れている間の通知は届かないので、見張っている実行はすべて拾い直しに回す
    if (previous.status === 'connected' && state.status !== 'connected') {
      for (const watched of watching.values()) watched.recovered = true;
    }
    if (previous.status !== 'connected' && state.status === 'connected') recheckUnknownCalls();
  });
  reconcileQueuedCalls();
}

/** 会話の顔ぶれ（会話を読んだ・閉じたときだけ照らし直す。発言の受け取りごとには照らさない） */
let chatIds = '';

/**
 * 不明の呼び出しを、履歴で 1 回だけ決め直す。**接続したときだけ**呼ぶ（取り直しのたびに読むと、
 * 不明が溜まるほど問い合わせが増える）
 */
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
