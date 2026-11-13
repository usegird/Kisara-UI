// ─────────────────────────────
// 変数パネルのスクロール位置と、手動スクロールとの折り合い。
// ─────────────────────────────

/** 変数のまとまり 1 つの位置と、生成元カードの出力欄の位置 */
export interface PanelScrollItem {
  /** パネル内容の座標での上端 */
  readonly top: number;
  readonly height: number;
  /** 生成元カードの出力欄の位置（パネル上端からの相対）。負なら通り過ぎた */
  readonly cardBottom: number;
}

/** 変数パネルの送り位置を求めるのに要る高さと並び */
interface PanelScrollInput {
  /** パネルの高さ */
  readonly viewHeight: number;
  /**
   * カードの出力欄が「画面に出た」とみなす下限。
   * パネルより広いフロー全体のスクロール領域の高さを渡す。
   */
  readonly appearHeight: number;
  readonly items: readonly PanelScrollItem[];
}

/**
 * 生成元カードの出力欄の位置を埋める。カードを隠したノードは測れない（null）ので、手前の位置で埋める。
 * 測れないものを 0 のまま渡すと常に「出た」扱いになり、列の後ろにあると
 * 上へ送っても連動の位置が下端に張り付いたままになる。
 */
export function fillCardBottoms(bottoms: readonly (number | null)[]): number[] {
  let previous = Number.NEGATIVE_INFINITY;
  return bottoms.map((bottom) => {
    if (bottom !== null) previous = bottom;
    return previous;
  });
}

/**
 * 「カードの出力欄が出ている変数だけが見えている」状態にする送り位置。
 * **全体スクロールが動いたときだけ呼ぶ**（手動スクロールに介入しない）
 */
export function panelScrollTop({ viewHeight, appearHeight, items }: PanelScrollInput): number {
  if (viewHeight <= 0) return 0;

  // 出力欄がまだ画面の下にあるカードは「出ていない」
  let last = -1;
  items.forEach((item, index) => {
    if (item.cardBottom <= appearHeight) last = index;
  });

  const lastItem = last >= 0 ? items[last] : undefined;
  if (!lastItem) return 0;

  return Math.max(0, lastItem.top + lastItem.height - viewHeight);
}

// ─────────────────────────────
// 手動スクロールとの折り合い。パネルを手でずらしたら連動を外し、全体スクロールがその位置に
// 追い付いたら戻す。
// ─────────────────────────────

/** 連動の状態。直前に合わせた位置と、手でずらした位置 */
interface PanelSyncState {
  /** 直前にこちらが合わせた位置。実際の位置がこれと違えば手で動かされている */
  readonly applied: number;
  /** 手でずらした位置（`at`）と、外した時点の連動位置（`from`） */
  readonly manual: { readonly at: number; readonly from: number } | null;
}

/** 合わせ直しの結果。動かす位置と次の状態 */
interface PanelSyncResult {
  /** 合わせるべき位置。null なら触らない */
  readonly scroll: number | null;
  readonly state: PanelSyncState;
}

export const INITIAL_PANEL_SYNC: PanelSyncState = { applied: 0, manual: null };

/**
 * 連動の位置 `target` へ合わせるかを決める。手でずらされていれば、連動の位置が追い付くまで
 * （下へずらしたなら追い越すまで、上へ戻したなら戻ってくるまで）触らない
 */
export function syncPanelScroll(
  state: PanelSyncState,
  { current, target }: { current: number; target: number },
): PanelSyncResult {
  const manual = current === state.applied ? state.manual : { at: current, from: state.applied };

  if (manual) {
    const wentUp = manual.at < manual.from;
    const caughtUp = wentUp ? target <= manual.at : target >= manual.at;
    if (!caughtUp) return { scroll: null, state: { applied: state.applied, manual } };
  }

  return { scroll: target, state: { applied: target, manual: null } };
}

/**
 * 連動を止めている間（線を押して列を揃えている間）の覚え直し。動かさずに、
 * **今の位置を手で置いた位置**として覚える。連動に戻るのは、この先の全体スクロールで
 * 連動の位置が今の位置を越えたとき（`syncPanelScroll` の手動の扱いと同じ）
 */
export function holdPanelSync(current: number, target: number): PanelSyncState {
  return { applied: current, manual: { at: current, from: target } };
}
