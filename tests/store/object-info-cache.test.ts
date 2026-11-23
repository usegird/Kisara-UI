import { describe, expect, it } from 'vitest';

import { buildNodeDefinitions } from '@/graph/node-definition';
import {
  createMemoryCache,
  forgetDefinitionsOf,
  fromCacheRecord,
  toCacheRecord,
  toDefinitionMap,
} from '@/store/persist/object-info-cache';

import { switchNodeRaw } from '../helpers/definitions';
import { loadDefinitions } from '../helpers/fixtures';

describe('履歴から外した接続先の控え', () => {
  it('ほかに同じ相手が無ければ消し、今の接続先・残る履歴と同じ相手なら残す', async () => {
    const cache = createMemoryCache();
    await cache.save('http://a:8188', loadDefinitions(), 1, []);
    await cache.save('http://b:8188', loadDefinitions(), 1, []);

    await forgetDefinitionsOf('http://a:8188', ['http://b:8188'], () => cache);
    await forgetDefinitionsOf('http://b:8188/', ['https://b:8188'], () => cache);

    expect(await cache.load('http://a:8188')).toBeNull();
    expect(await cache.load('http://b:8188')).not.toBeNull();
  });
});

describe('控えの読み戻し', () => {
  const RAW = {
    Gen: {
      input: {
        required: {
          mode: [
            'COMFY_DYNAMICCOMBO_V3',
            {
              options: [
                { key: 'on', inputs: { required: { temperature: ['FLOAT', { default: 0.7 }] } } },
                { key: 'off', inputs: { required: {} } },
              ],
            },
          ],
        },
      },
      output: [],
      name: 'Gen',
    },
  };

  it('選ぶ欄の組を落とさずに戻す', () => {
    const record = toCacheRecord('http://a:8188', buildNodeDefinitions(RAW));
    const restored = fromCacheRecord(JSON.parse(JSON.stringify(record)));
    const mode = restored && toDefinitionMap(restored).get('Gen')?.inputs[0];

    expect(mode?.branches?.map((branch) => [branch.key, branch.inputs.map((i) => i.name)])).toEqual(
      [
        ['on', ['mode.temperature']],
        ['off', []],
      ],
    );
  });

  it('型が揃う口の組の名前を落とさずに戻す', () => {
    const raw = { ComfySwitchNode: switchNodeRaw() };
    const record = toCacheRecord('http://a:8188', buildNodeDefinitions(raw));
    const restored = fromCacheRecord(JSON.parse(JSON.stringify(record)));
    const read = restored && toDefinitionMap(restored).get('ComfySwitchNode');

    expect(read && read.inputs.map((input) => input.matchType)).toEqual([
      undefined,
      'switch',
      'switch',
    ]);
    expect(read && read.outputs[0]?.matchType).toBe('switch');
  });

  it('前の版の控えは読み捨てる（型が揃う口の組を持たない版を取り直す）', () => {
    const record = toCacheRecord('http://a:8188', buildNodeDefinitions(RAW));

    expect(fromCacheRecord({ ...record, version: 6 })).toBeNull();
  });
});
