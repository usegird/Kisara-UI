import {
  CHARACTER_FIELDS,
  internalId,
  PROPOSAL_FENCE,
  SENT_FIELD,
  type AdvisorChange,
  type AdvisorProposal,
} from '@/chat/prompt-advisor';
import { isRecord, isUnknownArray, stringOr } from '@/lib/guards';

type AdvisorSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'proposal'; readonly proposal: AdvisorProposal }
  | { readonly kind: 'invalid'; readonly raw: string }
  | { readonly kind: 'pending' };

export function splitAdvisorText(content: string): AdvisorSegment[] {
  const segments: AdvisorSegment[] = [];
  const pushText = (value: string): void => {
    if (value.trim().length > 0) segments.push({ kind: 'text', text: value });
  };
  const fence = new RegExp(`\`\`\`${PROPOSAL_FENCE}[^\\n]*\\n([\\s\\S]*?)\`\`\``, 'gu');
  let last = 0;
  for (const match of content.matchAll(fence)) {
    pushText(content.slice(last, match.index));
    const raw = match[1] ?? '';
    const proposal = parseProposal(raw);
    segments.push(proposal === null ? { kind: 'invalid', raw } : { kind: 'proposal', proposal });
    last = match.index + match[0].length;
  }
  const rest = content.slice(last);
  const open = rest.indexOf(`\`\`\`${PROPOSAL_FENCE}`);
  if (open < 0) {
    pushText(rest);
  } else {
    pushText(rest.slice(0, open));
    segments.push({ kind: 'pending' });
  }
  return segments;
}

export function parseProposal(raw: string): AdvisorProposal | null {
  let value: unknown;
  try {
    value = JSON.parse(unwrapCall(raw));
  } catch {
    return null;
  }
  if (!isRecord(value) || !isUnknownArray(value.changes)) return null;
  const changes = value.changes
    .map(parseChange)
    .filter((change): change is AdvisorChange => change !== null);
  if (changes.length === 0) return null;
  return { title: stringOr(value.title), changes };
}

function parseChange(raw: unknown): AdvisorChange | null {
  if (!isRecord(raw)) return null;
  if (raw.target === 'removeItem') {
    const id = idOf(raw.id);
    return id === null ? null : { target: 'removeItem', id };
  }
  const content = stringOr(raw.content, null);
  if (content === null) return null;
  switch (raw.target) {
    case 'main':
    case 'prefill':
      return { target: raw.target, content };
    case 'item': {
      const id = idOf(raw.id);
      return id === null ? null : { target: 'item', id, content };
    }
    case 'newItem': {
      const name = stringOr(raw.name);
      const place = raw.place === 'after' ? 'after' : 'before';
      return { target: 'newItem', name, place, content };
    }
    case 'card': {
      const field = CHARACTER_FIELDS.find((item) => SENT_FIELD[item] === raw.field);
      return field === undefined ? null : { target: 'character', field, content };
    }
    case 'dictionaryEntry':
      return parseDictionaryChange(raw, content);
    default:
      return null;
  }
}

function parseDictionaryChange(
  raw: Record<string, unknown>,
  content: string,
): AdvisorChange | null {
  const keys = isUnknownArray(raw.keywords)
    ? raw.keywords.filter((key): key is string => typeof key === 'string' && key.length > 0)
    : [];
  const constant = raw.constant === true;
  if (keys.length === 0 && !constant) return null;
  return {
    target: 'dictionaryEntry',
    dictionary: stringOr(raw.dictionary).trim(),
    keys,
    content,
    constant,
    comment: stringOr(raw.comment),
    enabled: raw.enabled !== false,
  };
}

function unwrapCall(raw: string): string {
  const call = /^\s*[A-Za-z_][\w]*\s*\(([\s\S]*)\)\s*;?\s*$/u.exec(raw);
  return call?.[1] ?? raw;
}

function idOf(value: unknown): string | null {
  const id = stringOr(value, null);
  return id === null ? null : internalId(id);
}
