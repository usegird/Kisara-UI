import { describe, expect, it } from 'vitest';

import {
  APP_VIEWPORT_ANCHOR_KEY,
  appCardAnchorKey,
  appSourceAnchorKey,
  appTargetAnchorKey,
  inputAnchorKey,
  outputAnchorKey,
  PANEL_ANCHOR_KEY,
  variableAnchorKey,
  VIEWPORT_ANCHOR_KEY,
} from '@/components/comfy/flow/anchor-context';
import { APP_LINE_TYPE } from '@/components/comfy/flow/connector-app-lines';
import {
  buildConnectors,
  insertPoint,
  pathOf,
  type Connector,
  type VariableLineOptions,
} from '@/components/comfy/flow/connector-geometry';
import type { AppInputGroup } from '@/graph/app-input-order';
import { scopedId } from '@/graph/subgraph-level';
import type { VariableBox } from '@/graph/variables';
import type { AnchorRect, Rects } from '@/hooks/ui/use-anchor-registry';
import { arcPath, bezierPath } from '@/lib/bezier';

import { anchorRect } from '../helpers/anchors';
import { nodeRow } from '../helpers/views';

// ─────────────────────────────
// 接続線の幾何（位置の表 → 線の一覧・⊕ の置き場所）。描画を通さず、純関数だけを見る
// ─────────────────────────────

const OPTIONS: VariableLineOptions = {
  showPassed: false,
  chipOutputs: false,
  offscreenLines: true,
};
const NO_PROXY_ROWS = new Map();

const rect = anchorRect;

/** 1 の出力から 2 の image へ。結線 7 */
const box: VariableBox = {
  key: '1:0',
  nodeId: 1,
  slot: 0,
  name: 'IMAGE',
  type: 'IMAGE',
  sourceLabel: 'Load Image',
  values: [],
  muted: false,
  targets: [{ nodeId: 2, inputName: 'image', linkId: 7 }],
};

/** 列と変数の位置。`output` を変えて、出す側のカードが見えているかを切り替える */
function rectsWith(output: AnchorRect): Map<string, AnchorRect> {
  return new Map([
    [VIEWPORT_ANCHOR_KEY, rect(0, 600)],
    [PANEL_ANCHOR_KEY, rect(0, 600, 400, 600)],
    [outputAnchorKey(1), output],
    [inputAnchorKey(2, 'image'), rect(210, 230)],
    [variableAnchorKey('1:0'), rect(40, 60, 420, 580)],
  ]);
}

function build(rects: Rects, boxes: readonly VariableBox[] = [box]): Connector[] {
  const sources = { boxes, appGroups: [], proxyRows: NO_PROXY_ROWS };
  return buildConnectors(rects, sources, OPTIONS);
}

describe('buildConnectors（変数の線）', () => {
  it('両端が欠けずに見えていれば直結だけを引き、結線の ⊕ を持たせる', () => {
    const connectors = build(rectsWith(rect(90, 100)));

    expect(connectors.map((connector) => connector.id)).toEqual(['d:link:7']);
    expect(connectors[0]?.kind).toBe('direct');
    expect(connectors[0]?.insert).toEqual({ linkIds: [7], type: 'IMAGE' });
    // 直結は出力の右端から入力行の右端へ
    expect(connectors[0]?.from).toEqual({ x: 100, y: 95 });
    expect(connectors[0]?.to).toEqual({ x: 100, y: 220 });
  });

  it('出す側が列の外なら、変数を経由する 2 本にし、カードの列の高さで見切る', () => {
    const connectors = build(rectsWith(rect(700, 710)));

    expect(connectors.map((connector) => connector.kind)).toEqual(['to-card', 'to-variable']);
    const source = connectors[1];
    expect(source?.id).toBe('o:1:0');
    // 元のカードが見えていないので、その線は見えている高さで切る
    expect(source?.clip).toEqual({ top: 0, bottom: 600 });
    // 変数 → カードの線は両端が見えているので切らない。押すと変数の列を揃える
    expect(connectors[0]?.clip).toBeUndefined();
    expect(connectors[0]?.align).toEqual({ column: 'variables', other: 50, card: 220 });
  });

  it('受ける行が上へ過ぎていれば隠し、経由の破線も引かない', () => {
    const rects = rectsWith(rect(700, 710));
    rects.set(inputAnchorKey(2, 'image'), rect(-50, -30));

    expect(build(rects)).toEqual([]);
  });

  it('鍵が重なる線には番号を足して一意にする', () => {
    const twin = { ...box, key: '1:0' };
    const ids = build(rectsWith(rect(90, 100)), [box, twin]).map((connector) => connector.id);

    expect(ids).toEqual(['d:link:7', 'd:link:7#1']);
  });

  it('開いた subgraph の境界をまたぐ線には挟まない', () => {
    const crossing: VariableBox = {
      ...box,
      // 線だけが subgraph 5 の中にある
      targets: [{ nodeId: 2, inputName: 'image', linkId: scopedId(5, 7) }],
    };

    expect(build(rectsWith(rect(90, 100)), [crossing])[0]?.insert).toBeUndefined();
  });
});

