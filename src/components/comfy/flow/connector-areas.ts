import {
  APP_VIEWPORT_ANCHOR_KEY,
  PANEL_ANCHOR_KEY,
  VIEWPORT_ANCHOR_KEY,
} from '@/components/comfy/flow/anchor-context';
import { leftAnchor, type AnchorRect, type Rects } from '@/hooks/ui/use-anchor-registry';
import type { Point } from '@/lib/point';

// ─────────────────────────────
// 接続線を引くときに見る範囲（列ごとの見えている高さ）と、端が見えているか・どこで見切るかの判定
// ─────────────────────────────

/** 線を描く高さの範囲 */
export interface ClipArea {
  readonly top: number;
  readonly bottom: number;
}

/** 線を引くときに見る範囲（列ごとに独立してスクロールする） */
export interface ViewAreas {
  /** 変数の列の見えている範囲 */
  readonly panel: AnchorRect | undefined;
  /** カードの列（フロー全体のスクロール領域） */
  readonly viewport: AnchorRect | undefined;
  /** 見切る高さ（カードの列の見えている範囲） */
  readonly band: ClipArea | undefined;
  /** カードの列と変数の列の、どちらでも見えている高さ */
  readonly shared: ClipArea | undefined;
  /** アプリ入力の列の見えている範囲 */
  readonly appBand: ClipArea | undefined;
}

/** 位置の表から、列ごとの見えている範囲を読む */
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

/**
 * 変数がパネルの外へスクロールしていても**線は引く**。
 * ただし終点はパネルの帯に収め、無いところへ伸びて見えないようにする。
 */
export function onVariable(areas: ViewAreas, point: Point): Point {
  const { panel } = areas;
  if (!panel) return point;

  return { x: point.x, y: Math.min(Math.max(point.y, panel.top), panel.bottom) };
}

/** 変数が少しでも見えているか（変数の列の見えている範囲に掛かっているか） */
export function variableShown(areas: ViewAreas, rect: { top: number; bottom: number }): boolean {
  const { panel } = areas;
  return !panel || (rect.bottom > panel.top && rect.top < panel.bottom);
}

/** 変数の端。見えていればパネルの帯に収める */
export function variableEnd(areas: ViewAreas, variable: AnchorRect, shown: boolean): Point {
  return shown ? onVariable(areas, leftAnchor(variable)) : leftAnchor(variable);
}

/**
 * 見切る範囲。カードが見えていなければカードの列の高さで、変数が見えていなければ
 * 両方の列の高さで切る（線は変数の実際の位置へ向かうので、列を出たところで途切れる）
 */
export function clipFor(
  areas: ViewAreas,
  cardShown: boolean,
  variableIsShown: boolean,
): ClipArea | undefined {
  if (variableIsShown) return cardShown ? undefined : areas.band;
  return areas.shared;
}

/**
 * 画面（フロー全体のスクロール領域）に**丸ごと**入っているか。
 * 端が切れているところに直結すると、線がどこから来てどこへ行くのか分からなくなる。
 */
export function isWhollyInView(
  areas: ViewAreas,
  rect: { top: number; bottom: number } | undefined,
): boolean {
  const { viewport } = areas;
  if (!rect || !viewport) return false;

  return rect.top >= viewport.top && rect.bottom <= viewport.bottom;
}

/**
 * 少しでも見えているか。**列ごとに独立してスクロールする**ので、
 * 列の外へ出たカードへ線を引くと、何も無いところへ伸びて見える。
 */
export function isPartlyInView(
  areas: ViewAreas,
  rect: { top: number; bottom: number } | undefined,
): boolean {
  const { viewport } = areas;
  if (!rect) return false;
  if (!viewport) return true;

  return rect.bottom > viewport.top && rect.top < viewport.bottom;
}

/** 受ける行がカードの列の見えている範囲より上へ過ぎている（下にあるものは入らない） */
export function isScrolledPast(areas: ViewAreas, rect: { bottom: number }): boolean {
  return areas.viewport !== undefined && rect.bottom <= areas.viewport.top;
}
