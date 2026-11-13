import {
  APP_VIEWPORT_ANCHOR_KEY,
  cardAnchorKey,
  groupAnchorKey,
  VIEWPORT_ANCHOR_KEY,
} from '@/components/comfy/flow/anchor-context';
import type { AlignColumn } from '@/components/comfy/flow/connector-geometry';
import type { NodeId } from '@/graph/types';
import type { FlowColumnRefs } from '@/hooks/flow/use-flow-column-refs';
import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { alignScroll, type ScrollRoom } from '@/lib/align-scroll';

// ─────────────────────────────
// フロー画面の列を送る手続き（線で揃える・カードやグループへ送る・列の外のホイール）。
// ─────────────────────────────

/** scrollend が来ないときに送りの終わりとみなすまでの時間 */
const SCROLL_END_FALLBACK_MS = 1200;

/** 自分でスクロールする場所。ここでのホイールには手を出さない */
const OWN_SCROLL = '[data-app-scroll],[data-flow-scroll],[data-variable-panel],[data-flow-overlay]';

/** 線で揃える・カードやグループへ送る・列の外のホイールを受ける手続きを返す */
export function useColumnMoves(
  anchors: AnchorRegistry,
  { columnsNow, startHold }: Pick<FlowColumnRefs, 'columnsNow' | 'startHold'>,
): {
  readonly align: (column: AlignColumn, other: number, card: number, at: number) => void;
  readonly revealCard: (id: NodeId) => void;
  readonly revealGroup: (key: string) => void;
  readonly outsideColumn: (clientX: number, clientY: number) => HTMLDivElement | null;
  readonly forwardWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
} {
  // 中でフックを呼ばないので、言わないと compiler が対象にしない。手続きは変数の列へ渡すので、
  // 作り直すと列全体が描き直しになる
  'use memo';
  // アプリ入力・変数とカードを結ぶ線を押したら、線が水平になるよう両方の列を送る。
  // 押した高さに最も近い、両方の列が届く高さで揃える（短い列は送れないため）
  const align = (column: AlignColumn, other: number, card: number, at: number): void => {
    const side = column === 'app' ? columnsNow().app : columnsNow().variables;
    const cards = columnsNow().cards;
    if (!side || !cards) return;

    const roomOf = (element: HTMLElement): ScrollRoom => ({
      top: element.scrollTop,
      max: Math.max(0, element.scrollHeight - element.clientHeight),
    });
    const amount = alignScroll({ from: other, to: card, at }, roomOf(side), roomOf(cards));

    // 変数の列は、カードの列が送り終わるまで連動を止める。送りの途中で連動が働くと、
    // 揃えた位置から引き戻される
    if (column === 'variables') {
      const release = startHold();
      if (release) {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          release();
        };
        cards.addEventListener('scrollend', finish, { once: true });
        // 送る量が 0 だと scrollend が来ない。来ないブラウザもあるので時間でも外す
        window.setTimeout(finish, SCROLL_END_FALLBACK_MS);
      }
    }

    // 変数の列は先に一気に送る。カードの列の送りで連動が働いたとき、
    // 手で動かした位置として扱われ、引き戻されないようにする
    side.scrollBy({ top: amount.first, behavior: column === 'app' ? 'smooth' : 'instant' });
    cards.scrollBy({ top: amount.second, behavior: 'smooth' });
  };

  // 変数のまとまりの見出しから、生成元のカードを列の上端へ送る。
  // 位置は画面の px で測ったもの。送るのは倍率の外の枠なので、差がそのまま送る量になる
  const revealCard = (id: NodeId): void => {
    const cards = columnsNow().cards;
    const { rects } = anchors.positions.getState();
    const card = rects.get(cardAnchorKey(id));
    const viewport = rects.get(VIEWPORT_ANCHOR_KEY);
    if (!cards || !card || !viewport) return;
    cards.scrollBy({ top: card.top - viewport.top, behavior: 'smooth' });
  };

  // 変数の列のグループのタブから、グループの枠（タブを含む）を列の上端へ送る
  const revealGroup = (key: string): void => {
    const cards = columnsNow().cards;
    const { rects } = anchors.positions.getState();
    const frame = rects.get(groupAnchorKey(key));
    const viewport = rects.get(VIEWPORT_ANCHOR_KEY);
    if (!cards || !frame || !viewport) return;
    cards.scrollBy({ top: frame.top - viewport.top, behavior: 'smooth' });
  };

  /**
   * 列の外（接続線を通す余白と、線そのものの上）で縦に送る先。基本はカードの列。
   * アプリ入力とカードの間は真ん中で分け、左半分はアプリ入力の列へ回す。
   * 境目（幅の調整）の位置とは関係させない
   */
  const outsideColumn = (clientX: number, clientY: number): HTMLDivElement | null => {
    const at = anchors.localPoint(clientX, clientY);
    const { rects } = anchors.positions.getState();
    const cards = rects.get(VIEWPORT_ANCHOR_KEY);
    if (at === null || cards === undefined || at.x >= cards.left) return columnsNow().cards;
    const app = rects.get(APP_VIEWPORT_ANCHOR_KEY);
    const middle = app === undefined ? cards.left : (app.right + cards.left) / 2;
    return at.x < middle ? columnsNow().app : columnsNow().cards;
  };

  /**
   * 列の外で回したホイールを列へ回す。
   * 空白に見える場所で回して何も動かないと、止まったように見える。
   * **自前で動く場所では何もしない**（二重に動く）。
   */
  const forwardWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    const target = event.target;
    if (target instanceof Element && target.closest(OWN_SCROLL)) return;

    const scroller = outsideColumn(event.clientX, event.clientY);
    if (scroller) scroller.scrollTop += event.deltaY;
  };

  return { align, revealCard, revealGroup, outsideColumn, forwardWheel };
}
