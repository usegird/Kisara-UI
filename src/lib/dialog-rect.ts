import { clamp, normalizeInRange } from '@/lib/clamp';
import { finiteNumber, isRecord } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';

export interface DialogRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface DialogMinSize {
  readonly width: number;
  readonly height: number;
}

export const DIALOG_MIN: DialogMinSize = { width: 480, height: 320 };

const DIALOG_SMALLEST_MIN: DialogMinSize = { width: 240, height: 320 };

const KEEP_VISIBLE = 80;

export function normalizeDialogRect(value: unknown): DialogRect | null {
  if (!isRecord(value)) return null;

  const left = finiteNumber(value.left);
  const top = finiteNumber(value.top);
  const width = finiteNumber(value.width);
  const height = finiteNumber(value.height);
  if (left === null || top === null || width === null || height === null) return null;

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.max(DIALOG_SMALLEST_MIN.width, Math.round(width)),
    height: Math.max(DIALOG_SMALLEST_MIN.height, Math.round(height)),
  };
}

function fitDialogRect(
  rect: DialogRect,
  viewport: Viewport,
  min: DialogMinSize = DIALOG_MIN,
): DialogRect {
  const width = clamp(rect.width, min.width, viewport.width);
  const height = clamp(rect.height, min.height, viewport.height);
  return {
    width,
    height,
    left: clamp(rect.left, KEEP_VISIBLE - width, viewport.width - KEEP_VISIBLE),
    top: clamp(rect.top, 0, viewport.height - KEEP_VISIBLE),
  };
}

const VIEW_MARGIN = 16;

export function viewDialogRect(
  rect: DialogRect,
  viewport: Viewport,
  min: DialogMinSize = DIALOG_MIN,
): DialogRect {
  const room = {
    width: Math.max(0, viewport.width - VIEW_MARGIN * 2),
    height: Math.max(0, viewport.height - VIEW_MARGIN * 2),
  };
  if (rect.width <= viewport.width && rect.height <= viewport.height) {
    return fitDialogRect(rect, viewport, min);
  }
  const width = Math.min(rect.width, room.width);
  const height = Math.min(rect.height, room.height);
  const place = (start: number, size: number, limit: number): number =>
    clamp(start, VIEW_MARGIN, limit - VIEW_MARGIN - size);
  return {
    width,
    height,
    left: place(rect.left, width, viewport.width),
    top: place(rect.top, height, viewport.height),
  };
}

export interface DragDelta {
  readonly dx: number;
  readonly dy: number;
}

export function moveDialogRect(
  rect: DialogRect,
  { dx, dy }: DragDelta,
  viewport: Viewport,
  min: DialogMinSize = DIALOG_MIN,
): DialogRect {
  return fitDialogRect({ ...rect, left: rect.left + dx, top: rect.top + dy }, viewport, min);
}

export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const RESIZE_EDGES: readonly ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

interface AxisSpan {
  readonly start: number;
  readonly size: number;
}

interface AxisGrip {
  readonly side: 'start' | 'end' | null;
  readonly min: number;
  readonly limit: number;
}

function resizeAxis(
  { start, size }: AxisSpan,
  delta: number,
  { side, min, limit }: AxisGrip,
): AxisSpan {
  if (side === 'end') {
    return { start, size: Math.round(clamp(size + delta, min, limit - start)) };
  }
  if (side === 'start') {
    const end = start + size;
    const next = Math.round(clamp(start + delta, 0, end - min));
    return { start: next, size: end - next };
  }
  return { start, size };
}

export interface ResizeDrag extends DragDelta {
  readonly edge?: ResizeEdge | undefined;
}

export function resizeDialogRect(
  rect: DialogRect,
  { dx, dy, edge = 'se' }: ResizeDrag,
  viewport: Viewport,
  min: DialogMinSize = DIALOG_MIN,
): DialogRect {
  const horizontal = sideOf(edge, 'w', 'e');
  const vertical = sideOf(edge, 'n', 's');
  const x = resizeAxis({ start: rect.left, size: rect.width }, dx, {
    side: horizontal,
    min: min.width,
    limit: viewport.width,
  });
  const y = resizeAxis({ start: rect.top, size: rect.height }, dy, {
    side: vertical,
    min: min.height,
    limit: viewport.height,
  });
  return { left: x.start, top: y.start, width: x.size, height: y.size };
}

function sideOf(edge: ResizeEdge, startMark: string, endMark: string): AxisGrip['side'] {
  if (edge.includes(endMark)) return 'end';
  if (edge.includes(startMark)) return 'start';
  return null;
}

export type DialogMode = 'floating' | 'embedded';

interface DialogLayout {
  readonly mode?: DialogMode | undefined;
  readonly rect?: DialogRect | undefined;
}

const FLOATING_START_OFFSET = 32;

export function offsetFloatingStart(rect: DialogRect): DialogRect {
  return {
    ...rect,
    left: rect.left - FLOATING_START_OFFSET,
    top: rect.top + FLOATING_START_OFFSET,
  };
}

export type DialogLayouts = Readonly<Record<string, DialogLayout>>;

function normalizeDialogMode(value: unknown): DialogMode | undefined {
  return value === 'floating' || value === 'embedded' ? value : undefined;
}

export function normalizeDialogLayouts(value: unknown): DialogLayouts {
  if (typeof value !== 'object' || value === null) return {};

  const layouts: Record<string, DialogLayout> = {};
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!isRecord(entry)) continue;

    const layout = {
      mode: normalizeDialogMode(entry.mode),
      rect: normalizeDialogRect(entry.rect) ?? undefined,
    };
    if (layout.mode !== undefined || layout.rect !== undefined) setOwn(layouts, id, layout);
  }
  return layouts;
}

export const DEFAULT_SIDE_LIST_WIDTH = 224;
const SIDE_LIST_MIN = 140;
const SIDE_LIST_MAX = 480;

export function normalizeSideListWidth(value: unknown): number {
  return normalizeInRange(
    value,
    { initial: DEFAULT_SIDE_LIST_WIDTH, min: SIDE_LIST_MIN, max: SIDE_LIST_MAX },
    { round: true },
  );
}

export type PaneWidths = Readonly<Record<string, number>>;

const PANE_MIN = 24;
const PANE_MAX = 800;

export function normalizePaneSize(value: number): number {
  return clamp(Math.round(value), PANE_MIN, PANE_MAX);
}

export function normalizePaneWidths(value: unknown): PaneWidths {
  if (typeof value !== 'object' || value === null) return {};
  const widths: Record<string, number> = {};
  for (const [key, width] of Object.entries(value)) {
    const size = finiteNumber(width);
    if (size !== null) setOwn(widths, key, normalizePaneSize(size));
  }
  return widths;
}

export type PaneDock = 'right' | 'bottom';
export type PaneDocks = Readonly<Record<string, PaneDock>>;

export type PanePins = Readonly<Record<string, boolean>>;

export function normalizePanePins(value: unknown): PanePins {
  if (typeof value !== 'object' || value === null) return {};
  const pins: Record<string, boolean> = {};
  for (const [key, pinned] of Object.entries(value as Record<string, unknown>)) {
    if (typeof pinned === 'boolean') setOwn(pins, key, pinned);
  }
  return pins;
}

export function normalizePaneDocks(value: unknown): PaneDocks {
  if (typeof value !== 'object' || value === null) return {};
  const docks: Record<string, PaneDock> = {};
  for (const [key, dock] of Object.entries(value as Record<string, unknown>)) {
    if (dock === 'right' || dock === 'bottom') setOwn(docks, key, dock);
  }
  return docks;
}
