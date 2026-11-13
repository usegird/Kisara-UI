import {
  CHARACTER_FIELDS,
  internalId,
  PROPOSAL_FENCE,
  SENT_FIELD,
  type AdvisorChange,
  type AdvisorProposal,
} from '@/chat/prompt-advisor';
import { isRecord, isUnknownArray, stringOr } from '@/lib/guards';

// ─────────────────────────────
// 構成の相談の応答から案を読む。応答は外から来るので、形を確かめてから使う。
// ─────────────────────────────

/** 本文を描く単位。文・読めた案・読めない案・書いている途中の案 */
type AdvisorSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'proposal'; readonly proposal: AdvisorProposal }
  | { readonly kind: 'invalid'; readonly raw: string }
  | { readonly kind: 'pending' };

/** 本文を文と案に分ける。閉じていない案は書いている途中として出す */
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

/**
 * 案の JSON を読む。形が違えば null。読めない変える所は落とし、1 件も無ければ null。
 * 呼び出しを文字で書いた形（`名前({...})`）は、括弧の中を読む
 */
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

/** 個別追加辞書の項目。キーワードが無く常に入れるのでもない項目は当たらないので読まない */
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

/** 文字で書いた呼び出し（`名前( … )`）なら括弧の中を、ほかはそのまま返す */
function unwrapCall(raw: string): string {
  const call = /^\s*[A-Za-z_][\w]*\s*\(([\s\S]*)\)\s*;?\s*$/u.exec(raw);
  return call?.[1] ?? raw;
}

/** 送った名前で書かれた id を読む */
function idOf(value: unknown): string | null {
  const id = stringOr(value, null);
  return id === null ? null : internalId(id);
}
