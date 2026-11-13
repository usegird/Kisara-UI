import { clamp, normalizeInRange } from '@/lib/clamp';
import { finiteNumber, isRecord } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';

// ─────────────────────────────
// 動かせる・大きさを変えられるダイアログの枠と、ダイアログごとの出し方・中の列の幅の読み戻し。
// 端末に残す値なので、壊れた保存値は「指定なし」に落とす。
// ─────────────────────────────

/** ダイアログの枠。画面の左上からの px で持つ */
export interface DialogRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** 画面の大きさ（px） */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** 枠の最小の大きさ */
export interface DialogMinSize {
  readonly width: number;
  readonly height: number;
}

/** 小さくしすぎると中身が潰れて戻せなくなる。ダイアログが指定しなければこれ */
export const DIALOG_MIN: DialogMinSize = { width: 480, height: 320 };

/** ダイアログが指定できる最小のうち、いちばん小さいもの（残した値の読み戻しの下限） */
const DIALOG_SMALLEST_MIN: DialogMinSize = { width: 240, height: 320 };

/** 画面の外へ出しても、掴む場所（最上段）がこれだけは見えている */
const KEEP_VISIBLE = 80;

/** 保存値を枠に読み戻す。壊れていれば null（既定の中央寄せの置き方に任せる） */
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
    // どのダイアログの値かは分からないので、いちばん小さい最小で下を切る（出すときに寄せ直す）
    width: Math.max(DIALOG_SMALLEST_MIN.width, Math.round(width)),
    height: Math.max(DIALOG_SMALLEST_MIN.height, Math.round(height)),
  };
}

/** 画面に収める。最上段が画面の上に隠れると掴めなくなるので、上端は 0 より上に出さない */
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

/** 画面に収めて出すときの、画面の端との空き */
const VIEW_MARGIN = 16;

/**
 * 出すときの枠。**画面より大きければ、画面に収まる大きさへ縮めて全体が見える位置へ置き直す。**
 * 収まるなら残した値のまま（置き場所は `fitDialogRect` と同じく最上段が掴める範囲へ寄せる）。
 * 画面が最小より狭いときは最小を割ってでも収める
 */
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

/** 掴んで動かした量（右・下が正） */
export interface DragDelta {
  readonly dx: number;
  readonly dy: number;
}

/** 最上段を掴んで動かした量を足す */
export function moveDialogRect(
  rect: DialogRect,
  { dx, dy }: DragDelta,
  viewport: Viewport,
  min: DialogMinSize = DIALOG_MIN,
): DialogRect {
  return fitDialogRect({ ...rect, left: rect.left + dx, top: rect.top + dy }, viewport, min);
}

/** 掴んだ辺・角。方角の頭文字（`n` 上・`s` 下・`e` 右・`w` 左）を組み合わせる */
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const RESIZE_EDGES: readonly ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** 1 本の軸の始まりと長さ */
interface AxisSpan {
  readonly start: number;
  readonly size: number;
}

/** 1 本の軸で掴んだ側と、止める最小・画面の端 */
interface AxisGrip {
  readonly side: 'start' | 'end' | null;
  readonly min: number;
  readonly limit: number;
}

/** 1 本の軸を、掴んだ側だけ動かす。反対側の端は動かさず、最小と画面の端で止める */
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

/** 辺か角を掴んで変えた量。`edge` を省くと右下の角 */
export interface ResizeDrag extends DragDelta {
  readonly edge?: ResizeEdge | undefined;
}

/** 辺か角を掴んで変えた量を足す。掴んでいない側の辺は動かさない */
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

/** 掴んだ辺・角が、軸の始まりと終わりのどちらを動かすか（どちらでもなければ null） */
function sideOf(edge: ResizeEdge, startMark: string, endMark: string): AxisGrip['side'] {
  if (edge.includes(endMark)) return 'end';
  if (edge.includes(startMark)) return 'start';
  return null;
}

// ─────────────────────────────
// ダイアログごとの出し方。**使う人が切り替えた出し方**と、自由移動の枠を残す。
// 出し方が無ければ呼び出す側の既定で出し、枠が無ければ既定の置き方（中央寄せ）に任せる。
// ─────────────────────────────

/** `floating` 自由移動（画面の上に浮かべる）・`embedded` 埋め込み（ノードと変数の列に嵌める） */
export type DialogMode = 'floating' | 'embedded';

/** 1 つのダイアログの、残した出し方と自由移動の枠 */
interface DialogLayout {
  readonly mode?: DialogMode | undefined;
  readonly rect?: DialogRect | undefined;
}

/** 初めて自由移動にしたときのずらし幅（px）。左へ・下へ */
const FLOATING_START_OFFSET = 32;

