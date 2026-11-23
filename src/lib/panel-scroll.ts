export interface PanelScrollItem {
  readonly top: number;
  readonly height: number;
  readonly cardBottom: number;
}

interface PanelScrollInput {
  readonly viewHeight: number;
  readonly appearHeight: number;
  readonly items: readonly PanelScrollItem[];
}

export function fillCardBottoms(bottoms: readonly (number | null)[]): number[] {
  let previous = Number.NEGATIVE_INFINITY;
  return bottoms.map((bottom) => {
    if (bottom !== null) previous = bottom;
    return previous;
  });
}

export function panelScrollTop({ viewHeight, appearHeight, items }: PanelScrollInput): number {
  if (viewHeight <= 0) return 0;

  let last = -1;
  items.forEach((item, index) => {
    if (item.cardBottom <= appearHeight) last = index;
  });

  const lastItem = last >= 0 ? items[last] : undefined;
  if (!lastItem) return 0;

  return Math.max(0, lastItem.top + lastItem.height - viewHeight);
}

interface PanelSyncState {
  readonly applied: number;
  readonly manual: { readonly at: number; readonly from: number } | null;
}

interface PanelSyncResult {
  readonly scroll: number | null;
  readonly state: PanelSyncState;
}

export const INITIAL_PANEL_SYNC: PanelSyncState = { applied: 0, manual: null };

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

export function holdPanelSync(current: number, target: number): PanelSyncState {
  return { applied: current, manual: { at: current, from: target } };
}
