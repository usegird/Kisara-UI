// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AnchorContext,
  APP_VIEWPORT_ANCHOR_KEY,
  appCardAnchorKey,
  appSourceAnchorKey,
  appTargetAnchorKey,
  bodyAnchorKey,
  cardAnchorKey,
  inputAnchorKey,
  outputAnchorKey,
  PANEL_ANCHOR_KEY,
  variableAnchorKey,
  VIEWPORT_ANCHOR_KEY,
} from '@/components/comfy/flow/anchor-context';
import { ConnectorOverlay } from '@/components/comfy/flow/ConnectorOverlay';
import type { AppInputGroup } from '@/graph/app-input-order';
import type { VariableBox } from '@/graph/variables';
import type { AnchorRect, AnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { useSettingsStore } from '@/store/use-settings-store';

import { anchorRect, fixedAnchors } from '../helpers/anchors';
import { nodeRow } from '../helpers/views';

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ showPassedLines: false });
});

const rect = anchorRect;

function registry(): AnchorRegistry {
  const rects = new Map<string, AnchorRect>([
    [VIEWPORT_ANCHOR_KEY, rect(0, 600)],
    [PANEL_ANCHOR_KEY, rect(0, 600)],
    [cardAnchorKey(1), rect(10, 100)],
    [cardAnchorKey(2), rect(200, 300)],
    [cardAnchorKey(3), rect(560, 900)],
    [outputAnchorKey(1), rect(90, 100)],
    [outputAnchorKey(2), rect(290, 300)],
    [inputAnchorKey(2, 'image'), rect(210, 230)],
    [inputAnchorKey(3, 'image'), rect(590, 610)],
    [bodyAnchorKey(1), rect(20, 80)],
    [bodyAnchorKey(2), rect(205, 285)],
    [bodyAnchorKey(3), rect(570, 880)],
    [variableAnchorKey('1:0'), rect(0, 20)],
    [variableAnchorKey('2:0'), rect(30, 50)],
  ]);

  return fixedAnchors(rects);
}

const boxes: VariableBox[] = [
  {
    key: '1:0',
    nodeId: 1,
    slot: 0,
    name: 'IMAGE',
    type: 'IMAGE',
    sourceLabel: 'Load Image',
    values: [{ text: 'a.png', label: 'a.png', bypassed: false }],
    muted: false,
    targets: [{ nodeId: 2, inputName: 'image' }],
  },
  {
    key: '2:0',
    nodeId: 2,
    slot: 0,
    name: 'IMAGE',
    type: 'IMAGE',
    sourceLabel: 'Scale',
    values: [],
    muted: false,
    targets: [{ nodeId: 3, inputName: 'image' }],
  },
];

function paths(
  container: HTMLElement,
): { title: string; arrow: boolean; width: string; dash: string | null }[] {
  return [...container.querySelectorAll('svg > g')].map((group) => {
    const path = group.querySelector('path:last-of-type');
    return {
      title: group.querySelector('title')?.textContent ?? '',
      arrow: path?.getAttribute('marker-end') !== null,
      width: path?.getAttribute('stroke-width') ?? '',
      dash: path?.getAttribute('stroke-dasharray') ?? null,
    };
  });
}

function draw(): { title: string; arrow: boolean; width: string; dash: string | null }[] {
  const { container } = render(
    <AnchorContext.Provider value={registry()}>
      <ConnectorOverlay boxes={boxes} />
    </AnchorContext.Provider>,
  );
  return paths(container);
}

