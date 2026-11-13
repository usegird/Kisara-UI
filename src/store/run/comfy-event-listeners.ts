import type { ComfyEvent } from '@/port/run';

// ─────────────────────────────
// 実行の通知を、実行のストアのほかに受け取りたい部分へ配る。WebSocket の口（use-comfy-socket）が
// 流し、受け取る側は読まれたときに自分で登録する（会話から呼んだワークフローの見張りは、初期 JS を
// 小さくするため会話のタブを開くまで読まない）。
// ─────────────────────────────

type Listener = (event: ComfyEvent) => void;

const listeners = new Set<Listener>();

/** 通知を受け取る。外す手続きを返す */
export function listenComfyEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 通知を、登録した受け手のすべてへ配る */
export function emitComfyEvent(event: ComfyEvent): void {
  for (const listener of listeners) listener(event);
}
