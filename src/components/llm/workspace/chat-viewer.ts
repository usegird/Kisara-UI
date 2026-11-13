import { useEffect } from 'react';

import { chatImageRuns } from '@/chat/tool-results';
import type { Chat } from '@/chat/types';
import type { OutputFileRef } from '@/port/files';
import type { QueueTask } from '@/queue/queue-tasks';
import { slideKey } from '@/queue/viewer-slides';
import { useChatStore } from '@/store/use-chat-store';
import { useViewerStore } from '@/store/use-viewer-store';

// ─────────────────────────────
// 会話の画像を画像のビューワーで見る。並びの 1 件は呼び出しの 1 回の実行で、キューのタスクと同じ形に
// して渡す（実行の id の代わりに `runId`）。
// ─────────────────────────────

/** その会話の画像の並び（新しい実行が先） */
function chatViewerTasks(chat: Chat): QueueTask[] {
  return chatImageRuns(chat).map((run) => ({
    promptId: run.id,
    state: 'done',
    number: null,
    outputs: run.images,
    progress: null,
    durationMs: null,
    message: null,
    startedAt: null,
  }));
}

/** 並びの見分け（実行の id と画像の数）。同じなら並びを差し替えない */
function tasksSignature(tasks: readonly QueueTask[]): string {
  return tasks.map((task) => `${task.promptId}:${String(task.outputs.length)}`).join('|');
}

/** 画像のビューワーを、その会話の画像の並びで開く */
export function openChatImage(chatId: string, runId: string, file: OutputFileRef): void {
  const chat = useChatStore.getState().chats[chatId];
  if (chat === undefined) return;
  useViewerStore.getState().openOverlay(slideKey(runId, file), chatViewerTasks(chat), chatId);
}

/**
 * その会話の画像で開いているビューワーの並びを、会話の画像が増えるたびに取り直す。会話のストアを
 * 見張るだけで、この部品は描き直さない（受け取り中に語ごとに描き直さない）
 */
export function useChatViewerSync(chatId: string): void {
  useEffect(
    () =>
      useChatStore.subscribe((state, previous) => {
        const chat = state.chats[chatId];
        if (chat === undefined || chat === previous.chats[chatId]) return;
        const viewer = useViewerStore.getState();
        // 重ねていても別窓でも取り直す（どちらも同じ並びを見る）
        if (viewer.mode === 'closed' || viewer.owner !== chatId || viewer.tasks === null) return;
        const tasks = chatViewerTasks(chat);
        if (tasksSignature(tasks) !== tasksSignature(viewer.tasks)) viewer.setTasks(tasks);
      }),
    [chatId],
  );
}
