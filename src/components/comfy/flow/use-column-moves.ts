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

const SCROLL_END_FALLBACK_MS = 1200;

const OWN_SCROLL = '[data-app-scroll],[data-flow-scroll],[data-variable-panel],[data-flow-overlay]';

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
  'use memo';
  const align = (column: AlignColumn, other: number, card: number, at: number): void => {
    const side = column === 'app' ? columnsNow().app : columnsNow().variables;
    const cards = columnsNow().cards;
    if (!side || !cards) return;

    const roomOf = (element: HTMLElement): ScrollRoom => ({
      top: element.scrollTop,
      max: Math.max(0, element.scrollHeight - element.clientHeight),
    });
    const amount = alignScroll({ from: other, to: card, at }, roomOf(side), roomOf(cards));

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
        window.setTimeout(finish, SCROLL_END_FALLBACK_MS);
      }
    }

    side.scrollBy({ top: amount.first, behavior: column === 'app' ? 'smooth' : 'instant' });
    cards.scrollBy({ top: amount.second, behavior: 'smooth' });
  };

  const revealCard = (id: NodeId): void => {
    const cards = columnsNow().cards;
    const { rects } = anchors.positions.getState();
    const card = rects.get(cardAnchorKey(id));
    const viewport = rects.get(VIEWPORT_ANCHOR_KEY);
    if (!cards || !card || !viewport) return;
    cards.scrollBy({ top: card.top - viewport.top, behavior: 'smooth' });
  };

  const revealGroup = (key: string): void => {
    const cards = columnsNow().cards;
    const { rects } = anchors.positions.getState();
    const frame = rects.get(groupAnchorKey(key));
    const viewport = rects.get(VIEWPORT_ANCHOR_KEY);
    if (!cards || !frame || !viewport) return;
    cards.scrollBy({ top: frame.top - viewport.top, behavior: 'smooth' });
  };

  const outsideColumn = (clientX: number, clientY: number): HTMLDivElement | null => {
    const at = anchors.localPoint(clientX, clientY);
    const { rects } = anchors.positions.getState();
    const cards = rects.get(VIEWPORT_ANCHOR_KEY);
    if (at === null || cards === undefined || at.x >= cards.left) return columnsNow().cards;
    const app = rects.get(APP_VIEWPORT_ANCHOR_KEY);
    const middle = app === undefined ? cards.left : (app.right + cards.left) / 2;
    return at.x < middle ? columnsNow().app : columnsNow().cards;
  };

  const forwardWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    const target = event.target;
    if (target instanceof Element && target.closest(OWN_SCROLL)) return;

    const scroller = outsideColumn(event.clientX, event.clientY);
    if (scroller) scroller.scrollTop += event.deltaY;
  };

  return { align, revealCard, revealGroup, outsideColumn, forwardWheel };
}
