import { isRecord } from '@/lib/guards';
import { truncate } from '@/lib/text';

interface ModelInfoEntry {
  readonly key: string;
  readonly value: string;
}

export interface ModelInfo {
  readonly title: string | null;
  readonly baseModel: string | null;
  readonly network: string | null;
  readonly triggers: readonly string[];
  readonly entries: readonly ModelInfoEntry[];
}

export interface ModelJsonEntry {
  readonly key: string;
  readonly value: string;
  readonly structured?: true;
}

const JSON_INDENT = 2;

const NO_JSON_VALUES: ReadonlySet<string> = new Set(['', 'Unknown', '0']);

const VALUE_LIMIT = 400;

const TRIGGER_LIMIT = 24;

function pick(metadata: ReadonlyMap<string, string>, ...keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = metadata.get(key)?.trim();
    if (value !== undefined && value.length > 0) return value;
  }
  return null;
}

function network(metadata: ReadonlyMap<string, string>): string | null {
  const dim = pick(metadata, 'ss_network_dim');
  const alpha = pick(metadata, 'ss_network_alpha');
  if (dim === null && alpha === null) return null;

  return [dim === null ? null : `dim ${dim}`, alpha === null ? null : `alpha ${alpha}`]
    .filter((part) => part !== null)
    .join(' / ');
}

export function triggerWords(raw: string | null): string[] {
  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!isRecord(parsed)) return [];

  const counts = new Map<string, number>();
  for (const dataset of Object.values(parsed)) {
    if (!isRecord(dataset)) continue;

    for (const [tag, count] of Object.entries(dataset)) {
      if (typeof count !== 'number' || !Number.isFinite(count)) continue;

      const word = tag.trim();
      if (word.length === 0) continue;

      counts.set(word, (counts.get(word) ?? 0) + count);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, TRIGGER_LIMIT)
    .map(([word]) => word);
}

export function summarizeModelMetadata(metadata: ReadonlyMap<string, string>): ModelInfo {
  const entries = [...metadata.entries()]
    .map(([key, value]) => ({
      key,
      value: truncate(value, VALUE_LIMIT, { singleLine: false }),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));

  return {
    title: pick(metadata, 'modelspec.title', 'ss_output_name'),
    baseModel: pick(
      metadata,
      'ss_base_model_version',
      'modelspec.architecture',
      'ss_sd_model_name',
    ),
    network: network(metadata),
    triggers: triggerWords(metadata.get('ss_tag_frequency') ?? null),
    entries,
  };
}

export function parseModelJsonEntries(raw: unknown): ModelJsonEntry[] | null {
  if (!isRecord(raw)) return null;

  return Object.entries(raw).map(([key, value]) =>
    typeof value === 'string'
      ? { key, value }
      : { key, value: JSON.stringify(value, null, JSON_INDENT), structured: true },
  );
}

export function hasModelJsonValue(entry: ModelJsonEntry): boolean {
  return !NO_JSON_VALUES.has(entry.value.trim());
}
