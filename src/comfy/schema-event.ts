import { parseOutputFiles } from '@/comfy/schema';
import { finiteNumber, isRecord, isUnknownArray, stringOr } from '@/lib/guards';
import type { ComfyEvent, ProgressNode, ProgressNodeState } from '@/port/run';

// ─────────────────────────────
// WebSocket の通知の検証。`unknown` で受けて必要な形だけ確認し、`as` で型に押し込まない。
// ─────────────────────────────

/**
 * WebSocket の1メッセージを解釈する。
 * バイナリフレーム（プレビュー画像）は対象外で null を返す。
 * 実機での受信は未検証なので、想定外の型は捨てずに 'unknown' として通し、呼び出し側が握り潰さないようにする。
 */
export function parseComfyEvent(raw: unknown): ComfyEvent | null {
  if (typeof raw !== 'string') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const type = stringOr(parsed.type, null);
  if (type === null) return null;

  return toComfyEvent(type, isRecord(parsed.data) ? parsed.data : {});
}

/** 種別ごとに、通知の中身（`data`）を型付きの通知にする。知らない種別は 'unknown' */
function toComfyEvent(type: string, data: Record<string, unknown>): ComfyEvent {
  const promptId = stringOr(data.prompt_id, null);

  switch (type) {
    case 'status':
      return statusEvent(data);

    case 'execution_start':
      return { type: 'execution_start', promptId };

    case 'execution_cached':
      return cachedEvent(data, promptId);

    case 'executing':
      // node が null なら実行完了を表す（正式な完了通知は execution_success）
      return {
        type: 'executing',
        promptId,
        node: stringOr(data.node, null),
        displayNode: stringOr(data.display_node, null),
      };

    case 'execution_success':
      return { type: 'execution_success', promptId };

    case 'execution_interrupted':
      return { type: 'execution_interrupted', promptId, node: stringOr(data.node_id, null) };

    case 'progress_state':
      return { type: 'progress_state', promptId, nodes: parseProgressNodes(data.nodes) };

    case 'progress':
      return progressEvent(data, promptId);

    case 'executed':
      return {
        type: 'executed',
        promptId,
        node: stringOr(data.node, null),
        files: parseOutputFiles(data.output),
      };

    case 'execution_error':
      return errorEvent(data, promptId);

    default:
      return { type: 'unknown', rawType: type };
  }
}

function statusEvent(data: Record<string, unknown>): ComfyEvent {
  const status = isRecord(data.status) ? data.status : {};
  const execInfo = isRecord(status.exec_info) ? status.exec_info : {};
  return { type: 'status', queueRemaining: finiteNumber(execInfo.queue_remaining) };
}

function cachedEvent(data: Record<string, unknown>, promptId: string | null): ComfyEvent {
  const nodes = isUnknownArray(data.nodes)
    ? data.nodes.filter((node): node is string => typeof node === 'string')
    : [];
  return { type: 'execution_cached', promptId, nodes };
}

function progressEvent(data: Record<string, unknown>, promptId: string | null): ComfyEvent {
  const value = finiteNumber(data.value);
  const max = finiteNumber(data.max);
  if (value === null || max === null) return { type: 'unknown', rawType: 'progress' };
  return { type: 'progress', promptId, node: stringOr(data.node, null), value, max };
}

function errorEvent(data: Record<string, unknown>, promptId: string | null): ComfyEvent {
  return {
    type: 'execution_error',
    promptId,
    node: stringOr(data.node_id, null) ?? stringOr(data.node, null),
    message: stringOr(data.exception_message, null) ?? stringOr(data.exception_type, null),
  };
}

function parseProgressNodes(raw: unknown): ProgressNode[] {
  if (!isRecord(raw)) return [];

  const nodes: ProgressNode[] = [];
  for (const [key, entry] of Object.entries(raw)) {
    if (!isRecord(entry)) continue;

    const value = finiteNumber(entry.value);
    const max = finiteNumber(entry.max);
    const state = stringOr(entry.state, null);
    if (value === null || max === null) continue;

    nodes.push({
      nodeId: stringOr(entry.node_id, key),
      displayNodeId: stringOr(entry.display_node_id, null) ?? stringOr(entry.node_id, key),
      value,
      max,
      state: isProgressState(state) ? state : 'running',
    });
  }
  return nodes;
}

function isProgressState(value: string | null): value is ProgressNodeState {
  return value === 'pending' || value === 'running' || value === 'finished' || value === 'error';
}
