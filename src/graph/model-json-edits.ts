import { isRecord } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';

import { hasModelJsonValue, type ModelJsonEntry } from './model-metadata';

export const PREFERRED_WEIGHT_KEY = 'preferred weight';

export const ACTIVATION_TEXT_KEY = 'activation text';

export const DEFAULT_WEIGHT = 1;

const PINNED_KEYS: readonly string[] = [ACTIVATION_TEXT_KEY, 'negative text', PREFERRED_WEIGHT_KEY];

const READ_ONLY_KEYS: readonly string[] = ['description', 'notes'];

const WEIGHT_SCALE = 10;

export type ModelJsonEditValue = string | number;

export type ModelJsonEdits = ReadonlyMap<string, ModelJsonEditValue>;

export interface ModelJsonSource {
  readonly original: readonly ModelJsonEntry[] | null;
  readonly edits: ModelJsonEdits;
}

export interface ModelJsonField extends ModelJsonEntry {
  readonly editable: boolean;
}

export function mergeModelJson(source: ModelJsonSource): ModelJsonEntry[] {
  const original = source.original ?? [];
  const known = new Set(original.map((entry) => entry.key));
  const merged = original.map((entry) => {
    const edited = source.edits.get(entry.key);
    return edited === undefined ? entry : { key: entry.key, value: editText(edited) };
  });
  for (const [key, value] of source.edits) {
    if (!known.has(key)) merged.push({ key, value: editText(value) });
  }
  return merged;
}

export function modelJsonFields(source: ModelJsonSource): ModelJsonField[] {
  const readOnly = new Set([
    ...READ_ONLY_KEYS,
    ...(source.original ?? [])
      .filter((entry) => entry.key !== PREFERRED_WEIGHT_KEY && entry.structured === true)
      .map((entry) => entry.key),
  ]);
  const merged = new Map(mergeModelJson(source).map((entry) => [entry.key, entry.value]));
  const pinned = PINNED_KEYS.map((key) => {
    const value = merged.get(key) ?? '';
    const shown = key === PREFERRED_WEIGHT_KEY && !hasModelJsonValue({ key, value }) ? '' : value;
    return { key, value: shown };
  });
  const withValue = (key: string): boolean =>
    hasModelJsonValue({ key, value: merged.get(key) ?? '' });
  const ordered = [
    ...READ_ONLY_KEYS.filter(withValue),
    ...[...merged.keys()].filter(
      (key) => !PINNED_KEYS.includes(key) && !READ_ONLY_KEYS.includes(key) && withValue(key),
    ),
  ].map((key) => ({ key, value: merged.get(key) ?? '' }));
  return [...pinned, ...ordered].map((entry) => ({ ...entry, editable: !readOnly.has(entry.key) }));
}

export function weightText(value: string | undefined): string {
  if (value === undefined || !hasModelJsonValue({ key: PREFERRED_WEIGHT_KEY, value })) {
    return String(DEFAULT_WEIGHT);
  }
  return value.trim();
}

export function applyModelJsonEdit(
  source: ModelJsonSource,
  key: string,
  value: ModelJsonEditValue,
): Map<string, ModelJsonEditValue> {
  const next = new Map(source.edits);
  const normalized = key === PREFERRED_WEIGHT_KEY ? normalizeWeight(value) : value;
  const original = source.original?.find((entry) => entry.key === key)?.value;
  const same =
    key === PREFERRED_WEIGHT_KEY
      ? weightText(original) === editText(normalized)
      : original === editText(normalized);
  if (same) next.delete(key);
  else next.set(key, normalized);
  return next;
}

export function parseWeightInput(text: string): number {
  const value = Number(text.trim());
  return text.trim().length === 0 || !Number.isFinite(value)
    ? DEFAULT_WEIGHT
    : normalizeWeight(value);
}

export function parseModelJsonEdits(raw: unknown): Map<string, ModelJsonEditValue> {
  const edits = new Map<string, ModelJsonEditValue>();
  if (!isRecord(raw)) return edits;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') edits.set(key, value);
    else if (typeof value === 'number' && Number.isFinite(value)) edits.set(key, value);
  }
  return edits;
}

export function serializeModelJsonEdits(edits: ModelJsonEdits): string {
  const body: Record<string, ModelJsonEditValue> = {};
  for (const [key, value] of edits) setOwn(body, key, value);
  return JSON.stringify(body, null, 2);
}

function editText(value: ModelJsonEditValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function normalizeWeight(value: ModelJsonEditValue): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return DEFAULT_WEIGHT;
  const rounded = Math.round(Math.abs(number) * WEIGHT_SCALE) / WEIGHT_SCALE;
  return rounded === 0 ? 0 : Math.sign(number) * rounded;
}
