import { finiteNumber, isRecord, isUnknownArray } from '@/lib/guards';
import type {
  ModelBenchmark,
  ModelDetails,
  ModelPrice,
  ModelPriceTier,
  ModelReasoning,
} from '@/port/llm-port';

// ─────────────────────────────
// `GET /models` の項目の付帯情報（OpenRouter）の検証。形の合わない所は捨て、
// 何も読めなければ付帯情報を作らない（返さないサーバーでは何も出さない）。
// ─────────────────────────────

/** 1 秒のミリ秒（`created` は秒で来る） */
const MS_PER_SECOND = 1000;
/** ISO 8601 の日付の部分（YYYY-MM-DD）の長さ */
const ISO_DATE_LENGTH = 10;

/** 1 トークンあたりの値の項目（公式の文書。`input_cache_write_1h` は名前からの推論） */
const PER_TOKEN = new Set([
  'prompt',
  'completion',
  'input_cache_read',
  'input_cache_write',
  'input_cache_write_1h',
  'internal_reasoning',
]);

/** 費用は文字列で返る（`"0.0000001"`）。数の形のものだけを読む */
function usdOf(value: unknown): number | null {
  const number = typeof value === 'string' && value.trim().length > 0 ? Number(value) : value;
  return finiteNumber(number);
}

function pricesOf(pricing: Record<string, unknown>, skip: ReadonlySet<string>): ModelPrice[] {
  const prices: ModelPrice[] = [];
  for (const [name, value] of Object.entries(pricing)) {
    if (skip.has(name)) continue;
    const usd = usdOf(value);
    if (usd !== null) prices.push({ name, usd, perToken: PER_TOKEN.has(name) });
  }
  return prices;
}

/** 条件の項目（費用でないもの）。数のものだけを条件として読む */
function tierOf(raw: unknown): ModelPriceTier | null {
  if (!isRecord(raw)) return null;
  const conditions: { name: string; value: number }[] = [];
  const prices: ModelPrice[] = [];
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === 'number') {
      const number = finiteNumber(value);
      if (number !== null) conditions.push({ name, value: number });
      continue;
    }
    const usd = usdOf(value);
    if (usd !== null) prices.push({ name, usd, perToken: PER_TOKEN.has(name) });
  }
  return prices.length === 0 ? null : { conditions, prices };
}

function stringsOf(value: unknown): string[] {
  return isUnknownArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** Artificial Analysis は名前ごとの数（null は捨てる）、Design Arena は分野ごとの並び */
function benchmarksOf(raw: unknown): ModelBenchmark[] {
  if (!isRecord(raw)) return [];
  const benchmarks: ModelBenchmark[] = [];
  for (const [source, value] of Object.entries(raw)) {
    if (isRecord(value)) {
      for (const [label, score] of Object.entries(value)) {
        const number = finiteNumber(score);
        if (number !== null)
          benchmarks.push({ source, label, values: [{ name: '', value: number }] });
      }
      continue;
    }
    if (!isUnknownArray(value)) continue;
    for (const entry of value) {
      if (!isRecord(entry)) continue;
      const label = [entry.arena, entry.category]
        .filter((part) => typeof part === 'string')
        .join('/');
      const values = Object.entries(entry).flatMap(([name, score]) => {
        const number = finiteNumber(score);
        return number === null ? [] : [{ name, value: number }];
      });
      if (values.length > 0) benchmarks.push({ source, label, values });
    }
  }
  return benchmarks;
}

function reasoningOf(raw: unknown): ModelReasoning | null {
  if (!isRecord(raw)) return null;
  return {
    mandatory: raw.mandatory === true,
    defaultEnabled: typeof raw.default_enabled === 'boolean' ? raw.default_enabled : null,
    efforts: stringsOf(raw.supported_efforts),
    defaultEffort: typeof raw.default_effort === 'string' ? raw.default_effort : null,
  };
}

const OVERRIDES = new Set(['overrides']);

/**
 * OpenAI 互換の一覧がどのサーバーでも返す項目。これだけなら付帯情報を作らない
 * （Ollama などで、思考を「非対応」と誤って出さないため）
 */
const OPENAI_FIELDS = new Set(['object', 'created', 'owned_by']);

/** 上の段で読む項目（ほかの項目には出さない）。`architecture` は入出力の 2 つだけ */
const SHOWN = new Set([
  'id',
  'description',
  'pricing',
  'benchmarks',
  'reasoning',
  'architecture.input_modalities',
  'architecture.output_modalities',
]);

/** `created` は UNIX 時刻（秒）なので日付も添える */
function formatScalar(name: string, value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (typeof value === 'boolean') return String(value);
  const number = finiteNumber(value);
  if (number === null) return null;
  if (name !== 'created') return String(number);
  const date = new Date(number * MS_PER_SECOND).toISOString().slice(0, ISO_DATE_LENGTH);
  return `${String(number)} (${date})`;
}

/** 残りの項目を、入れ子を `.` でつないだ名前と文字の値の並びにする */
function othersOf(value: unknown, name: string, out: { name: string; value: string }[]): void {
  if (SHOWN.has(name)) return;
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      othersOf(child, name.length === 0 ? key : `${name}.${key}`, out);
    }
    return;
  }
  if (isUnknownArray(value)) {
    const scalars = value.map((item) => formatScalar(name, item));
    if (scalars.every((item) => item !== null)) {
      if (scalars.length > 0) out.push({ name, value: scalars.join(', ') });
      return;
    }
    value.forEach((item, index) => othersOf(item, `${name}[${String(index)}]`, out));
    return;
  }
  const text = formatScalar(name, value);
  if (text !== null) out.push({ name, value: text });
}

/**
 * 項目の付帯情報。どれも無ければ null。項目の形は公式の文書（Models の Overview）と、実際の一覧に合わせる
 */
export function modelDetailsOf(item: Record<string, unknown>): ModelDetails | null {
  const pricing = isRecord(item.pricing) ? item.pricing : {};
  const architecture = isRecord(item.architecture) ? item.architecture : {};
  const details: ModelDetails = {
    description:
      typeof item.description === 'string' && item.description.trim().length > 0
        ? item.description
        : null,
    created: finiteNumber(item.created),
    prices: pricesOf(pricing, OVERRIDES),
    priceTiers: isUnknownArray(pricing.overrides)
      ? pricing.overrides.flatMap((raw) => tierOf(raw) ?? [])
      : [],
    inputs: stringsOf(architecture.input_modalities),
    outputs: stringsOf(architecture.output_modalities),
    benchmarks: benchmarksOf(item.benchmarks),
    reasoning: reasoningOf(item.reasoning),
    reasoningParam: stringsOf(item.supported_parameters).includes('reasoning'),
    others: [],
  };
  const others: { name: string; value: string }[] = [];
  othersOf(item, '', others);
  const empty =
    details.description === null &&
    details.prices.length === 0 &&
    details.inputs.length === 0 &&
    details.outputs.length === 0 &&
    details.benchmarks.length === 0 &&
    details.reasoning === null &&
    !details.reasoningParam &&
    others.every((entry) => OPENAI_FIELDS.has(entry.name));
  return empty ? null : { ...details, others };
}
