import {
  APP_VIEWPORT_ANCHOR_KEY,
  PANEL_ANCHOR_KEY,
  VIEWPORT_ANCHOR_KEY,
} from '@/components/comfy/flow/anchor-context';
import { leftAnchor, type AnchorRect, type Rects } from '@/hooks/ui/use-anchor-registry';
import type { Point } from '@/lib/point';

export interface ClipArea {
  readonly top: number;
  readonly bottom: number;
}

export interface ViewAreas {
  readonly panel: AnchorRect | undefined;
  readonly viewport: AnchorRect | undefined;
  readonly band: ClipArea | undefined;
  readonly shared: ClipArea | undefined;
  readonly appBand: ClipArea | undefined;
}

export function viewAreas(rects: Rects): ViewAreas {
  const panel = rects.get(PANEL_ANCHOR_KEY);
  const viewport = rects.get(VIEWPORT_ANCHOR_KEY);
  const band = viewport ? { top: viewport.top, bottom: viewport.bottom } : undefined;
  const shared =
    band && panel
      ? { top: Math.max(band.top, panel.top), bottom: Math.min(band.bottom, panel.bottom) }
      : band;
  const appViewport = rects.get(APP_VIEWPORT_ANCHOR_KEY);
  const appBand = appViewport ? { top: appViewport.top, bottom: appViewport.bottom } : undefined;
  return { panel, viewport, band, shared, appBand };
}

export function onVariable(areas: ViewAreas, point: Point): Point {
  const { panel } = areas;
  if (!panel) return point;

  return { x: point.x, y: Math.min(Math.max(point.y, panel.top), panel.bottom) };
}

export function variableShown(areas: ViewAreas, rect: { top: number; bottom: number }): boolean {
  const { panel } = areas;
  return !panel || (rect.bottom > panel.top && rect.top < panel.bottom);
}

export function variableEnd(areas: ViewAreas, variable: AnchorRect, shown: boolean): Point {
  return shown ? onVariable(areas, leftAnchor(variable)) : leftAnchor(variable);
}

export function clipFor(
  areas: ViewAreas,
  cardShown: boolean,
  variableIsShown: boolean,
): ClipArea | undefined {
  if (variableIsShown) return cardShown ? undefined : areas.band;
  return areas.shared;
}

export function isWhollyInView(
  areas: ViewAreas,
  rect: { top: number; bottom: number } | undefined,
): boolean {
  const { viewport } = areas;
  if (!rect || !viewport) return false;

  return rect.top >= viewport.top && rect.bottom <= viewport.bottom;
}

export function isPartlyInView(
  areas: ViewAreas,
  rect: { top: number; bottom: number } | undefined,
): boolean {
  const { viewport } = areas;
  if (!rect) return false;
  if (!viewport) return true;

  return rect.bottom > viewport.top && rect.top < viewport.bottom;
}

export function isScrolledPast(areas: ViewAreas, rect: { bottom: number }): boolean {
  return areas.viewport !== undefined && rect.bottom <= areas.viewport.top;
}
