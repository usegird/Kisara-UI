import { selectedCandidate } from '@/chat/edit';
import type { Chat, ToolCallRecord, ToolCallRun, ToolCallState } from '@/chat/types';
import type { OutputFileRef } from '@/port/files';

// ─────────────────────────────
// 呼び出しの結果の読み方。LLM に返す本文と、受け取った画像・会話の画像の並び。
// ─────────────────────────────

/** 呼び出しの実行の列（古い順。最後が今の実行） */
export function toolCallRuns(call: ToolCallRecord): readonly ToolCallRun[] {
  return [...(call.previousRuns ?? []), { arguments: call.arguments, state: call.state }];
}

/**
 * LLM に返す結果の本文を作る。状態だけを JSON で返し、画像は返さない
 */
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
      // 受け取った画像は参照名で返す（次の呼び出しの画像の引数に選べる）
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

/** LLM に選ばせる受け取った画像の数の上限（新しいものから） */
export const RECEIVED_IMAGE_LIMIT = 20;

/** 受け取った画像の参照名。置き場・サブフォルダ・名前を `/` でつなぐ（`output/a.png`） */
export function imageReferenceOf(file: OutputFileRef): string {
  return [file.type, file.subfolder, file.filename].filter((part) => part.length > 0).join('/');
}

/** 受け取った画像 1 枚と、LLM に見せる参照名 */
interface ReceivedImage {
  readonly reference: string;
  readonly file: OutputFileRef;
}

/**
 * 会話で受け取った画像（選んだ候補の、完了した呼び出しの出力）。古い順で、同じ参照名は新しい方に
 * まとめ、新しいものから上限まで
 */
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

/** 呼び出しの 1 回の実行を指す id（発言・呼び出し・実行の番号） */
export function imageRunId(messageId: string, callId: string, run: number): string {
  return `${messageId}:${callId}:${String(run)}`;
}

/** 呼び出しの 1 回の実行と、それが出した画像 */
interface ImageRun {
  readonly id: string;
  readonly images: readonly OutputFileRef[];
}

/**
 * 会話の呼び出しが出した画像を、実行ごとに新しいものから並べる（新しい発言・新しい実行が先）。
 * 発言は選んでいる候補だけ。画像の無い実行は入れない
 */
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
