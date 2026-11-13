import type { ToolCallProblem } from '@/chat/types';
import { isRecord } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';

// ─────────────────────────────
// 呼び出しの引数の確かめと、人が直した引数の読み方。
// ─────────────────────────────

/**
 * 引数の本文に、画面で直した値（引数名 → 打った文字）を重ねる。元の値が文字なら文字のまま、
 * ほかは JSON として読み、読めなければ文字にする。本文が JSON の物でなければそのまま返す
 */
export function editedArguments(raw: string, edits: ReadonlyMap<string, string>): string {
  if (edits.size === 0) return raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!isRecord(parsed)) return raw;
  const next: Record<string, unknown> = { ...parsed };
  for (const [name, text] of edits) {
    setOwn(next, name, typeof parsed[name] === 'string' ? text : jsonOrText(text));
  }
  return JSON.stringify(next);
}

/** 空の引数。読めない引数の代わりに送る */
const EMPTY_ARGUMENTS = '{}';

/**
 * 履歴に入れて送る引数の本文。JSON の物として読めなければ空の物にする
 * （読めない引数を含む要求ごと断るサーバーがあり、一度返るとその会話で送れなくなる）
 */
export function sendableArgumentsOf(raw: string): string {
  try {
    return isRecord(JSON.parse(raw)) ? raw : EMPTY_ARGUMENTS;
  } catch {
    return EMPTY_ARGUMENTS;
  }
}

function jsonOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** 引数 1 つの JSON Schema */
export type ArgumentSchema = Readonly<Record<string, unknown>>;

/** 確かめる引数 1 つ（ワークフローの送る引数のうち、確かめに要る所） */
interface CheckedArgument {
  readonly nodeId: string;
  readonly input: string;
  readonly name: string;
  readonly schema: ArgumentSchema;
}

/** 合わなかった理由。`argument` はどの引数か（全体の問題なら無い） */
type ArgumentProblem = Exclude<ToolCallProblem, { readonly code: 'unknown-tool' }>;

/** 引数を確かめた結果。合えば値（ノード id → 入力名 → 値）、合わなければ最初に見つけた理由 */
type ParsedArguments =
  | { readonly ok: true; readonly values: ReadonlyMap<string, Readonly<Record<string, unknown>>> }
  | { readonly ok: false; readonly problem: ArgumentProblem };

/** LLM が返した引数の本文を読み、引数ごとに確かめる。どれか 1 つでも合わなければ合わない */
export function parseToolArguments(args: readonly CheckedArgument[], raw: string): ParsedArguments {
  let parsed: unknown;
  try {
    parsed = raw.trim().length === 0 ? {} : JSON.parse(raw);
  } catch {
    return { ok: false, problem: { code: 'json' } };
  }
  if (!isRecord(parsed)) return { ok: false, problem: { code: 'json' } };

  const known = new Set(args.map((arg) => arg.name));
  const unknown = Object.keys(parsed).find((key) => !known.has(key));
  if (unknown !== undefined) return { ok: false, problem: { code: 'unknown', argument: unknown } };

  const values = new Map<string, Record<string, unknown>>();
  for (const arg of args) {
    if (!(arg.name in parsed))
      return { ok: false, problem: { code: 'missing', argument: arg.name } };
    const value = parsed[arg.name];
    const code = checkValue(arg.schema, value);
    if (code !== null) return { ok: false, problem: { code, argument: arg.name } };
    const fields = values.get(arg.nodeId) ?? {};
    setOwn(fields, arg.input, value);
    values.set(arg.nodeId, fields);
  }
  return { ok: true, values };
}

function checkValue(schema: ArgumentSchema, value: unknown): 'type' | 'range' | 'choice' | null {
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return 'type';
      return Array.isArray(schema.enum) && !schema.enum.includes(value) ? 'choice' : null;
    case 'boolean':
      return typeof value === 'boolean' ? null : 'type';
    case 'integer':
    case 'number':
      return checkNumber(schema, value);
    default:
      return 'type';
  }
}

function checkNumber(schema: ArgumentSchema, value: unknown): 'type' | 'range' | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'type';
  if (schema.type === 'integer' && !Number.isInteger(value)) return 'type';
  const { minimum, maximum } = schema;
  if (typeof minimum === 'number' && value < minimum) return 'range';
  if (typeof maximum === 'number' && value > maximum) return 'range';
  return null;
}
