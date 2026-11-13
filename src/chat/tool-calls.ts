import type { Candidate, Chat, ChatMessage, ToolCallRecord, ToolCallState } from '@/chat/types';

// ─────────────────────────────
// ワークフローの呼び出しの列。どれも新しい会話を返し、変わらなければ同じ物を返す。
// ─────────────────────────────

/** 受け取った呼び出しの断片を足す。`index` で同じ呼び出しを指す */
export function addToolCallPart(
  calls: readonly ToolCallRecord[],
  part: {
    readonly index: number;
    readonly id: string;
    readonly name: string;
    readonly arguments: string;
  },
): ToolCallRecord[] {
  const next = [...calls];
  // 番号は窓口で受け取った順に詰めてある。並びの外の番号は末尾に足し、穴を作らない
  const at =
    Number.isInteger(part.index) && part.index >= 0 && part.index < next.length
      ? part.index
      : next.length;
  const current = next[at];
  next[at] =
    current === undefined
      ? { id: part.id, name: part.name, arguments: part.arguments, state: { kind: 'receiving' } }
      : {
          ...current,
          id: current.id.length > 0 ? current.id : part.id,
          name: current.name + part.name,
          arguments: current.arguments + part.arguments,
        };
  return next;
}

/**
 * 本文を書かせている候補か。受け取り中で、確かめ終えた呼び出しを持つ。ふつうの受け取りでは、
 * 呼び出しは受け取り終えるまで確かめないので当たらない
 */
export function writesReply(candidate: Candidate | undefined): boolean {
  return (
    candidate?.end.kind === 'streaming' &&
    (candidate.toolCalls ?? []).some((call) => call.state.kind !== 'receiving')
  );
}

/**
 * 本文を書かせられる候補か。受け取り終えて、呼び出しを持ち、本文が空
 */
export function canWriteReply(candidate: Candidate | undefined): boolean {
  return (
    candidate?.end.kind === 'done' &&
    (candidate.toolCalls ?? []).length > 0 &&
    candidate.content.trim().length === 0
  );
}

/** 呼び出しの id。返さないサーバーには候補の中の番号で作る */
export function callId(call: ToolCallRecord, index: number): string {
  return call.id.length > 0 ? call.id : `call_${String(index)}`;
}

/**
 * 受け取りを終えた候補の呼び出しを確かめる。受け取り中の呼び出しを `check` の結果にする。
 * 止めた・失敗した受け取りの呼び出しは本文が欠けているので外す
 */
export function settleReceivedCalls(
  candidate: Candidate,
  completed: boolean,
  check: (call: ToolCallRecord) => ToolCallState,
): Candidate {
  const calls = candidate.toolCalls;
  if (calls === undefined || calls.length === 0) return candidate;
  if (!completed) {
    const kept = calls.filter((call) => call.state.kind !== 'receiving');
    return kept.length === calls.length ? candidate : withCalls(candidate, kept);
  }
  return withCalls(
    candidate,
    calls.map((call, index) => {
      if (call.state.kind !== 'receiving') return call;
      const settled = { ...call, id: callId(call, index) };
      return { ...settled, state: check(settled) };
    }),
  );
}

function withCalls(candidate: Candidate, calls: readonly ToolCallRecord[]): Candidate {
  // 空になったら持たない（呼び出しの無い候補と同じに扱う）
  return { ...candidate, toolCalls: calls.length > 0 ? calls : undefined };
}

function selected(message: ChatMessage): Candidate | undefined {
  return message.candidates[message.selected];
}

/** その呼び出しの状態を変える。見つからなければ null */
export function setToolCallState(
  chat: Chat,
  messageId: string,
  callId: string,
  state: ToolCallState,
): Chat | null {
  return updateToolCall(chat, messageId, callId, (call) => ({ ...call, state }));
}

/**
 * 呼び出しを実行し直す。今の実行を前の実行の列の後ろへ移し、`args` の本文で
 * 承諾を待つ状態から始める。まだ承諾を待っている呼び出しは、引数の本文だけを差し替える
 * （まだ実行していないので前の実行に残さない）。見つからなければ null
 */
