import {
  inputAnchorKey,
  outputAnchorKey,
  outputChipAnchorKey,
  variableAnchorKey,
} from '@/components/comfy/flow/anchor-context';
import { appConnectors } from '@/components/comfy/flow/connector-app-lines';
import {
  clipFor,
  isPartlyInView,
  isScrolledPast,
  isWhollyInView,
  onVariable,
  variableEnd,
  variableShown,
  viewAreas,
  type ClipArea,
  type ViewAreas,
} from '@/components/comfy/flow/connector-areas';
import type { AppInputGroup } from '@/graph/app-input-order';
import type { DisplayGraph } from '@/graph/subgraph-display';
import { levelOfId } from '@/graph/subgraph-level';
import type { LinkId } from '@/graph/types';
import type { VariableBox, VariableTarget } from '@/graph/variables';
import {
  leftAnchor,
  rightAnchor,
  type AnchorRect,
  type Rects,
} from '@/hooks/ui/use-anchor-registry';
import { arcAt, arcPath, bezierAt, bezierPath } from '@/lib/bezier';
import type { Point } from '@/lib/point';

// ─────────────────────────────
// 接続線の幾何。位置の表から、引く線（両端・見切る高さ・揃える端・挟む先）の一覧と ⊕ の置き場所を作る。
// 描画からは切り離す（React を読まない）
// ─────────────────────────────

/** ⊕ の置き場所を探すときに線を何等分して見るか */
const INSERT_SAMPLES = 32;

/** 元のカードの位置が分からないときの線の長さ（変数からカードの列までの 3/4） */
const STUB_RATIO = 0.75;

/** 線の種類 */
export type ConnectorKind =
  /** 両端が画面内に収まっているリンクの直結。弧で描く */
  | 'direct'
  /** カードの出力アンカー → 変数ボックス。細い破線 */
  | 'to-variable'
  /** 変数ボックス → カードの入力行 */
  | 'to-card'
  /** アプリ入力の枠 → カードのその行 */
  | 'app';

/** 引く線 1 本 */
export interface Connector {
  readonly id: string;
  readonly kind: ConnectorKind;
  readonly from: Point;
  readonly to: Point;
  readonly type: string;
  readonly label: string;
  /**
   * 押したときに揃える端。`column` は カードの列と組になる列、`other` はその列の端の高さ、
   * `card` はカードの列の端の高さ（どちらも見えている範囲へ寄せる前）
   */
  readonly align?: AlignEnds | undefined;
  /**
   * 見えていないカードへ向けた線。カードの列の見えている高さで**見切る**
   * （カードがあるはずの位置へ向けて引き、列の外へは描かない）
   */
  readonly clip?: ClipArea | undefined;
  /**
   * 真ん中の ⊕ で間にノードを挟める線。1 本の結線か、
   * 同じ出力から 2 本以上出ているときの出力 → 変数の点線（先すべてに挟む）
   */
  readonly insert?: InsertTarget | undefined;
}

/** 線の ⊕ で挟む先 */
export interface InsertTarget {
  /** 挟む結線。2 本以上なら同じ出力から出ている */
  readonly linkIds: readonly LinkId[];
  readonly type: string;
}

/** 線を押したときに、カードの列と一緒に送る列 */
export type AlignColumn = 'app' | 'variables';

/** 線を押したときに揃える列と両端の高さ */
export interface AlignEnds {
  readonly column: AlignColumn;
  readonly other: number;
  readonly card: number;
}

/** 変数の線の引き分けの切り替え */
export interface VariableLineOptions {
  readonly showPassed: boolean;
  readonly chipOutputs: boolean;
  readonly offscreenLines: boolean;
}

/** 線を引く元（変数・アプリ入力の枠・開いた subgraph の昇格した入力の行） */
export interface LineSources {
  readonly boxes: readonly VariableBox[];
  readonly appGroups: readonly AppInputGroup[];
  readonly proxyRows: DisplayGraph['proxyRows'];
}

/** 変数 1 つぶんの線を宛先ごとに引くときに見る物 */
interface VariableLineScene {
  readonly areas: ViewAreas;
  readonly rects: Rects;
  readonly box: VariableBox;
  readonly variable: AnchorRect | undefined;
  readonly output: AnchorRect | undefined;
  /** 出す側のカードが見えているか（デモは見えているときだけ列の外のカードへ引く） */
  readonly sourceShown: boolean;
  readonly options: VariableLineOptions;
}

/** 宛先 1 つぶんの線。via は変数を経由して辿るか、hidden は切り替えで隠したか */
interface TargetLine {
  readonly connector: Connector | null;
  readonly via: boolean;
  readonly hidden: boolean;
}

/** 指している線の ⊕ の置き場所と挟む先 */
export interface InsertPoint {
  readonly connector: Connector;
  readonly insert: InsertTarget;
  readonly mid: Point;
}

