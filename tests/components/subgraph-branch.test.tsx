// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SubgraphBranch, SubgraphHeadLine } from '@/components/comfy/flow/SubgraphBranch';
import type { SubgraphFrame } from '@/graph/subgraph-display';

import { nodeView } from '../helpers/views';

const FRAME: SubgraphFrame = {
  instanceId: 1,
  name: 'sub',
  uses: 1,
  membership: new Map(),
  parents: new Map(),
  groupLabels: [],
};

afterEach(cleanup);

describe('開いた subgraph の点線', () => {
  it('見出しの始まりと下の枝の続きを、カードの左端から同じ位置に引く', () => {
    const head = render(<SubgraphHeadLine />).container.querySelector<HTMLElement>('span');
    const branch = render(
      <SubgraphBranch frame={FRAME} head={nodeView({ id: 1 })} onClose={() => undefined}>
        {null}
      </SubgraphBranch>,
    ).container.querySelector<HTMLElement>('li > span');

    expect(head?.style.left).toBe('-9px');
    expect(branch?.style.left).toBe(head?.style.left);
  });
});
