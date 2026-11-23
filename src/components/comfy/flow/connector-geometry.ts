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

const INSERT_SAMPLES = 32;

const STUB_RATIO = 0.75;

const ARC_BULGE_RATIO = 0.05;
const MIN_ARC_BULGE = 48;

export type ConnectorKind =
  | 'direct'
  | 'to-variable'
  | 'to-card'
  | 'app';

export interface Connector {
  readonly id: string;
  readonly kind: ConnectorKind;
  readonly from: Point;
  readonly to: Point;
  readonly type: string;
  readonly label: string;
  readonly align?: AlignEnds | undefined;
  readonly clip?: ClipArea | undefined;
  readonly insert?: InsertTarget | undefined;
  readonly bulge?: number | undefined;
}

export interface InsertTarget {
  readonly linkIds: readonly LinkId[];
  readonly type: string;
}

export type AlignColumn = 'app' | 'variables';

export interface AlignEnds {
  readonly column: AlignColumn;
  readonly other: number;
  readonly card: number;
}

export interface VariableLineOptions {
  readonly showPassed: boolean;
  readonly chipOutputs: boolean;
  readonly offscreenLines: boolean;
}

export interface LineSources {
  readonly boxes: readonly VariableBox[];
  readonly appGroups: readonly AppInputGroup[];
  readonly proxyRows: DisplayGraph['proxyRows'];
}

interface VariableLineScene {
  readonly areas: ViewAreas;
  readonly rects: Rects;
  readonly box: VariableBox;
  readonly variable: AnchorRect | undefined;
  readonly output: AnchorRect | undefined;
  readonly sourceShown: boolean;
  readonly options: VariableLineOptions;
}

interface TargetLine {
  readonly connector: Connector | null;
  readonly via: boolean;
  readonly hidden: boolean;
}

export interface InsertPoint {
  readonly connector: Connector;
  readonly insert: InsertTarget;
  readonly mid: Point;
}

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

export function pathOf(connector: Connector): string {
  return connector.kind === 'direct'
    ? arcPath(connector.from, connector.to, connector.bulge)
    : bezierPath(connector.from, connector.to);
}

export function insertPoint(
  connectors: readonly Connector[],
  hovered: string | null,
): InsertPoint | null {
  const connector = connectors.find((candidate) => candidate.id === hovered);
  if (!connector?.insert) return null;
  const pointAt = (t: number): Point =>
    connector.kind === 'direct'
      ? arcAt(connector.from, connector.to, t, connector.bulge)
      : bezierAt(connector.from, connector.to, t);
  const clip = connector.clip;
  const visible = Array.from({ length: INSERT_SAMPLES + 1 }, (_, i) =>
    pointAt(i / INSERT_SAMPLES),
  ).filter((point) => !clip || (point.y >= clip.top && point.y <= clip.bottom));
  const mid = visible[Math.floor(visible.length / 2)];
  if (!mid) return null;
  return { connector, insert: connector.insert, mid };
}

function targetKey(boxKey: string, target: VariableTarget): string {
  return target.linkId === undefined
    ? `${boxKey}->${String(target.nodeId)}.${target.inputName}`
    : `link:${String(target.linkId)}`;
}

function uniqueIds(connectors: readonly Connector[]): Connector[] {
  const seen = new Map<string, number>();
  return connectors.map((connector) => {
    const count = seen.get(connector.id) ?? 0;
    seen.set(connector.id, count + 1);
    return count === 0 ? connector : { ...connector, id: `${connector.id}#${String(count)}` };
  });
}

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
  let viaVariable = false;
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

  if (!viaVariable || !variable) return result;
  if (hidden > 0 && viaDrawn === 0) return result;
  if (!options.offscreenLines && !sourceShown) return result;
  const source = sourceConnector(areas, box, variable, output);
  if (source) result.push(source);
  return result;
}

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

function targetLine(
  scene: VariableLineScene,
  target: VariableBox['targets'][number],
): TargetLine | null {
  const { areas, rects, box, variable, output, sourceShown, options } = scene;
  const input =
    rects.get(inputAnchorKey(target.nodeId, target.inputName)) ??
    rects.get(outputAnchorKey(target.nodeId));
  if (!input) return null;

  if (output && isWhollyInView(areas, output) && isWhollyInView(areas, input)) {
    const connector: Connector = {
      id: `d:${targetKey(box.key, target)}`,
      kind: 'direct',
      from: rightAnchor(output),
      to: rightAnchor(input),
      type: box.type,
      label: `${box.sourceLabel} / ${box.name} → ${target.inputName}`,
      insert: insertTargetOf(box, [target]),
      bulge: arcBulgeOf(areas),
    };
    return { connector, via: false, hidden: false };
  }

  if (!variable) return { connector: null, via: true, hidden: false };
  const shown = variableShown(areas, variable);
  const cardShown = isPartlyInView(areas, input);
  if (!cardShown && !shown) return { connector: null, via: true, hidden: false };
  const bothOff = !options.offscreenLines && !cardShown && !sourceShown;
  if ((!options.showPassed && isScrolledPast(areas, input)) || bothOff) {
    return { connector: null, via: true, hidden: true };
  }

  const connector: Connector = {
    id: `i:${targetKey(box.key, target)}`,
    kind: 'to-card',
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

function arcBulgeOf(areas: ViewAreas): number {
  const height = areas.viewport ? areas.viewport.bottom - areas.viewport.top : 0;
  return Math.max(MIN_ARC_BULGE, height * ARC_BULGE_RATIO);
}
