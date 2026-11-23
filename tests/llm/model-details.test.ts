import { describe, expect, it } from 'vitest';

import { modelDetailsOf } from '@/llm/model-details';
import { parseModelList } from '@/llm/schema';

describe('モデルの付帯情報', () => {
  it('費用は文字列を数にし、トークン単位の項目に印を付ける。overrides は条件ごとに分ける', () => {
    const details = modelDetailsOf({
      pricing: {
        prompt: '0.0000001',
        web_search: '0.01',
        image: 'bad',
        overrides: [{ min_prompt_tokens: 100000, prompt: '0.0000005' }],
      },
    });
    expect(details?.prices).toEqual([
      { name: 'prompt', usd: 0.0000001, perToken: true },
      { name: 'web_search', usd: 0.01, perToken: false },
    ]);
    expect(details?.priceTiers[0]?.conditions).toEqual([
      { name: 'min_prompt_tokens', value: 100000 },
    ]);
    expect(details?.priceTiers[0]?.prices.map((price) => price.name)).toEqual(['prompt']);
  });

  it('思考は mandatory・既定・強さを読み、supported_parameters の reasoning も見る', () => {
    const details = modelDetailsOf({
      reasoning: { mandatory: true, supported_efforts: ['high', 'low'], default_effort: 'high' },
      supported_parameters: ['tools', 'reasoning'],
    });
    expect(details?.reasoning).toMatchObject({ mandatory: true, defaultEnabled: null });
    expect(details?.reasoning?.efforts).toEqual(['high', 'low']);
    expect(details?.reasoningParam).toBe(true);
  });

  it('ベンチマークは数の名前ごとと、分野ごとの並びを読み、null は捨てる', () => {
    const details = modelDetailsOf({
      benchmarks: {
        artificial_analysis: { intelligence_index: 26.5, coding_index: null },
        design_arena: [{ arena: 'models', category: '3d', elo: 1395, rank: 6 }],
      },
    });
    expect(details?.benchmarks.map((benchmark) => benchmark.label)).toEqual([
      'intelligence_index',
      'models/3d',
    ]);
    expect(details?.benchmarks[1]?.values).toEqual([
      { name: 'elo', value: 1395 },
      { name: 'rank', value: 6 },
    ]);
  });

  it('上の段に出さない項目は、入れ子を . でつなぎ、並びを , でつないで残らず並べる', () => {
    const details = modelDetailsOf({
      id: 'a/b',
      name: 'A: B',
      created: 0,
      architecture: { input_modalities: ['text'], tokenizer: 'GPT', instruct_type: null },
      top_provider: { max_completion_tokens: 128000, is_moderated: true },
      supported_parameters: ['tools', 'seed'],
      default_parameters: {},
    });
    expect(details?.others).toEqual([
      { name: 'name', value: 'A: B' },
      { name: 'created', value: '0 (1970-01-01)' },
      { name: 'architecture.tokenizer', value: 'GPT' },
      { name: 'top_provider.max_completion_tokens', value: '128000' },
      { name: 'top_provider.is_moderated', value: 'true' },
      { name: 'supported_parameters', value: 'tools, seed' },
    ]);
  });

  it('付帯情報の無い項目（ほかのサーバー）では作らず、一覧にも入れない', () => {
    expect(modelDetailsOf({ id: 'm', object: 'model' })).toBeNull();
    expect(modelDetailsOf({ id: 'm', object: 'model', created: 1, owned_by: 'me' })).toBeNull();
    const list = parseModelList({
      data: [
        { id: 'plain' },
        { id: 'rich', description: 'd', architecture: { input_modalities: ['text'] } },
      ],
    });
    expect(Object.keys(list.details)).toEqual(['rich']);
    expect(list.details.rich?.inputs).toEqual(['text']);
  });
});
