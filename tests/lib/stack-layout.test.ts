import { describe, expect, it } from 'vitest';

import { packList } from '@/lib/stack-layout';

describe('packList', () => {
  it('与えられた順に、高さと間隔で詰める', () => {
    const positions = packList(
      [
        { key: 'a', height: 10 },
        { key: 'b', height: 20 },
        { key: 'c', height: 5 },
      ],
      { gap: 4 },
    );
    expect([...positions.values()]).toEqual([0, 14, 38]);
  });

  it('before は上に、after は下に足して空ける（帯のタブと余白）', () => {
    const positions = packList(
      [
        { key: 'a', height: 10 },
        { key: 'b', height: 10, before: 7 },
        { key: 'c', height: 10, after: 3 },
        { key: 'd', height: 10 },
      ],
      { gap: 4 },
    );
    expect([...positions.values()]).toEqual([0, 21, 35, 52]);
  });
});
