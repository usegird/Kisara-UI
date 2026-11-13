import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  modelName,
  modelUrl,
  parseModelId,
  recommendedModel,
  RUNTIME_SIZE,
  semanticModelFor,
} from '@/chat/semantic-models';

// ─────────────────────────────
// 近似判定のモデルの選び方
// ─────────────────────────────

describe('近似判定のモデル', () => {
  it('実行の部品の大きさは、ビルドが出力に置く ONNX Runtime の WASM に Worker の JS を足した値', () => {
    // ビルドが差し替える CPU だけの版の WASM（依存の更新で大きさが変わったら RUNTIME_SIZE を直す）
    const fromTransformers = createRequire(require.resolve('@huggingface/transformers'));
    const dist = dirname(fromTransformers.resolve('onnxruntime-web'));
    const wasm = statSync(join(dist, 'ort-wasm-simd-threaded.wasm')).size;
    const megabytes = wasm / (1024 * 1024);
    expect(RUNTIME_SIZE).toBeGreaterThanOrEqual(Math.round(megabytes));
    expect(RUNTIME_SIZE).toBeLessThanOrEqual(Math.round(megabytes) + 1);
  });

  it('画面の言語ごとに推奨を選び、知らない言語は英語の推奨', () => {
    expect(recommendedModel('ja').id).toBe('sirasagi62/ruri-v3-30m-ONNX');
    expect(recommendedModel('en').id).toBe('Snowflake/snowflake-arctic-embed-xs');
    expect(recommendedModel('zh-Hans').id).toBe('onnx-community/bge-small-zh-v1.5-ONNX');
    expect(recommendedModel('fr').id).toBe(recommendedModel('en').id);
  });

  it('URL か 組織/名前 からモデルの id を取り出す。読めなければ null', () => {
    expect(parseModelId('https://huggingface.co/Xenova/gte-small')).toBe('Xenova/gte-small');
    expect(parseModelId('https://huggingface.co/Xenova/gte-small/tree/main')).toBe(
      'Xenova/gte-small',
    );
    expect(parseModelId(' Xenova/gte-small ')).toBe('Xenova/gte-small');
    expect(parseModelId('gte-small')).toBeNull();
    expect(parseModelId('')).toBeNull();
  });

  it('指定が無ければ推奨。指定があれば接頭辞なし・平均で読み、閾値は言語の推奨の値', () => {
    expect(semanticModelFor('ja', '')).toBe(recommendedModel('ja'));
    const custom = semanticModelFor('ja', 'https://huggingface.co/Xenova/gte-small');
    expect(custom).toMatchObject({
      id: 'Xenova/gte-small',
      revision: null,
      pooling: 'mean',
      queryPrefix: '',
      floor: recommendedModel('ja').floor,
    });
    expect(semanticModelFor('ja', modelUrl(recommendedModel('ja').id))).toBe(
      recommendedModel('ja'),
    );
  });

  it('画面に出す名前は id の名前の部分（-ONNX は外す）', () => {
    expect(modelName('sirasagi62/ruri-v3-30m-ONNX')).toBe('ruri-v3-30m');
    expect(modelName('onnx-community/bge-small-zh-v1.5-ONNX')).toBe('bge-small-zh-v1.5');
  });
});
