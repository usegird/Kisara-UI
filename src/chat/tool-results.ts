import { selectedCandidate } from '@/chat/edit';
import type { Chat, ToolCallRecord, ToolCallRun, ToolCallState } from '@/chat/types';
import type { OutputFileRef } from '@/port/files';

export function toolCallRuns(call: ToolCallRecord): readonly ToolCallRun[] {
  return [...(call.previousRuns ?? []), { arguments: call.arguments, state: call.state }];
}

export function toolResultText(state: ToolCallState): string {
  switch (state.kind) {
    case 'waiting':
      return JSON.stringify({
        status: 'awaiting_user',
        note: 'The user decides whether to run it.',
      });
    case 'queued':
      return JSON.stringify({
        status: 'queued',
        prompt_id: state.promptId,
        note: 'Accepted. It runs on its own and the user sees the result.',
      });
    case 'done':
      return JSON.stringify(
        state.images.length === 0
          ? { status: 'completed' }
          : { status: 'completed', images: state.images.map(imageReferenceOf) },
      );
    case 'declined':
      return JSON.stringify({ status: 'declined', note: 'The user declined to run it.' });
    case 'failed':
      return JSON.stringify({ status: 'failed', error: state.message });
    case 'unknown':
      return JSON.stringify({ status: 'unknown', note: 'The result could not be confirmed.' });
    case 'invalid':
      return JSON.stringify({ status: 'invalid', error: problemText(state.problem) });
    default:
      return JSON.stringify({ status: 'pending' });
  }
}

function problemText(problem: Extract<ToolCallState, { kind: 'invalid' }>['problem']): string {
  switch (problem.code) {
    case 'unknown-tool':
      return 'No workflow has this name.';
    case 'json':
      return 'Arguments are not a JSON object.';
    case 'missing':
      return `Missing argument: ${problem.argument}`;
    case 'unknown':
      return `Unknown argument: ${problem.argument}`;
    case 'type':
      return `Wrong type: ${problem.argument}`;
    case 'range':
      return `Out of range: ${problem.argument}`;
    case 'choice':
      return `Not one of the allowed values: ${problem.argument}`;
  }
}

export const RECEIVED_IMAGE_LIMIT = 20;

export function imageReferenceOf(file: OutputFileRef): string {
  return [file.type, file.subfolder, file.filename].filter((part) => part.length > 0).join('/');
}

interface ReceivedImage {
  readonly reference: string;
  readonly file: OutputFileRef;
}

export function receivedImages(chat: Chat): ReceivedImage[] {
  const byReference = new Map<string, ReceivedImage>();
  for (const message of chat.messages) {
    for (const call of message.candidates[message.selected]?.toolCalls ?? []) {
      if (call.state.kind !== 'done') continue;
      for (const file of call.state.images) {
        const reference = imageReferenceOf(file);
        byReference.delete(reference);
        byReference.set(reference, { reference, file });
      }
    }
  }
  return [...byReference.values()].slice(-RECEIVED_IMAGE_LIMIT);
}

export function imageRunId(messageId: string, callId: string, run: number): string {
  return `${messageId}:${callId}:${String(run)}`;
}

interface ImageRun {
  readonly id: string;
  readonly images: readonly OutputFileRef[];
}

export function chatImageRuns(chat: Chat): ImageRun[] {
  const result: ImageRun[] = [];
  for (const message of [...chat.messages].reverse()) {
    for (const call of selectedCandidate(message)?.toolCalls ?? []) {
      const runs = toolCallRuns(call);
      for (let run = runs.length - 1; run >= 0; run -= 1) {
        const state = runs[run]?.state;
        if (state?.kind !== 'done' || state.images.length === 0) continue;
        result.push({ id: imageRunId(message.id, call.id, run), images: state.images });
      }
    }
  }
  return result;
}
