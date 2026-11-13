import { describe, expect, it } from 'vitest';

import { summarizeModelMetadata, triggerWords } from '@/graph/model-metadata';

// ─────────────────────────────
// モデルの情報に出す safetensors の埋め込み情報の読み解き。
// キーは揃っていない前提。読めないものは捨て、生の一覧は必ず残す。
// ─────────────────────────────

describe('学習で多かった語', () => {
  it('データセットをまたいで足し、多い順に出す', () => {
    const raw = JSON.stringify({
      '10_a': { girl: 3, hat: 10 },
      '20_b': { girl: 8 },
    });

    expect(triggerWords(raw)).toEqual(['girl', 'hat']);
  });

  it('壊れた値・数でない回数は捨てる', () => {
    expect(triggerWords('{')).toEqual([]);
    expect(triggerWords(null)).toEqual([]);
    expect(triggerWords(JSON.stringify({ set: { tag: 'many' } }))).toEqual([]);
  });
});

describe('要点の抜き出し', () => {
  it('名称と土台と網を拾う', () => {
    const info = summarizeModelMetadata(
      new Map([
        ['modelspec.title', 'My Lora'],
        ['ss_base_model_version', 'sdxl_base_v1-0'],
        ['ss_network_dim', '32'],
        ['ss_network_alpha', '16'],
      ]),
    );

    expect(info.title).toBe('My Lora');
    expect(info.baseModel).toBe('sdxl_base_v1-0');
    expect(info.network).toBe('dim 32 / alpha 16');
  });

  it('キーが無ければ null（無いことを失敗にしない）', () => {
    const info = summarizeModelMetadata(new Map([['ss_v2', 'False']]));

    expect(info.title).toBeNull();
    expect(info.network).toBeNull();
    expect(info.entries).toEqual([{ key: 'ss_v2', value: 'False' }]);
  });

  it('長すぎる値は切り詰めて出す', () => {
    const info = summarizeModelMetadata(new Map([['ss_datasets', 'x'.repeat(1000)]]));

    expect(info.entries[0]?.value).toHaveLength(401);
  });
});
