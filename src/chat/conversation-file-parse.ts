import { parseCandidate, parseSummary } from '@/chat/candidate-parse';
import { parseCharacterFields } from '@/chat/card';
import { MS_PER_SECOND } from '@/chat/conversation-file';
import { refsOf } from '@/chat/file';
import { parseChatPlaybook, parseInstruction } from '@/chat/playbook-parse';
import { parseComposition, parsePersona, parseUnitLink } from '@/chat/prompt-parse';
import { settleInterrupted } from '@/chat/stream-receive';
import {
  defaultComposition,
  type Candidate,
  type Chat,
  type ChatMessage,
  type PromptComposition,
} from '@/chat/types';
import { finiteNumber, isRecord, isUnknownArray } from '@/lib/guards';

export interface ParsedChats {
  readonly chats: readonly Chat[];
  readonly skipped: number;
  readonly dropped: number;
}

function messageText(message: Record<string, unknown>): string | null {
  const content = message.content;
  if (!isRecord(content)) return null;
  if (content.content_type !== 'text' && content.content_type !== 'multimodal_text') return null;
  if (!isUnknownArray(content.parts)) return null;
  const parts = content.parts.filter((part): part is string => typeof part === 'string');
  if (parts.length === 0) return null;
  return parts.join('\n');
}

function roleOf(message: Record<string, unknown>): string | null {
  const author = message.author;
  return isRecord(author) && typeof author.role === 'string' ? author.role : null;
}

function hidden(message: Record<string, unknown>): boolean {
  const metadata = message.metadata;
  return isRecord(metadata) && metadata.is_visually_hidden_from_conversation === true;
}

function kisaraOf(message: Record<string, unknown>): Record<string, unknown> | null {
  const metadata = message.metadata;
  return isRecord(metadata) && isRecord(metadata.kisara) ? metadata.kisara : null;
}

function candidateOf(message: Record<string, unknown>): Candidate | null {
  const text = messageText(message);
  if (text === null) return null;
  const kisara = kisaraOf(message);
  return parseCandidate({
    content: text,
    reasoning: kisara?.reasoning,
    end: kisara?.end,
    usage: kisara?.usage,
    toolCalls: kisara?.toolCalls,
    timing: kisara?.timing,
    billing: kisara?.billing,
    citations: kisara?.citations,
    sentEstimate: kisara?.sentEstimate,
    trimmed: kisara?.trimmed,
    images: kisara?.images,
  });
}

function nodeOf(mapping: Record<string, unknown>, id: unknown): Record<string, unknown> | null {
  if (typeof id !== 'string') return null;
  const node = mapping[id];
  return isRecord(node) ? node : null;
}

function pathEnd(mapping: Record<string, unknown>, raw: Record<string, unknown>): string | null {
  const current = raw.current_node;
  if (typeof current === 'string' && nodeOf(mapping, current) !== null) return current;
  let id = Object.keys(mapping).find((key) => {
    const node = nodeOf(mapping, key);
    return node !== null && nodeOf(mapping, node.parent) === null;
  });
  const visited = new Set<string>();
  while (id !== undefined && !visited.has(id)) {
    visited.add(id);
    const children = nodeOf(mapping, id)?.children;
    const last = isUnknownArray(children) ? children.at(-1) : undefined;
    if (typeof last !== 'string' || nodeOf(mapping, last) === null) return id;
    id = last;
  }
  return id ?? null;
}

function pathTo(mapping: Record<string, unknown>, end: string): string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let id: unknown = end;
  while (typeof id === 'string' && !visited.has(id)) {
    const node = nodeOf(mapping, id);
    if (node === null) break;
    visited.add(id);
    path.push(id);
    id = node.parent;
  }
  return path.reverse();
}

function assistantCandidates(
  mapping: Record<string, unknown>,
  nodeId: string,
  node: Record<string, unknown>,
): { candidates: Candidate[]; selected: number } | null {
  const siblings = nodeOf(mapping, node.parent)?.children;
  const ids = isUnknownArray(siblings) && siblings.includes(nodeId) ? siblings : [nodeId];
  const candidates: Candidate[] = [];
  let selected = -1;
  for (const id of ids) {
    const message = nodeOf(mapping, id)?.message;
    if (!isRecord(message) || roleOf(message) !== 'assistant') continue;
    const candidate = candidateOf(message);
    if (candidate === null) continue;
    if (id === nodeId) selected = candidates.length;
    candidates.push(candidate);
  }
  return selected < 0 ? null : { candidates, selected };
}

