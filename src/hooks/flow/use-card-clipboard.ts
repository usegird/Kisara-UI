import { useEffect, useRef } from 'react';

import type { NodeId } from '@/graph/types';
import { isTextEntry } from '@/lib/text-entry';
import { useGraphStore } from '@/store/use-graph-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// カードの写しと貼り付けのキー操作。FlowCanvas から切り出した手続きで、使うのはそこだけ。
// ─────────────────────────────

/** ダイアログの中（取らない） */
const DIALOG = '[role="dialog"],[role="alertdialog"],[data-dialog-window]';

/** 文字の入力欄・ダイアログの中（カードのキー操作を取らない。use-card-shortcuts も使う） */
export function isTextOrDialogTarget(target: EventTarget | null): boolean {
  return isTextEntry(target) || (target instanceof Element && target.closest(DIALOG) !== null);
}

/** 画面の文字を選んでいる（写すのはその文字） */
function hasTextSelection(): boolean {
  const selection = globalThis.getSelection();
  return selection !== null && !selection.isCollapsed;
}

/**
 * Ctrl+C で選んでいるカードを覚え、Ctrl+V で `paste` を呼ぶ
 * @param paste - 写したカードと、後ろに足す相手の候補（貼るときに選んでいるカード。
 *   選んでいなければ写したカード）を受ける。どのカードの後ろかは呼ぶ側が並びから決める
 */
export function useCardClipboard(
  paste: (sources: readonly NodeId[], after: readonly NodeId[]) => void,
): void {
  const copied = useRef<{ readonly tab: string; readonly nodeIds: readonly NodeId[] } | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (
        (key !== 'c' && key !== 'v') ||
        event.defaultPrevented ||
        isTextOrDialogTarget(event.target)
      ) {
        return;
      }
      // 押したときの値だけを読む（購読はしない。選び直しで描き直さない）
      const tab = useTabsStore.getState().activeId;
      const selected = useGraphStore.getState().selectedNodeIds;

      if (key === 'c') {
        if (selected.length === 0 || hasTextSelection()) return;
        copied.current = { tab, nodeIds: selected };
        event.preventDefault();
        return;
      }
      const source = copied.current;
      // クローンは入力の線を元と同じ相手から引くので、別のタブのワークフローには貼れない
      if (source === null || source.tab !== tab) return;
      event.preventDefault();
      paste(source.nodeIds, selected.length > 0 ? selected : source.nodeIds);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [paste]);
}
