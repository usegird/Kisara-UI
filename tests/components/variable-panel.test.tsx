// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  AnchorContext,
  cardAnchorKey,
  PANEL_ANCHOR_KEY,
  VIEWPORT_ANCHOR_KEY,
} from '@/components/comfy/flow/anchor-context';
import { VariablePanel } from '@/components/comfy/flow/VariablePanel';
import { groupHeight, VARIABLE_PANEL_METRICS } from '@/graph/variable-panel-metrics';
import type { VariableGroup } from '@/graph/variables';
import type { AnchorRect, AnchorRegistry } from '@/hooks/ui/use-anchor-registry';

import { fixedAnchors } from '../helpers/anchors';

const PANEL_HEIGHT = 300;
const VIEWPORT_HEIGHT = 400;
const CARD_STEP = 200;

beforeAll(() => {
  const values = new WeakMap<Element, number>();
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return values.get(this) ?? 0;
    },
    set(this: HTMLElement, value: number) {
      values.set(this, value);
    },
  });
});

afterEach(() => {
  cleanup();
});

function rect(top: number, height: number): AnchorRect {
  return { left: 0, right: 200, top, bottom: top + height, centerY: top + height / 2 };
}

function groups(count: number): VariableGroup[] {
  return Array.from({ length: count }, (_, index) => ({
    nodeId: index + 1,
    index: String(index + 1),
    label: `node ${index + 1}`,
    disabled: false,
    boxes: [
      {
        key: `${index + 1}:0`,
        nodeId: index + 1,
        slot: 0,
        name: 'IMAGE',
        type: 'IMAGE',
        sourceLabel: `node ${index + 1}`,
        values: [],
        muted: false,
        targets: [],
      },
    ],
  }));
}

function registry(count: number, scrolled: number): AnchorRegistry {
  const rects = new Map<string, AnchorRect>();
  rects.set(PANEL_ANCHOR_KEY, rect(scrolled, PANEL_HEIGHT));
  rects.set(VIEWPORT_ANCHOR_KEY, rect(scrolled, VIEWPORT_HEIGHT));
  for (let index = 0; index < count; index += 1) {
    rects.set(cardAnchorKey(index + 1), rect(index * CARD_STEP, 40));
  }

  return fixedAnchors(rects);
}

function renderPanel(count: number, scrolled: number) {
  const list = groups(count);
  const view = render(
    <AnchorContext.Provider value={registry(count, scrolled)}>
      <VariablePanel groups={list} width={224} />
    </AnchorContext.Provider>,
  );
  const panel = view.container.querySelector('.overflow-y-auto') as HTMLElement;

  return {
    panel,
    scrollTo: (next: number): void => {
      view.rerender(
        <AnchorContext.Provider value={registry(count, next)}>
          <VariablePanel groups={list} width={224} />
        </AnchorContext.Provider>,
      );
    },
  };
}

describe('変数パネルの連動スクロール', () => {
  const capacity = Math.floor((PANEL_HEIGHT - groupHeight(1)) / 49) + 1;

  it('収まっているうちは動かない', () => {
    const { panel } = renderPanel(capacity, 0);
    expect(panel.scrollTop).toBe(0);
  });

  it('出力欄が現れたカードの変数が見えるところまで送る', () => {
    const { panel, scrollTo } = renderPanel(12, 0);
    expect(panel.scrollTop).toBe(0);

    scrollTo(1200);
    expect(panel.scrollTop).toBeGreaterThan(0);
  });

  it('戻して出力欄が消えたら、その変数も戻す', () => {
    const { panel, scrollTo } = renderPanel(12, 0);

    scrollTo(1200);
    const down = panel.scrollTop;
    scrollTo(600);
    const up = panel.scrollTop;

    expect(down).toBeGreaterThan(up);
    scrollTo(0);
    expect(panel.scrollTop).toBe(0);
  });

  it('パネルを手で動かした位置には介入しない', () => {
    const { panel, scrollTo } = renderPanel(12, 0);
    scrollTo(1200);
    expect(panel.scrollTop).toBeGreaterThan(0);

    panel.scrollTop = 0;
    scrollTo(1200);
    expect(panel.scrollTop).toBe(0);
  });

  it('手で戻した位置に全体スクロールが追い付くまで連動を止める', () => {
    const { panel, scrollTo } = renderPanel(12, 0);
    scrollTo(1200);

    panel.scrollTop = 0;

    scrollTo(1600);
    expect(panel.scrollTop).toBe(0);

    scrollTo(0);
    expect(panel.scrollTop).toBe(0);
    scrollTo(1600);
    expect(panel.scrollTop).toBeGreaterThan(0);
  });
});

