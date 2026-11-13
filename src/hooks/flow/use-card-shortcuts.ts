import { useEffect } from 'react';

import { isTextOrDialogTarget } from '@/hooks/flow/use-card-clipboard';
import { historyKeyOf } from '@/lib/text-entry';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// カードの削除・取り消し・やり直しのキー操作。FlowCanvas から切り出した手続きで、使うのはそこだけ。
// 文字の入力欄・ダイアログの中では取らない（欄やダイアログの操作に任せる）。
// ─────────────────────────────

/**
 * アプリ入力の列の中（取り消しは列の値に任せる）。
 */
const APP_INPUT_COLUMN = '[data-app-input-column]';

function insideAppInputs(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(APP_INPUT_COLUMN) !== null;
}

/** 取り消し・やり直しのキー。どちらでもなければ null */
/**
 * カードの Delete・取り消し・やり直しのキーを文書全体で受ける。
 * @param deleteSelected - 選んでいるカードを外す（抜ける動きは呼ぶ側が付ける）
 */
export function useCardShortcuts(deleteSelected: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isTextOrDialogTarget(event.target)) return;

      const history = historyKeyOf(event);
      if (history !== null) {
        if (insideAppInputs(event.target)) return;
        // 押したときの値だけを読む（購読はしない）
        const graph = useGraphStore.getState();
        if (history === 'undo' ? graph.undo() : graph.redo()) event.preventDefault();
        return;
      }

      const plain = !(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey);
      if (event.key !== 'Delete' || !plain) return;
      if (useGraphStore.getState().selectedNodeIds.length === 0) return;
      event.preventDefault();
      deleteSelected();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected]);
}