describe('接続線の引き分け', () => {
  it('両端の行が丸ごと画面内なら直結する（矢印つき）', () => {
    const direct = draw().filter((path) => path.title.startsWith('Load Image'));

    expect(direct).toHaveLength(1);
    expect(direct[0]?.arrow).toBe(true);
    expect(direct[0]?.width).toBe('1.2');
    expect(direct[0]?.dash).toBeNull();
  });

  it('直結したリンクには変数経由の線も破線も引かない', () => {
    const drawn = draw();

    expect(drawn.filter((path) => path.title === 'IMAGE → image' && path.arrow)).toHaveLength(1);
    expect(drawn.filter((path) => path.title === 'Load Image / IMAGE')).toHaveLength(0);
  });

  it('直結できないリンクは、変数宛の破線と入力行への実線で辿らせる', () => {
    const drawn = draw();

    expect(drawn.some((path) => path.title.startsWith('Scale / IMAGE →'))).toBe(false);

    const dashed = drawn.filter((path) => path.dash === '4 3');
    expect(dashed).toHaveLength(1);
    expect(dashed[0]?.title).toBe('Scale / IMAGE');
    expect(dashed[0]?.width).toBe('0.6');
    expect(dashed[0]?.arrow).toBe(false);

    const solid = drawn.filter((path) => path.title === 'IMAGE → image' && path.arrow);
    expect(solid).toHaveLength(1);
    expect(solid[0]?.width).toBe('1.5');
  });

  it('接続元のパラメタが欠けていても、出力と受ける行が見えていれば直結する', () => {
    const cutSource = (): AnchorRegistry => {
      const base = registry();
      const rects = new Map(base.positions.getState().rects);
      rects.set(bodyAnchorKey(1), rect(20, 620));
      return fixedAnchors(rects);
    };

    const { container } = render(
      <AnchorContext.Provider value={cutSource()}>
        <ConnectorOverlay boxes={boxes} />
      </AnchorContext.Provider>,
    );

    const titles = [...container.querySelectorAll('svg title')].map((node) => node.textContent);
    expect(titles.some((title) => title === 'Load Image / IMAGE → image')).toBe(true);
    expect(titles.filter((title) => title === 'IMAGE → image')).toHaveLength(1);
  });

  it('宛先はパラメータ行さえ見えていれば直結する', () => {
    const cutTarget = (): AnchorRegistry => {
      const base = registry();
      const rects = new Map(base.positions.getState().rects);
      rects.set(bodyAnchorKey(2), rect(205, 620));
      return fixedAnchors(rects);
    };

    const { container } = render(
      <AnchorContext.Provider value={cutTarget()}>
        <ConnectorOverlay boxes={boxes} />
      </AnchorContext.Provider>,
    );

    const titles = [...container.querySelectorAll('svg title')].map((node) => node.textContent);
    expect(titles.some((title) => title === 'Load Image / IMAGE → image')).toBe(true);
  });

  it('見えていないカードへも、あるはずの位置へ向けて引き、カードの列の高さで見切る', () => {
    const base = registry();
    const rects = new Map(base.positions.getState().rects);
    rects.set(outputAnchorKey(2), rect(700, 710));
    rects.set(inputAnchorKey(3, 'image'), rect(900, 920));
    const { container } = render(
      <AnchorContext.Provider value={fixedAnchors(rects)}>
        <ConnectorOverlay boxes={boxes} />
      </AnchorContext.Provider>,
    );
    const clipped = (title: string): string | null | undefined =>
      [...container.querySelectorAll('svg > g')]
        .find((group) => group.querySelector('title')?.textContent === title)
        ?.getAttribute('clip-path');

    expect(clipped('Scale / IMAGE')).toMatch(/^url\(#kisara-clip-/);
    expect(clipped('IMAGE → image')).toMatch(/^url\(#kisara-clip-/);
    expect(container.querySelector('clipPath rect')?.getAttribute('height')).toBe('600');
  });

  it('見えていない変数からの線は、変数の実際の位置へ向けて引き、列の見えている高さで見切る', () => {
    const base = registry();
    const rects = new Map(base.positions.getState().rects);
    rects.set(inputAnchorKey(3, 'image'), rect(400, 420));
    rects.set(outputAnchorKey(2), rect(595, 605));
    rects.set(variableAnchorKey('2:0'), {
      left: 500,
      right: 600,
      top: 800,
      bottom: 820,
      centerY: 810,
    });
    const { container } = render(
      <AnchorContext.Provider value={fixedAnchors(rects)}>
        <ConnectorOverlay boxes={boxes} />
      </AnchorContext.Provider>,
    );
    const group = [...container.querySelectorAll('svg > g')].find(
      (g) => g.querySelector('title')?.textContent === 'IMAGE → image',
    );
    const clipId = /url\(#(.+)\)/.exec(group?.getAttribute('clip-path') ?? '')?.[1] ?? '';
    const area = container.querySelector(`clipPath[id="${clipId}"] rect`);

    expect(group?.querySelector('path')?.getAttribute('d')).toMatch(/^M 500 810 /);
    expect([area?.getAttribute('y'), area?.getAttribute('height')]).toEqual(['0', '600']);
  });

  it('カードも変数も見えていなければ、それらを結ぶ線は引かない', () => {
    const base = registry();
    const rects = new Map(base.positions.getState().rects);
    rects.set(outputAnchorKey(2), rect(700, 710));
    rects.set(inputAnchorKey(3, 'image'), rect(900, 920));
    rects.set(variableAnchorKey('2:0'), rect(800, 820));
    const { container } = render(
      <AnchorContext.Provider value={fixedAnchors(rects)}>
        <ConnectorOverlay boxes={boxes} />
      </AnchorContext.Provider>,
    );
    const titles = [...container.querySelectorAll('svg > g title')].map((t) => t.textContent);

    expect(titles).not.toContain('Scale / IMAGE');
    expect(titles).not.toContain('IMAGE → image');
    expect(titles.some((title) => title?.startsWith('Load Image / IMAGE →'))).toBe(true);
  });

  it('元のカードの位置が分からなければ、カードの列の方へ 3/4 まで引く', () => {
    const base = registry();
    const rects = new Map(base.positions.getState().rects);
    rects.delete(outputAnchorKey(2));
    rects.set(variableAnchorKey('2:0'), {
      left: 500,
      right: 600,
      top: 30,
      bottom: 50,
      centerY: 40,
    });
    const { container } = render(
      <AnchorContext.Provider value={fixedAnchors(rects)}>
        <ConnectorOverlay boxes={boxes} />
      </AnchorContext.Provider>,
    );
    const stub = [...container.querySelectorAll('svg > g')].find(
      (group) => group.querySelector('title')?.textContent === 'Scale / IMAGE',
    );

    expect(stub?.querySelector('path')?.getAttribute('d')).toMatch(/^M 200 40 /);
  });

  it('使われていない変数には破線を引かない', () => {
    const unused = [{ ...boxes[0]!, key: '9:0', nodeId: 9, targets: [] }];
    const { container } = render(
      <AnchorContext.Provider value={registry()}>
        <ConnectorOverlay boxes={unused} />
      </AnchorContext.Provider>,
    );

    expect(container.querySelectorAll('svg path[stroke-dasharray]')).toHaveLength(0);
  });
});

describe('上へ過ぎた宛先への線', () => {
  function titlesWithTargetAt(top: number): string[] {
    const rects = new Map(registry().positions.getState().rects);
    rects.set(inputAnchorKey(3, 'image'), rect(top, top + 20));
    const { container } = render(
      <AnchorContext.Provider value={fixedAnchors(rects)}>
        <ConnectorOverlay boxes={boxes} />
      </AnchorContext.Provider>,
    );
    return paths(container).map((path) => path.title);
  }

  it('既定では隠す。宛先がすべて上へ過ぎた変数は、出力からの破線も隠す', () => {
    const titles = titlesWithTargetAt(-200);
    expect(titles).not.toContain('IMAGE → image');
    expect(titles).not.toContain('Scale / IMAGE');
  });

  it('下にある宛先への線と破線は隠さない', () => {
    const titles = titlesWithTargetAt(900);
    expect(titles).toContain('IMAGE → image');
    expect(titles).toContain('Scale / IMAGE');
  });

  it('切り替えで出す', () => {
    useSettingsStore.setState({ showPassedLines: true });
    const titles = titlesWithTargetAt(-200);
    expect(titles).toContain('IMAGE → image');
    expect(titles).toContain('Scale / IMAGE');
  });
});

describe('列の外のカードとの線（デモ）', () => {
  function titlesAt(set: (rects: Map<string, AnchorRect>) => void): string[] {
    const rects = new Map(registry().positions.getState().rects);
    set(rects);
    const { container } = render(
      <AnchorContext.Provider value={fixedAnchors(rects)}>
        <ConnectorOverlay boxes={boxes} offscreenLines={false} />
      </AnchorContext.Provider>,
    );
    return paths(container).map((path) => path.title);
  }

  it('出す側が見えていれば、列の下へ出た受ける行へも破線と実線を引く', () => {
    const titles = titlesAt((rects) => rects.set(inputAnchorKey(3, 'image'), rect(900, 920)));
    expect(titles).toContain('IMAGE → image');
    expect(titles).toContain('Scale / IMAGE');
  });

  it('出す側も受ける側も列の外なら、どちらの線も引かない', () => {
    const titles = titlesAt((rects) => {
      rects.set(outputAnchorKey(2), rect(-200, -190));
      rects.set(bodyAnchorKey(2), rect(-300, -195));
      rects.set(inputAnchorKey(3, 'image'), rect(900, 920));
    });
    expect(titles).not.toContain('IMAGE → image');
    expect(titles).not.toContain('Scale / IMAGE');
  });

  it('元のカードが列の外なら破線を引かず、見えている宛先への線は引く', () => {
    const titles = titlesAt((rects) => {
      rects.set(outputAnchorKey(2), rect(-200, -190));
      rects.set(bodyAnchorKey(2), rect(-300, -195));
      rects.set(inputAnchorKey(3, 'image'), rect(400, 420));
    });
    expect(titles).toContain('IMAGE → image');
    expect(titles).not.toContain('Scale / IMAGE');
  });

  it('両端が見えていれば引く', () => {
    const titles = titlesAt((rects) => rects.set(bodyAnchorKey(2), rect(205, 620)));
    expect(titles).toContain('IMAGE → image');
    expect(titles).toContain('Scale / IMAGE');
  });
});

describe('線の右クリック', () => {
  it('ノードを追加は ⊕ と同じ先を渡し、接続を削除はその結線を外す', async () => {
    const onInsert = vi.fn();
    const onDisconnect = vi.fn();
    const linked = boxes.map((box, index) => ({
      ...box,
      targets: box.targets.map((target) => ({ ...target, linkId: 10 + index })),
    }));
    const { container, findByText } = render(
      <AnchorContext.Provider value={registry()}>
        <ConnectorOverlay boxes={linked} onInsert={onInsert} onDisconnect={onDisconnect} />
      </AnchorContext.Provider>,
    );
    const hit = (): Element =>
      [...container.querySelectorAll('svg > g')]
        .find((g) => g.querySelector('title')?.textContent?.startsWith('Load Image / IMAGE →'))
        ?.querySelector('path') as Element;

    fireEvent.contextMenu(hit());
    fireEvent.click(await findByText('ノードを追加'));
    expect(onInsert).toHaveBeenCalledWith({ linkIds: [10], type: 'IMAGE' });

    fireEvent.contextMenu(hit());
    fireEvent.click(await findByText('接続を削除'));
    expect(onDisconnect).toHaveBeenCalledWith([10]);
  });
});

describe('線の ⊕', () => {
  it('結線を指すと真ん中に ⊕ を出し、押すとその結線を挟む先として渡す', () => {
    const onInsert = vi.fn();
    const linked = boxes.map((box, index) => ({
      ...box,
      targets: box.targets.map((target) => ({ ...target, linkId: 10 + index })),
    }));
    const { container, getByLabelText } = render(
      <AnchorContext.Provider value={registry()}>
        <ConnectorOverlay boxes={linked} onInsert={onInsert} />
      </AnchorContext.Provider>,
    );
    const direct = [...container.querySelectorAll('svg > g')].find((g) =>
      g.querySelector('title')?.textContent?.startsWith('Load Image / IMAGE →'),
    );
    fireEvent.mouseEnter(direct?.querySelector('path') as Element);
    fireEvent.click(getByLabelText(/^Load Image \/ IMAGE → image の間にノードを挟む$/));

    expect(onInsert).toHaveBeenCalledWith({ linkIds: [10], type: 'IMAGE' });
  });

  it('出力から変数への点線にも出す。先が 1 本でもその結線を挟む。色は線と同じ', () => {
    const onInsert = vi.fn();
    const linked = boxes.map((box, index) => ({
      ...box,
      targets: box.targets.map((target) => ({ ...target, linkId: 10 + index })),
    }));
    const { container, getByLabelText } = render(
      <AnchorContext.Provider value={registry()}>
        <ConnectorOverlay boxes={linked} onInsert={onInsert} />
      </AnchorContext.Provider>,
    );
    const dashed = [...container.querySelectorAll('svg > g')].find(
      (g) => g.querySelector('title')?.textContent === 'Scale / IMAGE',
    );
    fireEvent.mouseEnter(dashed?.querySelector('path') as Element);
    const plus = getByLabelText('Scale / IMAGE の間にノードを挟む');
    const line = dashed?.querySelector('path:last-of-type')?.getAttribute('stroke');

    expect(plus.style.color).toBe(line);
    fireEvent.click(plus);
    expect(onInsert).toHaveBeenCalledWith({ linkIds: [11], type: 'IMAGE' });
  });
});

describe('アプリ入力からカードへの線', () => {
  const group: AppInputGroup = {
    key: '2:seed',
    nodeId: 2,
    index: '2',
    label: 'Scale',
    comment: '',
    rows: [nodeRow({ name: 'seed', widgetName: 'seed' })],
  };

  function drawApp(targetTop: number, appBottom = 600): Element | undefined {
    const base = registry();
    const rects = new Map(base.positions.getState().rects);
    rects.set(APP_VIEWPORT_ANCHOR_KEY, rect(0, appBottom));
    rects.set(appCardAnchorKey(group.key), rect(100, 200));
    rects.set(appSourceAnchorKey(2, 'seed'), rect(140, 160));
    rects.set(appTargetAnchorKey(2, 'seed'), {
      left: 300,
      right: 320,
      top: targetTop,
      bottom: targetTop + 20,
      centerY: targetTop + 10,
    });
    const { container } = render(
      <AnchorContext.Provider value={fixedAnchors(rects)}>
        <ConnectorOverlay boxes={[]} appGroups={[group]} />
      </AnchorContext.Provider>,
    );
    return [...container.querySelectorAll('svg > g')].find(
      (g) => g.querySelector('title')?.textContent === 'アプリ入力 → seed',
    );
  }

  it('両端が見えていれば見切らない', () => {
    expect(drawApp(300)?.getAttribute('clip-path')).toBeNull();
  });

  it('カードの行が列の上へ送られていれば、あるはずの位置へ引いて列の上端で見切る', () => {
    const line = drawApp(-400);
    const d = line?.querySelector('path')?.getAttribute('d') ?? '';

    expect(d).toMatch(/ 300 -390$/);
    expect(line?.getAttribute('clip-path')).toMatch(/^url\(#kisara-clip-/);
  });

  it('左の列の底より下もカードの列が見えていれば、そこまで線を見せる（狭い画面）', () => {
    const line = drawApp(5000, 300);
    const id = /#([^)]+)\)/.exec(line?.getAttribute('clip-path') ?? '')?.[1] ?? '';
    const clip = document.getElementById(id)?.querySelector('rect');
    const viewport = registry().positions.getState().rects.get(VIEWPORT_ANCHOR_KEY);

    expect(Number(clip?.getAttribute('y')) + Number(clip?.getAttribute('height'))).toBe(
      viewport?.bottom,
    );
  });
});

describe('線を押す', () => {
  it('変数とカードを結ぶ線は、変数の列とカードの列を揃える高さを渡す。直結の弧は渡さない', () => {
    const onAlign = vi.fn();
    const { container } = render(
      <AnchorContext.Provider value={registry()}>
        <ConnectorOverlay boxes={boxes} onAlign={onAlign} />
      </AnchorContext.Provider>,
    );
    const hitOf = (title: string): Element | undefined =>
      [...container.querySelectorAll('svg path')].find(
        (path) => path.querySelector('title')?.textContent === title,
      );

    fireEvent.click(hitOf('Scale / IMAGE') as Element, { clientY: 40 });
    expect(onAlign).toHaveBeenLastCalledWith(
      'variables',
      expect.any(Number),
      expect.any(Number),
      40,
    );

    onAlign.mockClear();
    fireEvent.click(hitOf('Load Image / IMAGE → image') as Element, { clientY: 40 });
    expect(onAlign).not.toHaveBeenCalled();
  });
});

describe('線の鍵', () => {
  it('同じ入力名の消費先が重なっても鍵を重ねない（古い線が消え残らない）', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const doubled = [{ ...boxes[0]!, targets: [...boxes[0]!.targets, ...boxes[0]!.targets] }];
    render(
      <AnchorContext.Provider value={registry()}>
        <ConnectorOverlay boxes={doubled} />
      </AnchorContext.Provider>,
    );

    const keyWarnings = error.mock.calls.filter((call) => String(call[0]).includes('same key'));
    expect(keyWarnings).toHaveLength(0);
    error.mockRestore();
  });
});