/** 位置の表から、引く線の一覧を作る（鍵は一意） */
export function buildConnectors(
  rects: Rects,
  { boxes, appGroups, proxyRows }: LineSources,
  options: VariableLineOptions,
): Connector[] {
  const areas = viewAreas(rects);
  const result: Connector[] = [];
  for (const box of boxes) result.push(...variableConnectors(areas, rects, box, options));
  for (const group of appGroups) result.push(...appConnectors(areas, rects, group, proxyRows));
  return uniqueIds(result);
}

/** 線の道筋（SVG の d）。直結は弧、ほかはベジェ */
export function pathOf(connector: Connector): string {
  return connector.kind === 'direct'
    ? arcPath(connector.from, connector.to)
    : bezierPath(connector.from, connector.to);
}

/**
 * 指している線の ⊕。**線の見えている部分の真ん中**に置く
 * （見切った線は真ん中が隠れていることがある）
 */
export function insertPoint(
  connectors: readonly Connector[],
  hovered: string | null,
): InsertPoint | null {
  const connector = connectors.find((candidate) => candidate.id === hovered);
  if (!connector?.insert) return null;
  const pointAt = (t: number): Point =>
    connector.kind === 'direct'
      ? arcAt(connector.from, connector.to, t)
      : bezierAt(connector.from, connector.to, t);
  const clip = connector.clip;
  const visible = Array.from({ length: INSERT_SAMPLES + 1 }, (_, i) =>
    pointAt(i / INSERT_SAMPLES),
  ).filter((point) => !clip || (point.y >= clip.top && point.y <= clip.bottom));
  const mid = visible[Math.floor(visible.length / 2)];
  if (!mid) return null;
  return { connector, insert: connector.insert, mid };
}

/** 線 1 本の鍵。リンクが分かればリンクで引く（同じ入力名が並ぶノードでも取り違えない） */
function targetKey(boxKey: string, target: VariableTarget): string {
  return target.linkId === undefined
    ? `${boxKey}->${String(target.nodeId)}.${target.inputName}`
    : `link:${String(target.linkId)}`;
}

/**
 * 鍵が重ならないようにする。**重なると React が古い線を消し損ね、スクロールのたびに
 * 線が溜まっていく**ので、想定外のワークフローでも必ず一意にする
 */
function uniqueIds(connectors: readonly Connector[]): Connector[] {
  const seen = new Map<string, number>();
  return connectors.map((connector) => {
    const count = seen.get(connector.id) ?? 0;
    seen.set(connector.id, count + 1);
    return count === 0 ? connector : { ...connector, id: `${connector.id}#${String(count)}` };
  });
}

/**
 * 結線の分かる先だけで挟む先を作る。1 本でも分からなければ出さない。
 * 開いた subgraph の境界をまたぐ線（出す側・受ける側・線の階層が揃わない）には挟まない
 */
function insertTargetOf(
  box: VariableBox,
  targets: readonly VariableTarget[],
): InsertTarget | undefined {
  const linkIds = targets.map((target) => target.linkId);
  if (linkIds.length === 0 || linkIds.some((id) => id === undefined)) return undefined;
  const level = levelOfId(box.nodeId);
  const crossing = targets.some(
    (target) =>
      levelOfId(target.nodeId) !== level ||
      (target.linkId !== undefined && levelOfId(target.linkId) !== level),
  );
  if (crossing) return undefined;
  const type = box.type;
  return { linkIds: linkIds.filter((id): id is LinkId => id !== undefined), type };
}

/** 変数 1 つぶんの線（直結・変数 → カード・出力 → 変数） */
function variableConnectors(
  areas: ViewAreas,
  rects: Rects,
  box: VariableBox,
  options: VariableLineOptions,
): Connector[] {
  const variable = rects.get(variableAnchorKey(box.key));
  const output = outputRectOf(rects, box, options.chipOutputs);
  const sourceShown = isPartlyInView(areas, output);
  const scene = { areas, rects, box, variable, output, sourceShown, options };
  const result: Connector[] = [];
  /** 直結できなかった消費先がある＝変数を経由して辿る必要がある */
  let viaVariable = false;
  /** 経由の線のうち、隠したもの（上へ過ぎた・列の外のカード）と、残したもの（破線を出すかに使う） */
  let hidden = 0;
  let viaDrawn = 0;

  for (const target of box.targets) {
    const line = targetLine(scene, target);
    if (line === null) continue;
    if (line.via) viaVariable = true;
    if (line.hidden) hidden += 1;
    if (line.connector === null) continue;
    if (line.via) viaDrawn += 1;
    result.push(line.connector);
  }

  // 変数を経由して辿るときだけ、どのカードが作ったのかを破線で示す。
  // 使われていない変数（消費先なし）には引かない
  if (!viaVariable || !variable) return result;
  // 宛先をすべて隠したなら、破線も隠す
  if (hidden > 0 && viaDrawn === 0) return result;
  // 元のカードが列の外（位置が分からないときを含む）なら、デモは破線を引かない
  if (!options.offscreenLines && !sourceShown) return result;
  const source = sourceConnector(areas, box, variable, output);
  if (source) result.push(source);
  return result;
}

