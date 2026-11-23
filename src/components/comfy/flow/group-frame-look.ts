import type { CSSProperties } from 'react';

import { DEFAULT_GROUP_COLOR } from '@/graph/node-settings';
import { paintableColor } from '@/lib/color';

const FILL_TINT = 22;

interface GroupTone {
  readonly tab: CSSProperties;
  readonly frame: CSSProperties;
}

export function groupTone(color: string | undefined): GroupTone {
  const paint = paintableColor(color) ?? DEFAULT_GROUP_COLOR;
  const tint = `color-mix(in oklab, ${paint} ${String(FILL_TINT)}%, transparent)`;
  const fill = { backgroundColor: tint };
  return { tab: fill, frame: fill };
}

export const GROUP_FRAME_PADDING = 8;

export const GROUP_FRAME_PADDING_TOP = 4;

export const GROUP_FRAME_PADDING_BOTTOM = 6;

export const CARD_COLUMN_PADDING = GROUP_FRAME_PADDING;

export const SUBGRAPH_KNOB = 11;

export const CARD_COLUMN_PADDING_LEFT = GROUP_FRAME_PADDING + Math.ceil(SUBGRAPH_KNOB / 2) + 1;
