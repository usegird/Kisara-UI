import { useRef, useState } from 'react';

import { menuActionSections, type MenuAction, type MenuActionSection } from '@/lib/menu-actions';

// ─────────────────────────────
// 欄からキーボードで開くメニュー。カードとアプリ入力の列で使う。
// マウスの右クリックで出す中身は呼び出し元が決める。
// ─────────────────────────────

/** キーを押してから右クリックの知らせが来るまでの猶予（ms）。メニューキーは離したときに来る */
const KEY_WINDOW = 1000;

/** キーボードから開いたメニューの並びと、開く・選ぶ・閉じたあとの焦点の受け口 */
export interface KeyboardMenu {
  /** キーボードから開いたときの並び。マウスから開いたときは null */
  readonly sections: readonly MenuActionSection[] | null;
  readonly onKeyDownCapture: (event: React.KeyboardEvent) => void;
  /** 右クリックの知らせを受けた。キーボードから開いたなら集めた並び、マウスなら null */
  readonly take: (event: React.MouseEvent) => readonly MenuActionSection[] | null;
  /** 選んだ操作を、メニューが閉じてから行う */
  readonly choose: (action: MenuAction) => void;
  /** メニューが閉じたあとの焦点（掴みを選んだらそこ） */
  readonly finalFocus: () => HTMLElement | true;
}

/**
 * キーボードから開いたメニューに、開いた所の行とカード・枠から外した操作を集めて並べる。
 *
 * 右クリックの知らせそのものからはキーボードかマウスかを区別できないので、メニューキー・Shift+F10 を
 * 押したことを覚えておき、続いて来る知らせをキーボードから開いたものと見なす。
 * 選んだ操作はメニューが閉じてから行う。掴みは閉じたあとの焦点の行き先にし、押すものは焦点が
 * 元の欄へ戻ってから押す（開いた画面へ移る焦点を戻さない）。
 */
export function useKeyboardMenu(): KeyboardMenu {
  const [sections, setSections] = useState<readonly MenuActionSection[] | null>(null);
  const pressedAt = useRef(0);
  const chosen = useRef<MenuAction | null>(null);

  return {
    sections,
    onKeyDownCapture: (event) => {
      if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
        pressedAt.current = event.timeStamp;
      }
    },
    take: (event) => {
      const keyboard = pressedAt.current > 0 && event.timeStamp - pressedAt.current < KEY_WINDOW;
      pressedAt.current = 0;
      const origin = event.target instanceof Element ? event.target : null;
      const next = keyboard && origin !== null ? menuActionSections(origin) : null;
      setSections(next);
      return next;
    },
    choose: (action) => {
      chosen.current = action;
    },
    finalFocus: () => {
      const action = chosen.current;
      chosen.current = null;
      if (action === null) return true;
      if (action.focus) return action.element;
      // 焦点が元へ戻ってから押す（押して開く画面の焦点を取り返さない）
      window.setTimeout(() => action.element.click(), 0);
      return true;
    },
  };
}
