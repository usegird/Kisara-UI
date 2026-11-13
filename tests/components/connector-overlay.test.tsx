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

// ─────────────────────────────
// 接続線の引き分け（直結か、変数ボックスを経由する 2 本か）。
// jsdom はレイアウトを持たないので、測定結果を直接差し込んで判定だけを見る。
// ─────────────────────────────

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ showPassedLines: false });
});

const rect = anchorRect;

/** 1→2 は両端が画面内。2→3 はカード3の入力行が画面下で切れている */
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
    // パラメタ部分。カード3は下が切れている
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

    // 1→2 は直結済み。変数 1:0 宛の破線も、1:0 からの実線も出ない
    expect(drawn.filter((path) => path.title === 'IMAGE → image' && path.arrow)).toHaveLength(1);
    expect(drawn.filter((path) => path.title === 'Load Image / IMAGE')).toHaveLength(0);
  });

  it('直結できないリンクは、変数宛の破線と入力行への実線で辿らせる', () => {
    const drawn = draw();

    // 2→3 は入力行が画面下で切れているので直結しない
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
    // カード1（接続元）のパラメタ部分だけを画面からはみ出させる（出力の点は見えている）
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
    // 直結したリンクは変数経由にしない（2→3 の 1 本だけが経由）
    expect(titles.filter((title) => title === 'IMAGE → image')).toHaveLength(1);
  });

  it('宛先はパラメータ行さえ見えていれば直結する', () => {
    // カード2（宛先）のパラメタ部分は下が切れているが、image 行そのものは見えている
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
    // カード2の出力も、カード3の入力行も、列の外（下）へ送られている
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
    // 変数 2:0 だけが変数の列の外（下）。消費先のカード 3 の入力行は見えている
    rects.set(inputAnchorKey(3, 'image'), rect(400, 420));
    // 接続元の出力の点が下で欠けているので直結せず、変数を経由させる
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

    // 列の端に寄せず、変数のある高さ（810）から引く
    expect(group?.querySelector('path')?.getAttribute('d')).toMatch(/^M 500 810 /);
    // 横には切らず、両方の列の見えている高さ（0〜600）で切る
    expect([area?.getAttribute('y'), area?.getAttribute('height')]).toEqual(['0', '600']);
  });

  it('カードも変数も見えていなければ、それらを結ぶ線は引かない', () => {
    const base = registry();
    const rects = new Map(base.positions.getState().rects);
    rects.set(outputAnchorKey(2), rect(700, 710));
    rects.set(inputAnchorKey(3, 'image'), rect(900, 920));
    // 変数 2:0 も変数の列の外（下）へ送られている
    rects.set(variableAnchorKey('2:0'), rect(800, 820));
    const { container } = render(
      <AnchorContext.Provider value={fixedAnchors(rects)}>
        <ConnectorOverlay boxes={boxes} />
      </AnchorContext.Provider>,
    );
    const titles = [...container.querySelectorAll('svg > g title')].map((t) => t.textContent);

    // 変数 2:0 から出る線（元のカードへの破線・消費先への実線）はどちらも引かない
    expect(titles).not.toContain('Scale / IMAGE');
    expect(titles).not.toContain('IMAGE → image');
    // 見えているもの同士の直結はそのまま
    expect(titles.some((title) => title?.startsWith('Load Image / IMAGE →'))).toBe(true);
  });

  it('元のカードの位置が分からなければ、カードの列の方へ 3/4 まで引く', () => {
    const base = registry();
    const rects = new Map(base.positions.getState().rects);
    rects.delete(outputAnchorKey(2));
    // 変数の列はカードの列（右端 100）より右
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

    // 変数の左端 500 から、カードの列の右端 100 までの 3/4（300）左で見切る
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
  /** カード3の入力行を `top` へ送って、引いた線の題名を集める */
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
    // カード 3 の行が下で切れているので、2 の出力は変数を経由する（点線）
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

  /**
   * 左の列の枠（右端 100）の項目は見えていて、カードの行は位置 targetTop にある。
   * `appBottom` は左の列の見えている範囲の下端（狭い画面では中身の高さで止まる）
   */
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

    // 列の端に寄せず、行のある高さ（-390）へ向かう
    expect(d).toMatch(/ 300 -390$/);
    expect(line?.getAttribute('clip-path')).toMatch(/^url\(#kisara-clip-/);
  });

  it('左の列の底より下もカードの列が見えていれば、そこまで線を見せる（狭い画面）', () => {
    const line = drawApp(5000, 300);
    const id = /#([^)]+)\)/.exec(line?.getAttribute('clip-path') ?? '')?.[1] ?? '';
    const clip = document.getElementById(id)?.querySelector('rect');
    const viewport = registry().positions.getState().rects.get(VIEWPORT_ANCHOR_KEY);

    // 見切る高さは左の列（0〜300）ではなく、カードの列の見えている下端まで
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
