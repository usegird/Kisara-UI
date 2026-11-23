import { useEffect } from 'react';

import { hasExpressions } from '@/chat/avatar-expression';
import { chatImageId } from '@/chat/chat-sources';
import { expressionToolOf } from '@/chat/expression-tool';
import type { Chat } from '@/chat/types';
import type { ToolDefinition } from '@/port/llm-port';
import { useAvatarExpressionsStore } from '@/store/use-avatar-expressions-store';
import { useSettingsStore } from '@/store/use-settings-store';

export function useExpressionTool(chat: Chat | undefined): ToolDefinition | null {
  const on = useSettingsStore((state) => state.chatExpression);
  const method = useSettingsStore((state) => state.chatExpressionMethod);
  const imageId = chat === undefined ? null : chatImageId(chat);
  const read = useAvatarExpressionsStore((state) =>
    imageId === null ? undefined : state.reads[imageId]?.read,
  );
  useEffect(() => {
    if (on && imageId !== null) useAvatarExpressionsStore.getState().ensure(imageId);
  }, [on, imageId]);
  if (!on || method !== 'tool' || read?.kind !== 'ok' || !hasExpressions(read.set)) return null;
  return expressionToolOf(read.set.items.map((item) => item.label));
}
