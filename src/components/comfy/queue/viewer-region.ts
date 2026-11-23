import type { AnchorRect, Rects } from '@/hooks/ui/use-anchor-registry';

const CHAT_SIDE_GAP = 16;

function shown(rect: AnchorRect | undefined): AnchorRect | undefined {
  return rect !== undefined && rect.right > rect.left && rect.bottom > rect.top ? rect : undefined;
}

export function viewerRegion(rects: Rects): React.CSSProperties | null {
  const side = shown(rects.get('side'));
  if (side !== undefined) {
    const column = shown(rects.get('chatColumn'));
    const left = Math.min(column?.right ?? side.left, side.left);
    const top = Math.min(shown(rects.get('sideTabs'))?.top ?? side.top, side.top);
    return { left, top, width: side.right - left, height: side.bottom - top };
  }
  const chat = shown(rects.get('chat'));
  if (chat === undefined) return null;
  const margins = 'var(--spacing-column-top) - var(--spacing-column-bottom)';
  return {
    left: chat.left + CHAT_SIDE_GAP,
    top: `calc(${String(chat.top)}px + var(--spacing-column-top))`,
    width: chat.right - chat.left - CHAT_SIDE_GAP * 2,
    height: `calc(${String(chat.bottom - chat.top)}px - ${margins})`,
  };
}
