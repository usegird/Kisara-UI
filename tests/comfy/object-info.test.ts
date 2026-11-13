import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '@/comfy/client';
import { fetchNodeDefinition, fetchNodeDefinitions } from '@/comfy/object-info';
import { needsOptions } from '@/graph/node-definition';
import {
  createMemoryCache,
  fromCacheRecord,
  toCacheRecord,
  toDefinitionMap,
} from '@/store/persist/object-info-cache';

import { loadDefinitions } from '../helpers/fixtures';

const SUBSET_PATH = fileURLToPath(new URL('../fixtures/object-info.subset.json', import.meta.url));
const subsetText = readFileSync(SUBSET_PATH, 'utf8');

function respondWith(body: string): FetchLike {
  return () => Promise.resolve(new Response(body, { status: 200 }));
}

describe('ノード定義の取得', () => {
  it('取得した /object_info を射影して返す', async () => {
    const definitions = await fetchNodeDefinitions('127.0.0.1:8188', {
      fetchImpl: respondWith(subsetText),
    });

    expect(definitions.size).toBe(54);
    expect(definitions.get('KSamplerSelect')?.inputs[0]?.name).toBe('sampler_name');
  });

  it('全体の射影では COMBO の選択肢を持たない（遅延取得が要る）', () => {
    const definition = loadDefinitions().get('KSamplerSelect');
    expect(definition).toBeDefined();
    if (!definition) return;

    expect(definition.inputs[0]?.options).toBeNull();
    expect(needsOptions(definition)).toBe(true);
  });

  it('単一クラスの取得は選択肢つきの定義を返す', async () => {
    const fetchImpl = vi.fn<FetchLike>(
      respondWith(
        JSON.stringify({
          KSamplerSelect: {
            input: { required: { sampler_name: ['COMBO', { options: ['euler', 'heun'] }] } },
            input_order: { required: ['sampler_name'] },
            output: ['SAMPLER'],
            output_name: ['SAMPLER'],
          },
        }),
      ),
    );

    const definition = await fetchNodeDefinition('127.0.0.1:8188', 'KSamplerSelect', { fetchImpl });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8188/object_info/KSamplerSelect');
    expect(definition?.inputs[0]?.options).toEqual(['euler', 'heun']);
    expect(definition && needsOptions(definition)).toBe(false);
  });

  it('応答に該当クラスが無ければ null', async () => {
    const definition = await fetchNodeDefinition('127.0.0.1:8188', 'Missing', {
      fetchImpl: respondWith('{}'),
    });
    expect(definition).toBeNull();
  });
});

describe('ノード定義のキャッシュ', () => {
  it('保存した形をそのまま読み戻せる', () => {
    const definitions = loadDefinitions();
    const record = toCacheRecord('http://127.0.0.1:8188', definitions, 1000);
    const restored = fromCacheRecord(JSON.parse(JSON.stringify(record)) as unknown);

    expect(restored).not.toBeNull();
    if (!restored) return;

    expect(restored.fetchedAt).toBe(1000);
    expect(toDefinitionMap(restored).size).toBe(definitions.size);
    expect(toDefinitionMap(restored).get('RandomNoise')).toEqual(definitions.get('RandomNoise'));
  });

  it('版が違う・壊れたレコードは黙って使わない', () => {
    const definitions = loadDefinitions();
    const record = toCacheRecord('http://127.0.0.1:8188', definitions);

    expect(fromCacheRecord({ ...record, version: 999 })).toBeNull();
    expect(fromCacheRecord({ ...record, definitions: [] })).toBeNull();
    expect(fromCacheRecord(null)).toBeNull();
    expect(fromCacheRecord({ ...record, baseUrl: 42 })).toBeNull();
  });

  it('メモリキャッシュは保存・読み出し・削除ができる', async () => {
    const cache = createMemoryCache();
    const definitions = loadDefinitions();

    expect(await cache.load('http://a')).toBeNull();

    await cache.save('http://a', definitions, 5);
    expect((await cache.load('http://a'))?.fetchedAt).toBe(5);

    await cache.clear('http://a');
    expect(await cache.load('http://a')).toBeNull();
  });
});
