import { chatImageId } from '@/chat/chat-sources';
import { selectedCandidate } from '@/chat/edit';
import { expressionToolOf, takeExpressionCalls, withExpression } from '@/chat/expression-tool';
import type { Chat } from '@/chat/types';
import type { ToolDefinition } from '@/port/llm-port';
import { expressionLabelsOf } from '@/store/use-avatar-expressions-store';
import { nearestLabelOf } from '@/store/use-semantic-store';
import { useSettingsStore } from '@/store/use-settings-store';

function expressionPlanOf(
  chat: Chat,
): { readonly method: 'tool' | 'semantic'; readonly labels: string[] } | null {
  const { chatExpression, chatExpressionMethod } = useSettingsStore.getState();
  if (!chatExpression) return null;
  const labels = expressionLabelsOf(chatImageId(chat));
  return labels.length === 0 ? null : { method: chatExpressionMethod, labels };
}

export function expressionToolsFor(chat: Chat): ToolDefinition[] {
  const plan = expressionPlanOf(chat);
  return plan?.method === 'tool' ? [expressionToolOf(plan.labels)] : [];
}

export function settleExpressionCalls(sent: Chat, received: Chat): Chat {
  const plan = expressionPlanOf(sent);
  return plan?.method === 'tool' ? takeExpressionCalls(received, plan.labels) : received;
}

export function decideExpressionLater(
  chat: Chat,
  change: (update: (current: Chat) => Chat) => void,
): void {
  const plan = expressionPlanOf(chat);
  const last = chat.messages.at(-1);
  if (plan?.method !== 'semantic' || last?.role !== 'assistant') return;
  const candidate = selectedCandidate(last);
  if (candidate === undefined || candidate.end.kind !== 'done') return;
  const index = last.selected;
  void nearestLabelOf(candidate.content, plan.labels).then((label) => {
    if (label !== null) change((current) => withExpression(current, last.id, index, label));
  });
}
