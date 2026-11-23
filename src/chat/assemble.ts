import { selectedCandidate } from '@/chat/edit';
import { applyMacros, NO_SOURCES, type PromptSources } from '@/chat/macros';
import { playbookText } from '@/chat/playbook-text';
import { inInsertOrder, roleOf } from '@/chat/prompt';
import { sendableArgumentsOf } from '@/chat/tool-arguments';
import { writesReply } from '@/chat/tool-calls';
import { toolResultText } from '@/chat/tool-results';
import type { Chat, ChatMessage, PromptComposition, PromptItem, PromptRole } from '@/chat/types';
import { clamp } from '@/lib/clamp';
import type { ChatRequestMessage, ToolCallRequest } from '@/port/llm-port';

interface PromptPart {
  readonly itemId: string | null;
  readonly role: PromptRole | 'tool';
  readonly content: string;
  readonly toolCalls?: readonly ToolCallRequest[] | undefined;
  readonly toolCallId?: string | undefined;
  readonly images?: readonly string[] | undefined;
}

export function summaryText(content: string): string {
  return `[Summary: ${content.trim()}]`;
}

export function summarizedCount(chat: Chat): number {
  const summary = chat.summary;
  if (summary === undefined || summary.content.trim().length === 0) return 0;
  const upTo = summary.upTo;
  return chat.messages.slice(0, -1).findIndex((message) => message.id === upTo) + 1;
}

export function droppableCount(chat: Chat): number {
  return Math.max(0, chat.messages.length - 1 - summarizedCount(chat) - 1);
}

export const SUMMARY_ID = ':summary';

function summaryParts(chat: Chat, sources: PromptSources): PromptPart[] {
  if (summarizedCount(chat) === 0) return [];
  const content = summaryText(applyMacros(chat.summary?.content ?? '', sources));
  return [{ itemId: SUMMARY_ID, role: 'system', content }];
}

export const PLAYBOOK_ID = ':playbook';

function playbookParts(sources: PromptSources): PromptPart[] {
  if (sources.playbook === undefined) return [];
  return [
    {
      itemId: PLAYBOOK_ID,
      role: 'system',
      content: applyMacros(playbookText(sources.playbook), sources),
    },
  ];
}

function historyParts(chat: Chat, sources: PromptSources, drop: number): PromptPart[] {
  const skip = summarizedCount(chat) + clamp(drop, 0, droppableCount(chat));
  return [
    ...chat.messages.slice(skip, -1).flatMap(messageParts(sources)),
    ...revisionParts(chat, sources),
    ...replyParts(chat, sources),
  ];
}

function replyParts(chat: Chat, sources: PromptSources): PromptPart[] {
  const last = chat.messages.at(-1);
  const receiving = last === undefined ? undefined : selectedCandidate(last);
  if (last?.role !== 'assistant' || receiving === undefined || !writesReply(receiving)) return [];
  const calls: ChatMessage = { ...last, candidates: [{ ...receiving, content: '' }], selected: 0 };
  return messageParts({ ...sources, toolHistory: true })(calls);
}

function revisionParts(chat: Chat, sources: PromptSources): PromptPart[] {
  const last = chat.messages.at(-1);
  const receiving = last === undefined ? undefined : selectedCandidate(last);
  const revision = receiving?.end.kind === 'streaming' ? receiving.revision : undefined;
  if (last?.role !== 'assistant' || revision === undefined) return [];
  const base = last.candidates[revision.base]?.content ?? '';
  return [
    ...(base.length === 0
      ? []
      : [{ itemId: null, role: 'assistant' as const, content: applyMacros(base, sources) }]),
    { itemId: null, role: 'user', content: applyMacros(revision.instruction, sources) },
  ];
}

function messageParts(sources: PromptSources): (message: ChatMessage) => PromptPart[] {
  return (message): PromptPart[] => {
    const candidate = selectedCandidate(message);
    const content = candidate?.content ?? '';
    const calls =
      message.role === 'assistant' && sources.toolHistory === true
        ? (candidate?.toolCalls ?? [])
        : [];
    const text = content.length === 0 ? '' : applyMacros(content, sources);
    const images = message.role === 'user' ? (candidate?.images ?? []) : [];
    if (calls.length === 0) {
      if (text.length === 0 && images.length === 0) return [];
      return [
        {
          itemId: null,
          role: message.role,
          content: text,
          ...(images.length > 0 ? { images } : {}),
        },
      ];
    }
    const toolCalls = calls.map((call): ToolCallRequest => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: sendableArgumentsOf(call.arguments) },
    }));
    return [
      { itemId: null, role: 'assistant', content: text, toolCalls },
      ...calls.map((call): PromptPart => ({
        itemId: null,
        role: 'tool',
        content: toolResultText(call.state),
        toolCallId: call.id,
      })),
    ];
  };
}

function outsideToolGroup(history: readonly PromptPart[], slot: number): number {
  let index = slot;
  while (index < history.length && history[index]?.role === 'tool') index += 1;
  return index;
}

function itemText(item: PromptItem, sources: PromptSources): string {
  const raw =
    item.marker === null
      ? (sources.overrideText?.(item.id, item.content) ?? item.content)
      : sources.markerText(item.marker);
  return raw.trim().length === 0 ? '' : applyMacros(raw, sources);
}