export function restartToolCall(
  chat: Chat,
  messageId: string,
  callId: string,
  args: string,
): Chat | null {
  return updateToolCall(chat, messageId, callId, (call) =>
    call.state.kind === 'waiting'
      ? { ...call, arguments: args }
      : {
          ...call,
          previousRuns: [
            ...(call.previousRuns ?? []),
            { arguments: call.arguments, state: call.state },
          ],
          arguments: args,
          state: { kind: 'waiting' },
        },
  );
}

/**
 * 選んだワークフローで作らせた呼び出し（「ワークフローを実行」）を、その発言の選んでいる候補の
 * 呼び出しの列の後ろへ足す。見つからなければ null
 */
export function appendToolCalls(
  chat: Chat,
  messageId: string,
  calls: readonly ToolCallRecord[],
): Chat | null {
  const index = chat.messages.findIndex((message) => message.id === messageId);
  const message = chat.messages[index];
  const candidate = message === undefined ? undefined : selected(message);
  if (message === undefined || candidate === undefined || calls.length === 0) return null;
  const candidates = [...message.candidates];
  candidates[message.selected] = {
    ...candidate,
    toolCalls: [...(candidate.toolCalls ?? []), ...calls],
  };
  const messages = [...chat.messages];
  messages[index] = { ...message, candidates };
  return { ...chat, messages };
}

function updateToolCall(
  chat: Chat,
  messageId: string,
  callId: string,
  update: (call: ToolCallRecord) => ToolCallRecord,
): Chat | null {
  const index = chat.messages.findIndex((message) => message.id === messageId);
  const message = chat.messages[index];
  if (message === undefined) return null;
  let found = false;
  const candidates = message.candidates.map((candidate) => {
    if (candidate.toolCalls === undefined) return candidate;
    const calls = candidate.toolCalls.map((call) => {
      if (call.id !== callId) return call;
      found = true;
      return update(call);
    });
    return found ? { ...candidate, toolCalls: calls } : candidate;
  });
  if (!found) return null;
  const messages = [...chat.messages];
  messages[index] = { ...message, candidates };
  return { ...chat, messages };
}

/** 最後のメッセージの選んでいる候補の呼び出し。無ければ空 */
export function lastToolCalls(chat: Chat): readonly ToolCallRecord[] {
  const last = chat.messages.at(-1);
  if (last?.role !== 'assistant') return [];
  return (last === undefined ? undefined : selected(last))?.toolCalls ?? [];
}

/**
 * 完了を待つ 1 件の呼び出しと、その場所
 */
export interface QueuedCall {
  readonly messageId: string;
  readonly callId: string;
  readonly promptId: string;
  /** 結果として渡す出力ノード。空ならすべて */
  readonly outputs: readonly string[];
}

/** 実行の id を持つ呼び出しの状態（完了を待つ・不明） */
export type PendingCallKind = 'queued' | 'unknown';

/** その種類の、実行の id を持つ状態なら返す。違えば null */
function pendingState(
  state: ToolCallState,
  kind: PendingCallKind,
): Extract<ToolCallState, { kind: PendingCallKind }> | null {
  return (state.kind === 'queued' || state.kind === 'unknown') && state.kind === kind
    ? state
    : null;
}

/** 会話の中の、完了を待つ（`kind` が `unknown` なら不明の）呼び出し（どの候補のものも） */
export function queuedToolCalls(chat: Chat, kind: PendingCallKind = 'queued'): QueuedCall[] {
  return chat.messages.flatMap((message) =>
    message.candidates.flatMap((candidate) =>
      (candidate.toolCalls ?? []).flatMap((call): QueuedCall[] => {
        const state = pendingState(call.state, kind);
        return state === null
          ? []
          : [
              {
                messageId: message.id,
                callId: call.id,
                promptId: state.promptId,
                outputs: state.outputs ?? [],
              },
            ];
      }),
    ),
  );
}

/** 実行を待っている（`kind` が `unknown` なら不明の）呼び出しの、実行の id から場所を引く */
export function findQueuedCall(
  chat: Chat,
  promptId: string,
  kind: PendingCallKind = 'queued',
): { readonly messageId: string; readonly call: ToolCallRecord } | null {
  for (const message of chat.messages) {
    for (const candidate of message.candidates) {
      for (const call of candidate.toolCalls ?? []) {
        if (pendingState(call.state, kind)?.promptId === promptId) {
          return { messageId: message.id, call };
        }
      }
    }
  }
  return null;
}
