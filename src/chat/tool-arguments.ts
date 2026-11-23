import type { ToolCallProblem } from '@/chat/types';
import { isRecord } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';

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

const EMPTY_ARGUMENTS = '{}';

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

export type ArgumentSchema = Readonly<Record<string, unknown>>;

interface CheckedArgument {
  readonly nodeId: string;
  readonly input: string;
  readonly name: string;
  readonly schema: ArgumentSchema;
}

type ArgumentProblem = Exclude<ToolCallProblem, { readonly code: 'unknown-tool' }>;

type ParsedArguments =
  | { readonly ok: true; readonly values: ReadonlyMap<string, Readonly<Record<string, unknown>>> }
  | { readonly ok: false; readonly problem: ArgumentProblem };

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