describe('buildConnectors（アプリ入力の線）', () => {
  const group: AppInputGroup = {
    key: 'g1',
    nodeId: 3,
    index: '1',
    label: 'Prompt',
    comment: '',
    rows: [nodeRow({ name: 'text', widgetName: 'text' })],
  };

  function appRects(fieldTop: number): Map<string, AnchorRect> {
    return new Map([
      [VIEWPORT_ANCHOR_KEY, rect(0, 600, 300, 500)],
      [APP_VIEWPORT_ANCHOR_KEY, rect(0, 400, 0, 200)],
      [appCardAnchorKey('g1'), rect(0, 300, 0, 200)],
      [appSourceAnchorKey(3, 'text'), rect(fieldTop, fieldTop + 20, 10, 190)],
      [appTargetAnchorKey(3, 'text'), rect(100, 120, 320, 480)],
    ]);
  }

  function appLines(rects: Rects): Connector[] {
    const sources = { boxes: [], appGroups: [group], proxyRows: NO_PROXY_ROWS };
    return buildConnectors(rects, sources, OPTIONS);
  }

  it('枠の右の枠線から、カードの行の左端へ引く', () => {
    const [line] = appLines(appRects(50));

    expect(line).toMatchObject({
      id: 'a:3.text',
      kind: 'app',
      type: APP_LINE_TYPE,
      from: { x: 200, y: 60 },
      to: { x: 320, y: 110 },
      align: { column: 'app', other: 60, card: 110 },
    });
    expect(line?.clip).toBeUndefined();
  });

  it('アプリ入力の側が列の外なら、カードの列の高さで見切る', () => {
    const [line] = appLines(appRects(500));

    expect(line?.clip).toEqual({ top: 0, bottom: 600 });
  });
});

describe('insertPoint', () => {
  const line: Connector = {
    id: 'x',
    kind: 'to-card',
    from: { x: 0, y: 0 },
    to: { x: 100, y: 100 },
    type: 'IMAGE',
    label: 'x',
    insert: { linkIds: [1], type: 'IMAGE' },
  };

  it('指している線の見えている部分の真ん中に置く', () => {
    expect(insertPoint([line], 'x')?.mid).toEqual({ x: 50, y: 50 });

    const clipped = insertPoint([{ ...line, clip: { top: 0, bottom: 25 } }], 'x');
    expect(clipped?.mid.y).toBeLessThan(25);
  });

  it('挟めない線と、指していないときは出さない', () => {
    expect(insertPoint([{ ...line, insert: undefined }], 'x')).toBeNull();
    expect(insertPoint([line], null)).toBeNull();
  });
});

describe('pathOf', () => {
  it('直結は弧、ほかはベジェで描く', () => {
    const base = { id: 'p', from: { x: 0, y: 0 }, to: { x: 0, y: 100 }, type: 'A', label: '' };

    expect(pathOf({ ...base, kind: 'direct' })).toBe(arcPath(base.from, base.to));
    expect(pathOf({ ...base, kind: 'to-card' })).toBe(bezierPath(base.from, base.to));
  });
});
