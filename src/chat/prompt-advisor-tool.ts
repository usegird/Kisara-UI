import {
  SENT_FIELD,
  usesCard,
  type AdvisorMessage,
  type AdvisorProposal,
  type AdvisorToolCall,
  type AdvisorUse,
} from '@/chat/prompt-advisor';
import { parseProposal, splitAdvisorText } from '@/chat/prompt-advisor-parse';
import type { ToolDefinition } from '@/port/llm-port';

export const ADVISOR_TOOL_NAME = 'propose_prompt_changes';

const PROMPT_TARGETS = ['main', 'item', 'newItem', 'removeItem', 'prefill'] as const;

export type AdvisorCallStatus = 'applied' | 'pending' | 'invalid';

export interface AdvisorCallProposal {
  readonly call: AdvisorToolCall;
  readonly proposal: AdvisorProposal | null;
}

export function advisorToolOf(use: AdvisorUse, outline: string | null): ToolDefinition {
  const card = usesCard(use);
  const targets = [
    ...PROMPT_TARGETS,
    ...(card ? ['card'] : []),
    ...(card || outline !== null ? ['dictionaryEntry'] : []),
  ];
  return {
    type: 'function',
    function: {
      name: ADVISOR_TOOL_NAME,
      description:
        'Propose changes to the prompt composition. The user reviews the proposal and applies ' +
        'it with a button; nothing changes until then. Use one call per proposal.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A short title of the proposal.' },
          changes: { type: 'array', items: changeSchema(targets, card) },
        },
        required: ['title', 'changes'],
      },
    },
  };
}

function changeSchema(targets: readonly string[], card: boolean): Record<string, unknown> {
  const text = (description: string): Record<string, string> => ({ type: 'string', description });
  return {
    type: 'object',
    properties: {
      target: { type: 'string', enum: targets },
      id: text('item and removeItem: the id of an existing item.'),
      name: text('newItem: the name of the new item.'),
      place: { type: 'string', enum: ['before', 'after'], description: 'newItem: section.' },
      content: text('The new text (not for removeItem). It replaces the whole text.'),
      ...(card
        ? { field: { type: 'string', enum: Object.values(SENT_FIELD), description: 'card.' } }
        : {}),
      dictionary: text('dictionaryEntry: the name of the individual dictionary.'),
      keywords: { type: 'array', items: { type: 'string' }, description: 'dictionaryEntry.' },
      constant: { type: 'boolean', description: 'dictionaryEntry: always sent.' },
      comment: text('dictionaryEntry: a short title of the entry.'),
      enabled: { type: 'boolean', description: 'dictionaryEntry: defaults to true.' },
    },
    required: ['target'],
  };
}

export function advisorCallProposals(
  calls: readonly AdvisorToolCall[] | undefined,
): AdvisorCallProposal[] {
  return (calls ?? [])
    .filter((call) => call.name === ADVISOR_TOOL_NAME)
    .map((call) => ({ call, proposal: parseProposal(call.arguments) }));
}

export function advisorCallKey(messageId: string, callId: string): string {
  return `${messageId}:call:${callId}`;
}

export function advisorCallStatus(call: AdvisorToolCall, applied: unknown): AdvisorCallStatus {
  if (parseProposal(call.arguments) === null) return 'invalid';
  return applied === undefined ? 'pending' : 'applied';
}

export function advisorCallResult(status: AdvisorCallStatus): string {
  switch (status) {
    case 'applied':
      return 'The user applied this proposal.';
    case 'pending':
      return 'Shown to the user as a proposal card. Not applied yet.';
    case 'invalid':
      return (
        'The arguments could not be read as a proposal, so nothing was shown. ' +
        `Call ${ADVISOR_TOOL_NAME} again with {"title", "changes"} as described.`
      );
  }
}

export type AdvisorRecordTarget = 'dictionary' | 'composition';

export function advisorRecordTargetOf(
  use: AdvisorUse,
  outline: string | null,
): AdvisorRecordTarget {
  return usesCard(use) || outline !== null ? 'dictionary' : 'composition';
}

export function lacksAdvisorProposal(
  message: Pick<AdvisorMessage, 'role' | 'content' | 'toolCalls'>,
): boolean {
  if (message.role !== 'assistant' || message.content.trim().length === 0) return false;
  if (advisorCallProposals(message.toolCalls).length > 0) return false;
  return splitAdvisorText(message.content).every((segment) => segment.kind === 'text');
}