function seconds(value: unknown): number {
  const time = finiteNumber(value);
  return time === null ? 0 : Math.round(time * MS_PER_SECOND);
}

function parseConversation(
  raw: unknown,
  counter: { dropped: number },
): { chat: Chat; own: boolean } | null {
  if (!isRecord(raw) || !isRecord(raw.mapping)) return null;
  const mapping = raw.mapping;
  const end = pathEnd(mapping, raw);
  if (end === null) return null;

  const kisara = isRecord(raw.kisara) ? raw.kisara : null;
  const messages: ChatMessage[] = [];
  const used = new Set<string>();

  for (const nodeId of pathTo(mapping, end)) {
    const message = messageOfNode(mapping, nodeId, { used, counter });
    if (message !== null) messages.push(message);
  }
  if (messages.length === 0) return null;

  const chat: Chat = {
    name: typeof raw.title === 'string' ? raw.title : '',
    prompt: promptOf(kisara),
    preset: parseUnitLink(kisara?.preset),
    character: parseCharacterFields(kisara?.character),
    persona: parsePersona(kisara?.persona),
    messages,
    ...parseSummary(kisara?.summary),
    ...refsOf(kisara),
    ...parseChatPlaybook(kisara?.playbook),
    createdAt: seconds(raw.create_time),
    updatedAt: seconds(raw.update_time),
  };
  return { chat: settleInterrupted(chat), own: kisara !== null };
}

function messageOfNode(
  mapping: Record<string, unknown>,
  nodeId: string,
  { used, counter }: { readonly used: Set<string>; readonly counter: { dropped: number } },
): ChatMessage | null {
  const node = nodeOf(mapping, nodeId);
  const message = node?.message;
  if (node === null || !isRecord(message) || hidden(message)) return null;
  const role = keptRole(message, counter);
  if (role === null) return null;
  const id = uniqueId(message, nodeId, used);

  if (role === 'assistant') {
    const picked = assistantCandidates(mapping, nodeId, node);
    return picked === null ? null : { id, role, ...picked };
  }
  const candidate = candidateOf(message);
  if (candidate === null) return null;
  return {
    id,
    role,
    candidates: [candidate],
    selected: 0,
    ...parseInstruction(kisaraOf(message)?.instruction),
  };
}

function keptRole(
  message: Record<string, unknown>,
  counter: { dropped: number },
): 'user' | 'assistant' | null {
  const role = roleOf(message);
  const text = messageText(message);
  if (role === 'system') return null;
  if ((role !== 'user' && role !== 'assistant') || text === null) {
    counter.dropped += 1;
    return null;
  }
  return text.length === 0 && kisaraOf(message) === null ? null : role;
}

function uniqueId(message: Record<string, unknown>, nodeId: string, used: Set<string>): string {
  const own = kisaraOf(message)?.message;
  let id = typeof own === 'string' && own.length > 0 ? own : nodeId;
  while (used.has(id)) id = `${id}_`;
  used.add(id);
  return id;
}

function promptOf(kisara: Record<string, unknown> | null): PromptComposition {
  return parseComposition(kisara?.prompt) ?? defaultComposition();
}

export function isConversationsFile(raw: unknown): boolean {
  const first = isUnknownArray(raw) ? raw[0] : raw;
  return isRecord(first) && isRecord(first.mapping);
}

export function parseConversations(raw: unknown): ParsedChats {
  const items = isUnknownArray(raw) ? raw : [raw];
  const counter = { dropped: 0 };
  const chats: Chat[] = [];
  let skipped = 0;
  for (const item of items) {
    const parsed = parseConversation(item, counter);
    if (parsed === null) skipped += 1;
    else chats.push(parsed.chat);
  }
  return { chats, skipped, dropped: counter.dropped };
}
