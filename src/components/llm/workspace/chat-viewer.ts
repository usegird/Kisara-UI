import { useEffect } from 'react';

import { chatImageRuns } from '@/chat/tool-results';
import type { Chat } from '@/chat/types';
import type { OutputFileRef } from '@/port/files';
import type { QueueTask } from '@/queue/queue-tasks';
import { slideKey } from '@/queue/viewer-slides';
import { useChatStore } from '@/store/use-chat-store';
import { useViewerStore } from '@/store/use-viewer-store';

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

function tasksSignature(tasks: readonly QueueTask[]): string {
  return tasks.map((task) => `${task.promptId}:${String(task.outputs.length)}`).join('|');
}

export function openChatImage(chatId: string, runId: string, file: OutputFileRef): void {
  const chat = useChatStore.getState().chats[chatId];
  if (chat === undefined) return;
  useViewerStore.getState().openOverlay(slideKey(runId, file), chatViewerTasks(chat), chatId);
}

export function useChatViewerSync(chatId: string): void {
  useEffect(
    () =>
      useChatStore.subscribe((state, previous) => {
        const chat = state.chats[chatId];
        if (chat === undefined || chat === previous.chats[chatId]) return;
        const viewer = useViewerStore.getState();
        if (viewer.mode === 'closed' || viewer.owner !== chatId || viewer.tasks === null) return;
        const tasks = chatViewerTasks(chat);
        if (tasksSignature(tasks) !== tasksSignature(viewer.tasks)) viewer.setTasks(tasks);
      }),
    [chatId],
  );
}
