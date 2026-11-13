import type { AnchorRect, Rects } from '@/hooks/ui/use-anchor-registry';

// ─────────────────────────────
// 会話のタブで画像ビューワーを重ねる範囲。測った位置（外枠を原点）から決める。
// ─────────────────────────────

/** 会話の画面で重ねる範囲の左右に空ける幅 */
const CHAT_SIDE_GAP = 16;

/** 幅か高さが無いもの（出していない・幅の狭い画面で隠している）は無いとみなす */
function shown(rect: AnchorRect | undefined): AnchorRect | undefined {
  return rect !== undefined && rect.right > rect.left && rect.bottom > rect.top ? rect : undefined;
}

/** 重ねる範囲の置き方。まだ測れていなければ null */
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
  // 会話の画面では、上端と下端を会話の一覧の列の上端と入力欄の下に、左右を空けて揃える
  const margins = 'var(--spacing-column-top) - var(--spacing-column-bottom)';
  return {
    left: chat.left + CHAT_SIDE_GAP,
    top: `calc(${String(chat.top)}px + var(--spacing-column-top))`,
    width: chat.right - chat.left - CHAT_SIDE_GAP * 2,
    height: `calc(${String(chat.bottom - chat.top)}px - ${margins})`,
  };
}
