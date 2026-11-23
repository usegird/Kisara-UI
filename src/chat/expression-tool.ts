import { replaceLast, selectedCandidate, withCandidate } from '@/chat/edit';
import type { Chat, ChatExpressionChoice, ChatMessage } from '@/chat/types';
import { isRecord } from '@/lib/guards';
import type { ToolDefinition } from '@/port/llm-port';

export const EXPRESSION_TOOL_NAME = 'set_expression';

const EXPRESSION_TOOL_DESCRIPTION =
  "Set the character's facial expression shown beside your reply. " +
  'Choose the label that best fits the reply. It returns nothing to you; ' +
  'always write your full reply as text in the same response as the call.';

const LABEL_DESCRIPTION = 'One of the listed expression labels.';

export function expressionToolOf(labels: readonly string[]): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: EXPRESSION_TOOL_NAME,
      description: EXPRESSION_TOOL_DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', enum: [...labels], description: LABEL_DESCRIPTION },
        },
        required: ['label'],
        additionalProperties: false,
      },
    },
  };
}

export function takeExpressionCalls(chat: Chat, labels: readonly string[]): Chat {
  const last = chat.messages.at(-1);
  const candidate = last === undefined ? undefined : selectedCandidate(last);
  const calls = candidate?.toolCalls ?? [];
  if (last?.role !== 'assistant' || candidate === undefined) return chat;
  if (!calls.some((call) => call.name === EXPRESSION_TOOL_NAME)) return chat;
  const label = calls
    .filter((call) => call.name === EXPRESSION_TOOL_NAME)
    .map((call) => labelOf(call.arguments))
    .filter((found) => found !== null && labels.includes(found))
    .at(-1);
  const rest = calls.filter((call) => call.name !== EXPRESSION_TOOL_NAME);
  return replaceLast(chat, (message) =>
    withCandidate(message, {
      ...candidate,
      toolCalls: rest.length > 0 ? rest : undefined,
      ...(label === undefined || label === null ? {} : { expression: label }),
    }),
  );
}

export function withExpression(chat: Chat, messageId: string, index: number, label: string): Chat {
  let changed = false;
  const messages = chat.messages.map((message) => {
    const candidate = message.candidates[index];
    if (message.id !== messageId || candidate === undefined) return message;
    changed = true;
    const candidates = [...message.candidates];
    candidates[index] = { ...candidate, expression: label };
    return { ...message, candidates };
  });
  return changed ? { ...chat, messages } : chat;
}

export function shownExpressionOf(
  messages: readonly ChatMessage[],
  choice: ChatExpressionChoice | undefined,
  switching: boolean,
): string | null {
  if (!switching) return choice?.label ?? null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') continue;
    if (choice !== undefined && message.id === choice.after) return choice.label;
    const label = selectedCandidate(message)?.expression;
    if (label !== undefined) return label;
  }
  return choice?.label ?? null;
}

export function expressionChoiceOf(
  messages: readonly ChatMessage[],
  label: string,
): ChatExpressionChoice {
  const last = messages.findLast((message) => message.role === 'assistant');
  return { label, after: last?.id ?? null };
}

function labelOf(text: string): string | null {
  try {
    const raw: unknown = JSON.parse(text);
    return isRecord(raw) && typeof raw.label === 'string' ? raw.label : null;
  } catch {
    return null;
  }
}

export type ExpressionMethod = 'tool' | 'semantic';

export function normalizeExpressionMethod(raw: unknown): ExpressionMethod {
  return raw === 'semantic' ? 'semantic' : 'tool';
}
