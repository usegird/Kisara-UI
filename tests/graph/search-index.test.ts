import { describe, expect, it } from 'vitest';

import { searchIndexOf } from '@/graph/search-index';

import { definition, definitionMap, socket } from '../helpers/definitions';

// 検索の索引。定義の入れ物ごとに一度だけ作る

describe('検索の索引', () => {
  const definitions = definitionMap(
    definition('Mix', [socket('a', 'IMAGE,MASK')], { outputs: [{ name: 'out', type: '*' }] }),
  );

  it('同じ入れ物なら作り直さず、同じ索引を返す', () => {
    expect(searchIndexOf(definitions)).toBe(searchIndexOf(definitions));
    expect(searchIndexOf(new Map(definitions))).not.toBe(searchIndexOf(definitions));
  });

  it('カンマで並べた型は 1 つずつに分けて持つ', () => {
    const [entry] = searchIndexOf(definitions).entries;
    expect([...(entry?.inputTypes ?? [])]).toEqual(['IMAGE', 'MASK']);
    expect([...(entry?.outputTypes ?? [])]).toEqual(['*']);
  });
});