/** 変数の出す側の位置。チップごとなら、その出力のチップから出す（チップが無い折りたたみ中などはカードの点） */
function outputRectOf(
  rects: Rects,
  box: VariableBox,
  chipOutputs: boolean,
): AnchorRect | undefined {
  return (
    (chipOutputs ? rects.get(outputChipAnchorKey(box.nodeId, box.slot)) : undefined) ??
    rects.get(outputAnchorKey(box.nodeId))
  );
}

/** 宛先 1 つぶんの線（直結か、変数 → カード）。受ける行もカードも測れていなければ null */
function targetLine(
  scene: VariableLineScene,
  target: VariableBox['targets'][number],
): TargetLine | null {
  const { areas, rects, box, variable, output, sourceShown, options } = scene;
  // 折りたたみ中は行が無いので、そのカードの出力アンカーを終点に使う
  const input =
    rects.get(inputAnchorKey(target.nodeId, target.inputName)) ??
    rects.get(outputAnchorKey(target.nodeId));
  if (!input) return null;

  // 接続元の出力と宛先の行が欠けずに見えていれば直接つなぐ（変数経由は出さない）。
  // 接続元のパラメータ行は欠けていてよい（線の出所は出力の点で分かる）
  if (output && isWhollyInView(areas, output) && isWhollyInView(areas, input)) {
    const connector: Connector = {
      id: `d:${targetKey(box.key, target)}`,
      kind: 'direct',
      from: rightAnchor(output),
      to: rightAnchor(input),
      type: box.type,
      label: `${box.sourceLabel} / ${box.name} → ${target.inputName}`,
      insert: insertTargetOf(box, [target]),
    };
    return { connector, via: false, hidden: false };
  }

  if (!variable) return { connector: null, via: true, hidden: false };
  const shown = variableShown(areas, variable);
  // カードも変数も見えていなければ引かない（どちらの端も無いところを結ぶことになる）
  const cardShown = isPartlyInView(areas, input);
  if (!cardShown && !shown) return { connector: null, via: true, hidden: false };
  // 受ける行が列の上へ過ぎていれば切り替えで隠す。デモは、出す側も受ける側も列の外なら引かない
  const bothOff = !options.offscreenLines && !cardShown && !sourceShown;
  if ((!options.showPassed && isScrolledPast(areas, input)) || bothOff) {
    return { connector: null, via: true, hidden: true };
  }

  // 列の外へスクロールしたカード・変数へも、あるはずの位置へ向けて引いて見切る
  const connector: Connector = {
    id: `i:${targetKey(box.key, target)}`,
    kind: 'to-card',
    // 消費側は左のカードに戻るので、変数ボックスの左端から入力行の右端へ引く
    from: variableEnd(areas, variable, shown),
    to: rightAnchor(input),
    type: box.type,
    label: `${box.name} → ${target.inputName}`,
    align: { column: 'variables', other: variable.centerY, card: input.centerY },
    clip: clipFor(areas, cardShown, shown),
    insert: insertTargetOf(box, [target]),
  };
  return { connector, via: true, hidden: false };
}

/** 出力 → 変数の破線。元のカードが出ていなければ、カードの列の方へ 3/4 まで引いて見切る */
function sourceConnector(
  areas: ViewAreas,
  box: VariableBox,
  variable: AnchorRect,
  output: AnchorRect | undefined,
): Connector | null {
  const shown = variableShown(areas, variable);
  if (output) {
    if (!isPartlyInView(areas, output) && !shown) return null;
    return {
      id: `o:${box.key}`,
      kind: 'to-variable',
      from: rightAnchor(output),
      to: variableEnd(areas, variable, shown),
      type: box.type,
      label: `${box.sourceLabel} / ${box.name}`,
      align: { column: 'variables', other: variable.centerY, card: output.centerY },
      clip: clipFor(areas, isPartlyInView(areas, output), shown),
      // 点線の ⊕ は先すべての間に挟む（先が 1 本ならその結線）
      insert: insertTargetOf(box, box.targets),
    };
  }
  const { viewport } = areas;
  if (!viewport || !shown) return null;
  const to = onVariable(areas, leftAnchor(variable));
  const reach = Math.max(0, to.x - viewport.right) * STUB_RATIO;
  return {
    id: `o:${box.key}`,
    kind: 'to-variable',
    from: { x: to.x - reach, y: to.y },
    to,
    type: box.type,
    label: `${box.sourceLabel} / ${box.name}`,
  };
}