describe('変数からノードを追加', () => {
  it('枠の左外の ◀ で、その変数を受け取るノードを足す', () => {
    const calls: [number, number, string][] = [];
    render(
      <AnchorContext.Provider value={registry(1, 0)}>
        <VariablePanel
          groups={groups(1)}
          width={224}
          onAddAfter={(id, slot, type) => calls.push([id, slot, type])}
        />
      </AnchorContext.Provider>,
    );

    fireEvent.click(screen.getByLabelText('IMAGE の先にノードを追加'));

    expect(calls).toEqual([[1, 0, 'IMAGE']]);
  });

  it('渡されなければ出さない', () => {
    render(
      <AnchorContext.Provider value={registry(1, 0)}>
        <VariablePanel groups={groups(1)} width={224} />
      </AnchorContext.Provider>,
    );

    expect(screen.queryByLabelText('IMAGE の先にノードを追加')).toBeNull();
  });
});

describe('見出しからカードへ送る', () => {
  it('まとまりの見出しをダブルクリックすると、生成元のノードを渡す', () => {
    const calls: number[] = [];
    render(
      <AnchorContext.Provider value={registry(2, 0)}>
        <VariablePanel groups={groups(2)} width={224} onReveal={(id) => calls.push(id)} />
      </AnchorContext.Provider>,
    );

    fireEvent.doubleClick(screen.getByTitle('node 2（ダブルクリックでカードへ送る）'));

    expect(calls).toEqual([2]);
  });
});

describe('カードのグループの帯', () => {
  const { FRAME_TAB_HEIGHT, FRAME_PADDING, FRAME_SIDE_PADDING, GROUP_GAP, LEFT_GUTTER } =
    VARIABLE_PANEL_METRICS;
  const groupOf = new Map([
    [1, 0],
    [2, 0],
  ]);
  const labels = [{ key: '7', title: 'Load models', color: '#8A8' }];

  function topOf(name: string): number {
    const item = screen.getByText(name).closest<HTMLElement>('[data-flow-item]');
    return Number.parseFloat(item?.style.top ?? '');
  }

  it('同じグループのまとまりを、タブ付きの帯で囲む（先頭はタブと余白のぶん下がる）', () => {
    render(
      <AnchorContext.Provider value={registry(3, 0)}>
        <VariablePanel groups={groups(3)} width={224} groupOf={groupOf} groupLabels={labels} />
      </AnchorContext.Provider>,
    );

    expect(screen.getByText('Load models')).not.toBeNull();
    expect(topOf('node 1')).toBe(FRAME_TAB_HEIGHT + FRAME_PADDING);
    expect(topOf('node 2')).toBe(topOf('node 1') + groupHeight(1) + GROUP_GAP);
    expect(topOf('node 3')).toBe(topOf('node 2') + groupHeight(1) + FRAME_PADDING + GROUP_GAP);
  });

  it('帯はまとまりの手前に置き、グループの色で塗る', () => {
    const { container } = render(
      <AnchorContext.Provider value={registry(3, 0)}>
        <VariablePanel groups={groups(3)} width={224} groupOf={groupOf} groupLabels={labels} />
      </AnchorContext.Provider>,
    );

    const band = screen.getByText('Load models').closest<HTMLElement>('[data-flow-item]');
    const first = screen.getByText('node 1').closest<HTMLElement>('[data-flow-item]');
    const items = [...container.querySelectorAll('[data-flow-item]')];
    expect(items.indexOf(band as Element)).toBeLessThan(items.indexOf(first as Element));
    expect(band?.style.top).toBe('0px');
    expect(band?.style.left).toBe(`${String(LEFT_GUTTER - FRAME_SIDE_PADDING)}px`);
    expect(band?.style.right).toBe('0px');
    expect(first?.style.right).toBe(`${String(FRAME_SIDE_PADDING)}px`);
    expect(band?.querySelector<HTMLElement>('[aria-hidden]')?.style.backgroundColor).toContain(
      '136, 170, 136',
    );
  });

  it('タブをダブルクリックすると、グループの鍵を渡す', () => {
    const calls: string[] = [];
    render(
      <AnchorContext.Provider value={registry(3, 0)}>
        <VariablePanel
          groups={groups(3)}
          width={224}
          groupOf={groupOf}
          groupLabels={labels}
          onRevealGroup={(key) => calls.push(key)}
        />
      </AnchorContext.Provider>,
    );

    fireEvent.doubleClick(
      screen.getByTitle('Load models（ダブルクリックでグループのカードへ送る）'),
    );

    expect(calls).toEqual(['7']);
  });

  it('渡されなければタブの説明は名前だけ', () => {
    render(
      <AnchorContext.Provider value={registry(3, 0)}>
        <VariablePanel groups={groups(3)} width={224} groupOf={groupOf} groupLabels={labels} />
      </AnchorContext.Provider>,
    );

    expect(screen.getByText('Load models').title).toBe('Load models');
  });
});

describe('無効なノードの変数', () => {
  it('生成元が無効（ミュート・バイパス）なら、見出しに取り消し線を引く', () => {
    const [first] = groups(1);
    if (!first) throw new Error('まとまりが無い');
    render(
      <AnchorContext.Provider value={registry(1, 0)}>
        <VariablePanel groups={[{ ...first, disabled: true }]} width={224} />
      </AnchorContext.Provider>,
    );

    expect(screen.getByText('node 1').className).toContain('line-through');
  });
});
