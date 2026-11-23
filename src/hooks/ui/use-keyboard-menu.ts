import { useRef, useState } from 'react';

import { menuActionSections, type MenuAction, type MenuActionSection } from '@/lib/menu-actions';

const KEY_WINDOW = 1000;

export interface KeyboardMenu {
  readonly sections: readonly MenuActionSection[] | null;
  readonly onKeyDownCapture: (event: React.KeyboardEvent) => void;
  readonly take: (event: React.MouseEvent) => readonly MenuActionSection[] | null;
  readonly choose: (action: MenuAction) => void;
  readonly finalFocus: () => HTMLElement | true;
}

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
      window.setTimeout(() => action.element.click(), 0);
      return true;
    },
  };
}
