import { cva } from 'class-variance-authority';
import { createContext } from 'react';

import type { DragHandlers } from '@/hooks/ui/use-drag-from';
import type { DialogMode } from '@/lib/dialog-rect';

export interface DialogChrome {
  readonly mode: DialogMode;
  readonly onToggleMode: (() => void) | null;
  readonly move: DragHandlers | null;
  readonly visible?: boolean | undefined;
}

export const DialogChromeContext = createContext<DialogChrome | null>(null);

export const dialogOpening = cva(
  'animate-in fade-in-0 animation-duration-150 ease-out motion-reduce:animate-none',
  { variants: { mode: { floating: 'zoom-in-95', embedded: '' } } },
);
