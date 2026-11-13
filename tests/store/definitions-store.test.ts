import { describe, expect, it, vi } from 'vitest';

import { ComfyRequestError } from '@/comfy/client';
import { searchDefinitions } from '@/graph/search';
import { searchIndexOf } from '@/graph/search-index';
import type { NodeDefinition, NodeDefinitionMap } from '@/graph/types';
import { createMemoryCache, definitionsKey } from '@/store/persist/object-info-cache';
import { createDefinitionsStore, type DefinitionsDeps } from '@/store/use-definitions-store';

import { loadDefinitions } from '../helpers/fixtures';

const BASE_URL = 'http://127.0.0.1:8188';

function withOptions(definition: NodeDefinition): NodeDefinition {
  return {
    ...definition,
    inputs: definition.inputs.map((input) =>
      input.type === 'COMBO' ? { ...input, options: ['euler', 'heun'] } : input,
    ),
  };
}

function makeStore(overrides: Partial<DefinitionsDeps> = {}) {
  const definitions = loadDefinitions();
  const deps: DefinitionsDeps = {
    fetchAll: vi.fn(() => Promise.resolve(definitions)),
    fetchOne: vi.fn((_baseUrl: string, className: string) => {
      const found = definitions.get(className);
      return Promise.resolve(found ? withOptions(found) : null);
    }),
    cache: createMemoryCache(),
    ...overrides,
  };
  return { store: createDefinitionsStore(deps), deps, definitions };
}

function sizeOf(definitions: NodeDefinitionMap): number {
  return definitions.size;
}

