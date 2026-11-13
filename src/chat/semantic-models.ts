import type { EmbeddingModel } from '@/port/embedding-port';

// ─────────────────────────────
// 近似判定のモデルと閾値。画面の言語ごとの推奨と、利用者が指定したモデルの解き方。
// モデルに渡す決まった文（接頭辞・ありふれた発言）は画面の文言ではないので訳さない。
// ─────────────────────────────

/** モデルと、そのモデルで測った当たりの下限 */
export interface SemanticModel extends EmbeddingModel {
  /** 今の発言と比べたときの下限 */
  readonly floor: number;
  /** 末尾 2 件をつないで比べ直したときの下限 */
  readonly contextFloor: number;
  /** 落とす大きさ（MB。有効にするときの確認に出す）。指定のモデルは分からないので null */
  readonly size: number | null;
}

const JA: SemanticModel = {
  id: 'sirasagi62/ruri-v3-30m-ONNX',
  revision: 'cdf9391f1ff2198daa8f63f7ccf97d7b3e7415a0',
  dtype: 'int8',
  pooling: 'mean',
  queryPrefix: '検索クエリ: ',
  passagePrefix: '検索文書: ',
  generic: [
    'こんにちは',
    'ありがとう',
    'うん、わかった',
    'そうなんだ',
    'よろしくね',
    'ちょっと待って',
  ],
  floor: 0.04,
  contextFloor: 0.1,
  size: 37,
};

const EN: SemanticModel = {
  id: 'Snowflake/snowflake-arctic-embed-xs',
  revision: 'd8c86521100d3556476a063fc2342036d45c106f',
  dtype: 'q8',
  pooling: 'mean',
  queryPrefix: '',
  passagePrefix: '',
  generic: ['Hello', 'Thank you', 'Okay, got it', 'I see', 'Nice to meet you', 'Wait a moment'],
  // 項目の多い辞書で余計な当たりを抑える
  floor: 0.05,
  contextFloor: 0.05,
  size: 23,
};

// 取り先は Hugging Face の組織の変換（元の持ち主か組織が置いた物にするため）
const ZH: SemanticModel = {
  id: 'onnx-community/bge-small-zh-v1.5-ONNX',
  revision: '9507db33464b5da99a532ac26b2a251767cbc62b',
  dtype: 'q8',
  pooling: 'cls',
  queryPrefix: '',
  passagePrefix: '',
  generic: ['你好', '谢谢', '嗯，知道了', '原来如此', '请多关照', '等一下'],
  floor: 0.06,
  contextFloor: 0.08,
  size: 24,
};

/**
 * 実行の部品（ONNX Runtime の WASM と、Transformers.js を束ねた Worker の JS）の大きさ（MB）。モデルと別に
 * 落とすので、有効にするときの確認に添える。ONNX Runtime の版を上げたらテストが差を知らせる
 */
export const RUNTIME_SIZE = 14;

/** 画面の言語の符号ごとの推奨。無い言語は英語の推奨 */
const RECOMMENDED: Readonly<Record<string, SemanticModel>> = { ja: JA, en: EN, 'zh-Hans': ZH };

/** 画面の言語の推奨のモデル。推奨の無い言語は英語の推奨 */
export function recommendedModel(locale: string): SemanticModel {
  return RECOMMENDED[locale] ?? EN;
}

const HUB = 'https://huggingface.co/';

/** モデルの Hugging Face の URL（設定の欄の薄い説明に出す） */
export function modelUrl(id: string): string {
  return `${HUB}${id}`;
}

/** 指定の文からモデルの id（`組織/名前`）を取り出す。URL か `組織/名前`。読めなければ null */
export function parseModelId(text: string): string | null {
  const trimmed = text.trim();
  const path = trimmed.startsWith(HUB) ? trimmed.slice(HUB.length) : trimmed;
  const match = /^([\w.-]+)\/([\w.-]+)(?:\/.*)?$/u.exec(path);
  return match === null ? null : `${match[1]}/${match[2]}`;
}

/**
 * 使うモデルを決める。指定が読めればそのモデル、無ければ言語の推奨
 */
export function semanticModelFor(locale: string, custom: string): SemanticModel {
  const recommended = recommendedModel(locale);
  const id = parseModelId(custom);
  if (id === null || id === recommended.id) return recommended;
  return {
    ...recommended,
    id,
    revision: null,
    dtype: 'q8',
    pooling: 'mean',
    queryPrefix: '',
    passagePrefix: '',
    size: null,
  };
}

/** 画面に出すモデルの名前（id の名前の部分。末尾の -ONNX は外す） */
export function modelName(id: string): string {
  return (id.split('/').at(-1) ?? id).replace(/-ONNX$/iu, '');
}
