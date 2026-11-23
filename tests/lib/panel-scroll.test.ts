import { describe, expect, it } from 'vitest';

import {
  fillCardBottoms,
  holdPanelSync,
  INITIAL_PANEL_SYNC,
  panelScrollTop,
  syncPanelScroll,
  type PanelScrollItem,
} from '@/lib/panel-scroll';

const STEP = 49;
const HEIGHT = 43;

function items(cardBottoms: readonly number[]): PanelScrollItem[] {
  return cardBottoms.map((cardBottom, index) => ({
    top: index * STEP,
    height: HEIGHT,
    cardBottom,
  }));
}

function appeared(count: number, total: number): PanelScrollItem[] {
  return items(Array.from({ length: total }, (_, index) => (index < count ? -1 : 900)));
}

describe('変数パネルのスクロール位置', () => {
  const view = 850;

  it('カードがまだ1つも出ていなければ先頭', () => {
    expect(panelScrollTop({ viewHeight: view, appearHeight: view, items: appeared(0, 20) })).toBe(
      0,
    );
  });

  it('17件が収まる高さなら、18件目のカードが出るまで動かない', () => {
    expect(panelScrollTop({ viewHeight: view, appearHeight: view, items: appeared(17, 20) })).toBe(
      0,
    );
  });

  it('18件目の出力欄が現れたら、その変数が入るまで送る', () => {
    expect(panelScrollTop({ viewHeight: view, appearHeight: view, items: appeared(18, 20) })).toBe(
      26,
    );
  });

  it('上へ戻って出力欄が消えたら、その変数も同じだけ下へ戻す', () => {
    const down = panelScrollTop({ viewHeight: view, appearHeight: view, items: appeared(19, 20) });
    const up = panelScrollTop({ viewHeight: view, appearHeight: view, items: appeared(18, 20) });

    expect(down).toBe(75);
    expect(up).toBe(26);
  });

  it('出ている最後のカードの変数がパネル下端に来る', () => {
    const list = appeared(19, 20);
    const scroll = panelScrollTop({ viewHeight: view, appearHeight: view, items: list });
    const lastItem = list[18];

    expect((lastItem?.top ?? 0) + (lastItem?.height ?? 0) - scroll).toBe(view);
  });

  it('出力欄が出たとみなす下限にはフロー全体の表示領域を使う', () => {
    const list = items([...Array.from({ length: 18 }, () => -1), 1000, 1500]);

    expect(panelScrollTop({ viewHeight: view, appearHeight: 1200, items: list })).toBe(75);
  });
});

describe('手動スクロールとの折り合い', () => {
  it('手でずらしたら、全体スクロールが追い付くまで戻さない', () => {
    let state = INITIAL_PANEL_SYNC;

    let result = syncPanelScroll(state, { current: 0, target: 100 });
    expect(result.scroll).toBe(100);
    state = result.state;

    result = syncPanelScroll(state, { current: 20, target: 150 });
    expect(result.scroll).toBeNull();
    state = result.state;

    result = syncPanelScroll(state, { current: 20, target: 300 });
    expect(result.scroll).toBeNull();
    state = result.state;

    result = syncPanelScroll(state, { current: 20, target: 20 });
    expect(result.scroll).toBe(20);
    expect(result.state.manual).toBeNull();
  });

  it('手で先に進めた場合は、全体が追い越したところで再開する', () => {
    let state = syncPanelScroll(INITIAL_PANEL_SYNC, { current: 0, target: 100 }).state;

    let result = syncPanelScroll(state, { current: 400, target: 120 });
    expect(result.scroll).toBeNull();
    state = result.state;

    result = syncPanelScroll(state, { current: 400, target: 399 });
    expect(result.scroll).toBeNull();
    state = result.state;

    result = syncPanelScroll(state, { current: 400, target: 420 });
    expect(result.scroll).toBe(420);
  });

  it('こちらが合わせた位置のままなら連動を続ける', () => {
    const state = syncPanelScroll(INITIAL_PANEL_SYNC, { current: 0, target: 100 }).state;

    const result = syncPanelScroll(state, { current: 100, target: 160 });
    expect(result.scroll).toBe(160);
    expect(result.state.manual).toBeNull();
  });
});

describe('線を押して揃えている間', () => {
  it('送りの途中で連動の位置が揃えた位置を越えても、引き戻さない', () => {
    const state = [280, 300, 320].reduce(
      (_, target) => holdPanelSync(300, target),
      holdPanelSync(300, 280),
    );

    expect(syncPanelScroll(state, { current: 300, target: 320 }).scroll).toBeNull();
  });

  it('送り終わったあと、全体スクロールで連動の位置が揃えた位置まで戻れば連動に戻る', () => {
    const state = holdPanelSync(300, 320);

    expect(syncPanelScroll(state, { current: 300, target: 300 }).scroll).toBe(300);
  });
});

describe('隠したカードの位置', () => {
  it('手前の出ているカードの位置にあるとみなす', () => {
    expect(fillCardBottoms([null, 100, null, null, 300, null])).toEqual([
      Number.NEGATIVE_INFINITY,
      100,
      100,
      100,
      300,
      300,
    ]);
  });

  it('末尾の隠したカードがあっても、上へ送れば連動の位置が戻る', () => {
    const bottoms = fillCardBottoms([
      ...Array.from({ length: 19 }, (_, index) => (index < 18 ? -1 : 900)),
      null,
    ]);

    expect(panelScrollTop({ viewHeight: 850, appearHeight: 850, items: items(bottoms) })).toBe(
      17 * STEP + HEIGHT - 850,
    );
  });
});