function depthOf(item: PromptItem): number {
  return item.position.kind === 'depth' ? item.position.depth : -1;
}

function insertDepthItems(
  history: readonly PromptPart[],
  items: readonly PromptItem[],
  sources: PromptSources,
): PromptPart[][] {
  const n = history.length;
  const slots: PromptPart[][] = Array.from({ length: n + 1 }, () => []);
  const depthItems = inInsertOrder(
    items.filter((item) => item.enabled && item.position.kind === 'depth'),
  );
  for (const item of depthItems) {
    const content = itemText(item, sources);
    if (content.length === 0) continue;
    const slot = outsideToolGroup(history, Math.max(0, n - depthOf(item)));
    slots[slot]?.push({ itemId: item.id, role: item.role, content });
  }
  return slots;
}

export function assembleParts(
  chat: Chat,
  composition: PromptComposition,
  sources: PromptSources = NO_SOURCES,
  drop = 0,
): PromptPart[] {
  const history = historyParts(chat, sources, drop);
  const slots = insertDepthItems(
    history,
    [...composition.items, ...(sources.extraItems ?? [])],
    sources,
  );
  const flat = (from: number, to: number): PromptPart[] =>
    history.slice(from, to).flatMap((part, index) => [part, ...(slots[from + index + 1] ?? [])]);

  const relative = composition.items.filter(
    (item) => item.enabled && item.position.kind === 'relative',
  );
  const inputMarker = relative.find((item) => item.marker === 'currentInput');
  const last = history.at(-1);
  const moveInput = inputMarker !== undefined && last?.role === 'user';
  const historyBlock = [
    ...playbookParts(sources),
    ...summaryParts(chat, sources),
    ...(slots[0] ?? []),
    ...flat(0, moveInput ? history.length - 1 : history.length),
  ];
  const inputBlock =
    moveInput && last !== undefined ? [last, ...(slots[history.length] ?? [])] : [];

  const parts = itemParts(relative, composition, sources, { historyBlock, inputBlock });
  const prefill = prefillText(composition, sources);
  if (prefill.length > 0) parts.push({ itemId: PREFILL_ID, role: 'assistant', content: prefill });
  return withSystemPrompt(parts, sources);
}

function itemParts(
  relative: readonly PromptItem[],
  composition: PromptComposition,
  sources: PromptSources,
  blocks: { readonly historyBlock: PromptPart[]; readonly inputBlock: PromptPart[] },
): PromptPart[] {
  const parts: PromptPart[] = [];
  let inputPlaced = false;
  for (const item of relative) {
    if (item.marker === 'chatHistory') parts.push(...blocks.historyBlock);
    else if (item.marker === 'currentInput') {
      if (!inputPlaced) parts.push(...blocks.inputBlock);
      inputPlaced = true;
    } else {
      const content = itemText(item, sources);
      const role = roleOf(composition.items, item);
      if (content.length > 0) parts.push({ itemId: item.id, role, content });
    }
  }
  return parts;
}

function withSystemPrompt(parts: PromptPart[], sources: PromptSources): PromptPart[] {
  const systemPrompt = sources.systemPrompt ?? '';
  const system = systemPrompt.trim().length > 0 ? applyMacros(systemPrompt, sources) : '';
  return system.length > 0
    ? [{ itemId: SYSTEM_PROMPT_ID, role: 'system', content: system }, ...parts]
    : parts;
}

export const SYSTEM_PROMPT_ID = ':system';

export const PREFILL_ID = ':prefill';

export function prefillText(composition: PromptComposition, sources: PromptSources): string {
  const { content } = composition.prefill;
  return content.length > 0 ? applyMacros(content, sources) : '';
}

function isToolPart(part: PromptPart): boolean {
  return part.role === 'tool' || part.toolCalls !== undefined;
}

function toMessage(
  part: PromptPart,
  content: string,
  images: readonly string[],
): ChatRequestMessage {
  if (part.role === 'tool') {
    return { role: 'tool', tool_call_id: part.toolCallId ?? '', content };
  }
  if (part.toolCalls !== undefined) {
    return {
      role: 'assistant',
      content: content.length > 0 ? content : null,
      tool_calls: part.toolCalls,
    };
  }
  if (images.length === 0) return { role: part.role, content };
  return {
    role: part.role,
    content: [
      ...(content.length > 0 ? [{ type: 'text', text: content } as const] : []),
      ...images.map((url) => ({ type: 'image_url', image_url: { url } }) as const),
    ],
  };
}

export function mergeParts(parts: readonly PromptPart[], squash = false): ChatRequestMessage[] {
  const merged: { part: PromptPart; content: string }[] = [];
  for (const part of parts) {
    const previous = merged.at(-1);
    const joinable =
      squash &&
      previous !== undefined &&
      previous.part.role === 'system' &&
      part.role === 'system' &&
      !isToolPart(previous.part) &&
      !isToolPart(part);
    if (joinable) previous.content = `${previous.content}\n${part.content}`;
    else merged.push({ part, content: part.content });
  }
  return merged.map(({ part, content }) => toMessage(part, content, part.images ?? []));
}
