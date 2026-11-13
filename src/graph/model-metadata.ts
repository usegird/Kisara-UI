import { isRecord } from '@/lib/guards';
import { truncate } from '@/lib/text';

// ─────────────────────────────
// safetensors に埋め込まれた metadata の読み解き。中身は学習側が書いた文字列の集まりでキーが揃って
// いないので、sd-scripts の `ss_*` と modelspec の `modelspec.*` を拠り所にしつつ、無い前提で読む。
// ─────────────────────────────

/** metadata の生の 1 項目（長い値は表示上限で切ったもの） */
interface ModelInfoEntry {
  readonly key: string;
  readonly value: string;
}

/**
 * metadata から拾った見出しの項目と、生の全項目。読めない値は捨てるが、生の一覧は必ず残す
 * （こちらの決めた項目だけに絞ると手掛かりが消える）。
 */
export interface ModelInfo {
  readonly title: string | null;
  /** 学習の土台になったモデル */
  readonly baseModel: string | null;
  /** 網の大きさ（dim / alpha） */
  readonly network: string | null;
  /** 学習で多く付いていた語＝呼び出しの手掛かり */
  readonly triggers: readonly string[];
  /** 生の全項目（キー順） */
  readonly entries: readonly ModelInfoEntry[];
}

/** 1 項目の表示上限。学習データの一覧は数十 KB になることがある */
const VALUE_LIMIT = 400;

/** 呼び出しの手掛かりとして出す語の数 */
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

/**
 * 学習時のタグの出現数（`ss_tag_frequency`）から多い順に並べる。
 * 形は `{データセット: {語: 回数}}`。壊れていたら何も返さない。
 */
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

/** metadata から題名・土台のモデル・網の大きさ・呼び出しの手掛かりを拾い、生の全項目を添える */
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
