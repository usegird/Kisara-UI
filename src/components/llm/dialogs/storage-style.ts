import { cva } from 'class-variance-authority';

import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';

export const RIGHT_MIN = 386;

export const BUTTON =
  'hover:bg-muted shrink-0 rounded-md border px-2 py-0.5 text-xs disabled:opacity-40';

export const ICON_SPACER = 'w-[22px] shrink-0';

export const MARKED = { true: 'line-through opacity-50', false: '' };

export const deleteIcon = cva(`${DIALOG_ICON_CLASS} shrink-0`, {
  variants: { marked: { true: 'bg-muted text-destructive', false: '' } },
});

export const ROW_GRID = 'col-span-full grid grid-cols-subgrid items-center';

export const BACKUP_CELL =
  'col-start-2 ml-2 flex flex-wrap content-center items-center gap-x-2 self-stretch border-l pl-2';
