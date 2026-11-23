import type { Candidate, Chat, ChatMessage, ToolCallRecord, ToolCallState } from '@/chat/types';

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

export function writesReply(candidate: Candidate | undefined): boolean {
  return (
    candidate?.end.kind === 'streaming' &&
    (candidate.toolCalls ?? []).some((call) => call.state.kind !== 'receiving')
  );
}

export function canWriteReply(candidate: Candidate | undefined): boolean {
  return (
    candidate?.end.kind === 'done' &&
    (candidate.toolCalls ?? []).length > 0 &&
    candidate.content.trim().length === 0
  );
}

export function callId(call: ToolCallRecord, index: number): string {
  return call.id.length > 0 ? call.id : `call_${String(index)}`;
}

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
  return { ...candidate, toolCalls: calls.length > 0 ? calls : undefined };
}

function selected(message: ChatMessage): Candidate | undefined {
  return message.candidates[message.selected];
}

export function setToolCallState(
  chat: Chat,
  messageId: string,
  callId: string,
  state: ToolCallState,
): Chat | null {
  return updateToolCall(chat, messageId, callId, (call) => ({ ...call, state }));
}

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

export function lastToolCalls(chat: Chat): readonly ToolCallRecord[] {
  const last = chat.messages.at(-1);
  if (last?.role !== 'assistant') return [];
  return (last === undefined ? undefined : selected(last))?.toolCalls ?? [];
}

export interface QueuedCall {
  readonly messageId: string;
  readonly callId: string;
  readonly promptId: string;
  readonly outputs: readonly string[];
}

export type PendingCallKind = 'queued' | 'unknown';

function pendingState(
  state: ToolCallState,
  kind: PendingCallKind,
): Extract<ToolCallState, { kind: PendingCallKind }> | null {
  return (state.kind === 'queued' || state.kind === 'unknown') && state.kind === kind
    ? state
    : null;
}

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