/**
 * 埋め込みから初めて自由移動にしたときの枠。同じ位置だと移ったと分からないので、
 * 大きさはそのまま少し左下へずらす（画面に収めるのは出すとき。`viewDialogRect`）
 */
export function offsetFloatingStart(rect: DialogRect): DialogRect {
  return {
    ...rect,
    left: rect.left - FLOATING_START_OFFSET,
    top: rect.top + FLOATING_START_OFFSET,
  };
}

/** ダイアログの名前 → 出し方と枠 */
export type DialogLayouts = Readonly<Record<string, DialogLayout>>;

function normalizeDialogMode(value: unknown): DialogMode | undefined {
  return value === 'floating' || value === 'embedded' ? value : undefined;
}

/** 壊れた項目は落とす（何も残らない名前は持たない） */
export function normalizeDialogLayouts(value: unknown): DialogLayouts {
  if (typeof value !== 'object' || value === null) return {};

  const layouts: Record<string, DialogLayout> = {};
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    // 配列の項目は鍵 `mode`・`rect` を持たず、どちらにしても落ちる
    if (!isRecord(entry)) continue;

    const layout = {
      mode: normalizeDialogMode(entry.mode),
      rect: normalizeDialogRect(entry.rect) ?? undefined,
    };
    // 鍵は控えから来たので、親を差し替えない書き方で入れる
    if (layout.mode !== undefined || layout.rect !== undefined) setOwn(layouts, id, layout);
  }
  return layouts;
}

// ─────────────────────────────
// ダイアログの中の列（左の列・右端の情報など）の幅。縦線を掴んで変える
// ─────────────────────────────

export const DEFAULT_SIDE_LIST_WIDTH = 224;
const SIDE_LIST_MIN = 140;
const SIDE_LIST_MAX = 480;

/** 左の列の幅の保存値を範囲に収める。数でなければ既定 */
export function normalizeSideListWidth(value: unknown): number {
  // 上下限が整数なので、丸めてから収めても収めてから丸めても同じ値になる
  return normalizeInRange(
    value,
    { initial: DEFAULT_SIDE_LIST_WIDTH, min: SIDE_LIST_MIN, max: SIDE_LIST_MAX },
    { round: true },
  );
}

/** 列ごとの幅（下の列なら高さ）。キーは `ダイアログの名前:列の名前` */
export type PaneWidths = Readonly<Record<string, number>>;

/** 列ごとの下限は列が決める（`SidePane` の `minSize`）。ここは壊れた値を弾くだけの下限 */
// 列の下限より小さくしておく（ここが大きいと、列の minSize まで縮められない）
const PANE_MIN = 24;
/** 下の列は高さなので、横の列より大きく取れるようにする（枠の大きさに収まる分は呼び出し側に任せる） */
const PANE_MAX = 800;

/** 列の幅（下の列なら高さ）を、壊れた値を弾く範囲に収める */
export function normalizePaneSize(value: number): number {
  return clamp(Math.round(value), PANE_MIN, PANE_MAX);
}

/** 壊れた値は捨てる（その列は既定の幅で出す） */
export function normalizePaneWidths(value: unknown): PaneWidths {
  if (typeof value !== 'object' || value === null) return {};
  const widths: Record<string, number> = {};
  for (const [key, width] of Object.entries(value)) {
    const size = finiteNumber(width);
    if (size !== null) setOwn(widths, key, normalizePaneSize(size));
  }
  return widths;
}

/** 右か下に置ける列の置き場（モデルの情報など）。キーは `ダイアログの名前:列の名前` */
export type PaneDock = 'right' | 'bottom';
/** 列ごとの置き場。キーは `ダイアログの名前:列の名前` */
export type PaneDocks = Readonly<Record<string, PaneDock>>;

/** ピン止めした列（ダイアログの列ごと。モデル選びのディレクトリ）。ピン止めしたものだけを持つ */
export type PanePins = Readonly<Record<string, true>>;

/** ピン止めの保存値を読み戻す。`true` 以外の項目は捨てる */
export function normalizePanePins(value: unknown): PanePins {
  if (typeof value !== 'object' || value === null) return {};
  const pins: Record<string, true> = {};
  for (const [key, pinned] of Object.entries(value as Record<string, unknown>)) {
    if (pinned === true) setOwn(pins, key, true);
  }
  return pins;
}

/** 知らない値は捨てる（その列は既定の置き場で出す） */
export function normalizePaneDocks(value: unknown): PaneDocks {
  if (typeof value !== 'object' || value === null) return {};
  const docks: Record<string, PaneDock> = {};
  for (const [key, dock] of Object.entries(value as Record<string, unknown>)) {
    if (dock === 'right' || dock === 'bottom') setOwn(docks, key, dock);
  }
  return docks;
}
