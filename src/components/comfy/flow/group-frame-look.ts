import type { CSSProperties } from 'react';

import { DEFAULT_GROUP_COLOR } from '@/graph/node-settings';
import { paintableColor } from '@/lib/color';

// ─────────────────────────────
// グループの枠の見た目。カードの列の枠と、変数の列の帯で同じ塗りと余白を使う。
// ─────────────────────────────

/** 枠の中とタブに敷く色の割合（半透明。地と見分けられる濃さにする） */
const FILL_TINT = 22;

/** グループのタブと枠の中の塗り */
interface GroupTone {
  readonly tab: CSSProperties;
  readonly frame: CSSProperties;
}

/**
 * グループの塗りを返す。半透明にして下の地を透かすので、入れ子の枠では親の塗りに重なって濃く見える。
 * `color` はワークフローから来た値なので、塗ってよい形のときだけ塗る（`color` は書き足さない）
 */
export function groupTone(color: string | undefined): GroupTone {
  const paint = paintableColor(color) ?? DEFAULT_GROUP_COLOR;
  const tint = `color-mix(in oklab, ${paint} ${String(FILL_TINT)}%, transparent)`;
  const fill = { backgroundColor: tint };
  return { tab: fill, frame: fill };
}

/**
 * カードの列の枠の余白。枠はカードの外側へ広げる（枠に入ってもカードの位置と幅は枠の外と同じ）ので、
 * カードの列は左右にこの余白のぶんの場所を空ける。デモも同じ（倍にしない）
 */
export const GROUP_FRAME_PADDING = 8;

/** カードの列の枠の上の余白（タブの下）。横の半分 */
export const GROUP_FRAME_PADDING_TOP = 4;

/** カードの列の枠の下の余白（末尾のカードの下）。上より少し広い */
export const GROUP_FRAME_PADDING_BOTTOM = 6;

/** カードの列の右の余白。グループの枠はカードの外側へ広がるので、その分を空ける。デモも同じ */
export const CARD_COLUMN_PADDING = GROUP_FRAME_PADDING;

/**
 * 開いた subgraph の点線の両端の〇の大きさ
 */
export const SUBGRAPH_KNOB = 11;

/**
 * カードの列の左の余白。グループの枠の広がりに加え、枠の左端に引く subgraph の点線の〇
 * （線の上に中心を置く）が切れない分を空ける。デモも同じ
 */
export const CARD_COLUMN_PADDING_LEFT = GROUP_FRAME_PADDING + Math.ceil(SUBGRAPH_KNOB / 2) + 1;
