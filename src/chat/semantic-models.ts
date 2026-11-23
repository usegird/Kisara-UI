import type { EmbeddingModel } from '@/port/embedding-port';

export interface SemanticModel extends EmbeddingModel {
  readonly floor: number;
  readonly contextFloor: number;
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
  floor: 0.05,
  contextFloor: 0.05,
  size: 23,
};

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

export const RUNTIME_SIZE = 14;

const RECOMMENDED: Readonly<Record<string, SemanticModel>> = { ja: JA, en: EN, 'zh-Hans': ZH };

export function recommendedModel(locale: string): SemanticModel {
  return RECOMMENDED[locale] ?? EN;
}

const HUB = 'https://huggingface.co/';

export function modelUrl(id: string): string {
  return `${HUB}${id}`;
}

export function parseModelId(text: string): string | null {
  const trimmed = text.trim();
  const path = trimmed.startsWith(HUB) ? trimmed.slice(HUB.length) : trimmed;
  const match = /^([\w.-]+)\/([\w.-]+)(?:\/.*)?$/u.exec(path);
  return match === null ? null : `${match[1]}/${match[2]}`;
}

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

export function modelName(id: string): string {
  return (id.split('/').at(-1) ?? id).replace(/-ONNX$/iu, '');
}