describe('ノード定義ストア', () => {
  it('初回はネットワークから取得し、キャッシュに保存する', async () => {
    const { store, deps } = makeStore();

    await store.getState().load(BASE_URL);

    expect(store.getState().status).toBe('ready');
    expect(store.getState().source).toBe('network');
    expect(sizeOf(store.getState().definitions)).toBe(54);
    expect(await deps.cache.load(BASE_URL)).not.toBeNull();
  });

  it('利用頻度の表も取ってキャッシュに残す。取れなくても定義は使う', async () => {
    const { store } = makeStore({
      fetchFrequency: vi.fn(() => Promise.resolve(['KSampler', 'SaveImage'])),
    });
    await store.getState().load(BASE_URL);
    expect(store.getState().frequency).toEqual(['KSampler', 'SaveImage']);

    store.getState().clear();
    await store.getState().load(BASE_URL);
    expect(store.getState().source).toBe('cache');
    expect(store.getState().frequency).toEqual(['KSampler', 'SaveImage']);

    const failing = makeStore({
      fetchFrequency: vi.fn(() => Promise.reject(new Error('404'))),
    }).store;
    await failing.getState().load(BASE_URL);
    expect(failing.getState().status).toBe('ready');
    expect(failing.getState().frequency).toEqual([]);
  });

  it('2回目はキャッシュから読み、ネットワークを叩かない', async () => {
    const { store, deps } = makeStore();

    await store.getState().load(BASE_URL);
    store.getState().clear();
    await store.getState().load(BASE_URL);

    expect(store.getState().source).toBe('cache');
    expect(deps.fetchAll).toHaveBeenCalledTimes(1);
  });

  it('手動リフレッシュは必ず取り直す（自動更新はしない）', async () => {
    const { store, deps } = makeStore();

    await store.getState().load(BASE_URL);
    await store.getState().refresh(BASE_URL);

    expect(deps.fetchAll).toHaveBeenCalledTimes(2);
    expect(store.getState().source).toBe('network');
  });

  it('取得に失敗したら理由を残す', async () => {
    const { store } = makeStore({
      fetchAll: vi.fn(() => Promise.reject(new ComfyRequestError('unreachable', BASE_URL))),
    });

    await store.getState().load(BASE_URL);

    expect(store.getState().status).toBe('error');
    expect(store.getState().error).toMatchObject({
      kind: 'unreachable',
      reasonCode: 'unreachable',
      url: BASE_URL,
    });
  });

  it('COMBO の選択肢を必要になった時点で取り直す', async () => {
    const { store, deps } = makeStore();
    await store.getState().load(BASE_URL);

    expect(store.getState().definitions.get('KSamplerSelect')?.inputs[0]?.options).toBeNull();

    await store.getState().ensureOptions(BASE_URL, 'KSamplerSelect');

    expect(store.getState().definitions.get('KSamplerSelect')?.inputs[0]?.options).toEqual([
      'euler',
      'heun',
    ]);
    expect(deps.fetchOne).toHaveBeenCalledTimes(1);
  });

  // 選択肢だけが変わるので、検索の索引は作り直さずに引き継ぐ。候補は新しい定義を返す
  it('選択肢を取り直しても検索の索引は引き継ぎ、候補は新しい定義を返す', async () => {
    const { store } = makeStore();
    await store.getState().load(BASE_URL);
    const before = store.getState().definitions;

    await store.getState().ensureOptions(BASE_URL, 'KSamplerSelect');
    const after = store.getState().definitions;

    expect(after).not.toBe(before);
    expect(searchIndexOf(after)).toBe(searchIndexOf(before));
    const [found] = searchDefinitions(after, 'KSamplerSelect', { limit: 1 });
    expect(found).toBe(after.get('KSamplerSelect'));
  });

  it('選択肢が揃っていれば取りに行かない', async () => {
    const { store, deps } = makeStore();
    await store.getState().load(BASE_URL);

    await store.getState().ensureOptions(BASE_URL, 'KSamplerSelect');
    await store.getState().ensureOptions(BASE_URL, 'KSamplerSelect');
    await store.getState().ensureOptions(BASE_URL, 'Missing');

    expect(deps.fetchOne).toHaveBeenCalledTimes(1);
  });

  // 画像をアップロードしたときだけの取り直し（自動の取り直しを据え置いている中の例外）
  it('取り直しは選択肢が揃っていても取りに行き、知らないクラスは取らない', async () => {
    const { store, deps } = makeStore();
    await store.getState().load(BASE_URL);
    await store.getState().ensureOptions(BASE_URL, 'KSamplerSelect');

    await store.getState().reloadOptions(BASE_URL, 'KSamplerSelect');
    await store.getState().reloadOptions(BASE_URL, 'Missing');

    expect(deps.fetchOne).toHaveBeenCalledTimes(2);
  });

  it('起動時の読み戻しはキャッシュだけを見て、ネットワークを叩かない', async () => {
    const { store, deps } = makeStore();

    expect(await store.getState().loadCached(BASE_URL)).toBe(false);
    expect(store.getState().status).toBe('idle');

    await deps.cache.save(BASE_URL, loadDefinitions(), 1, ['KSampler']);
    expect(await store.getState().loadCached(BASE_URL)).toBe(true);

    expect(store.getState().source).toBe('cache');
    expect(store.getState().frequency).toEqual(['KSampler']);
    expect(sizeOf(store.getState().definitions)).toBe(54);
    expect(deps.fetchAll).not.toHaveBeenCalled();
  });

  it('読み戻しは読み込み中・読み込み後の定義を上書きしない', async () => {
    const { store, deps } = makeStore();
    await store.getState().load(BASE_URL);
    await deps.cache.save('http://other:8188', new Map(), 1, []);

    expect(await store.getState().loadCached('http://other:8188')).toBe(false);
    expect(sizeOf(store.getState().definitions)).toBe(54);
  });

  it('戻した定義と同じ接続先なら、接続しても読み直さない。別の接続先なら読む', async () => {
    const { store, deps } = makeStore();
    await deps.cache.save(BASE_URL, loadDefinitions(), 1, []);
    await store.getState().loadCached(BASE_URL);
    const restored = store.getState().definitions;
    const cacheLoad = vi.spyOn(deps.cache, 'load');

    await store.getState().load(BASE_URL);
    expect(store.getState().definitions).toBe(restored);
    expect(cacheLoad).not.toHaveBeenCalled();

    await store.getState().load('http://other:8188');
    expect(cacheLoad).toHaveBeenCalledWith('http://other:8188');
  });

  it('同じ接続先の書き方の違い（スキーム・末尾の / ・パス）は 1 件の控えにまとめる', async () => {
    const cache = createMemoryCache();
    await cache.save(BASE_URL, loadDefinitions(), 1, []);
    for (const url of [
      'https://127.0.0.1:8188/',
      'http://127.0.0.1:8188/comfy',
      '127.0.0.1:8188',
    ]) {
      expect(await cache.load(url)).not.toBeNull();
    }
    expect(await cache.load('http://127.0.0.1:8189')).toBeNull();
    expect(definitionsKey('HTTPS://Example.com:443/comfy/')).toBe('example.com');

    const { store, deps } = makeStore({ cache });
    await store.getState().loadCached(BASE_URL);
    const cacheLoad = vi.spyOn(deps.cache, 'load');
    await store.getState().load(`${BASE_URL}/`);
    expect(cacheLoad).not.toHaveBeenCalled();
  });

  it('接続先を切り替えた後に届いた前の接続先の応答では、定義も選択肢も上書きしない', async () => {
    const definitions = loadDefinitions();
    let resolveOld: (value: NodeDefinitionMap) => void = () => undefined;
    const fetchAll = vi.fn((baseUrl: string) =>
      baseUrl === BASE_URL
        ? new Promise<NodeDefinitionMap>((resolve) => (resolveOld = resolve))
        : Promise.resolve(new Map([...definitions].slice(0, 3))),
    );
    const { store } = makeStore({ fetchAll });

    const old = store.getState().load(BASE_URL);
    await store.getState().load('http://other:8188');
    resolveOld(definitions);
    await old;
    expect(store.getState().status).toBe('ready');
    expect(sizeOf(store.getState().definitions)).toBe(3);

    const [className] = [...store.getState().definitions.keys()];
    const before = store.getState().definitions;
    await store.getState().reloadOptions(BASE_URL, className ?? '');
    expect(store.getState().definitions).toBe(before);
  });

  it('控えに書けなくても、取れた定義は使える', async () => {
    const cache = { ...createMemoryCache(), save: () => Promise.reject(new Error('quota')) };
    const { store } = makeStore({ cache });
    await store.getState().load(BASE_URL);
    expect(store.getState().status).toBe('ready');
    expect(store.getState().error).toBeNull();
  });
});
