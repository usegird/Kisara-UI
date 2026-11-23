import { describe, expect, it } from 'vitest';

import {
  hasModelJsonValue,
  parseModelJsonEntries,
  summarizeModelMetadata,
  triggerWords,
} from '@/graph/model-metadata';

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

describe('Lora と同名の JSON（キーと値をそのまま）', () => {
  it('キーをファイルの並びのまま、文字の値は変えずに出す（空も残す）', () => {
    const entries = parseModelJsonEntries({ 'sd version': 'SDXL', notes: '', a: ' x\n' });

    expect(entries?.map((entry) => entry.key)).toEqual(['sd version', 'notes', 'a']);
    expect(entries?.map((entry) => entry.value)).toEqual(['SDXL', '', ' x\n']);
  });

  it('文字でない値は JSON の文字にする', () => {
    const entries = parseModelJsonEntries({ weight: 0, tags: ['a'], none: null });

    expect(entries?.map((entry) => entry.value)).toEqual(['0', '[\n  "a"\n]', 'null']);
  });

  it('物でなければ null', () => {
    expect(parseModelJsonEntries([1])).toBeNull();
    expect(parseModelJsonEntries('x')).toBeNull();
  });
});

describe('JSON の値なし', () => {
  it('前後の空白を除いて空・Unknown・0 は値なし、ほかは値あり', () => {
    const valued = ['', '  ', 'Unknown', '0', 'SDXL', '0.8', 'unknown text'].map((value) =>
      hasModelJsonValue({ key: 'k', value }),
    );

    expect(valued).toEqual([false, false, false, false, true, true, true]);
  });
});
