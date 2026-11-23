import { cva } from 'class-variance-authority';

import { TAP_TO_EDIT_CLASS } from '@/components/comfy/flow/tap-to-edit';

export const canvasFrame = cva(
  ['flex h-full flex-col overflow-hidden pt-column-top', TAP_TO_EDIT_CLASS],
  {
    variants: {
      narrow: { true: 'relative px-2 pb-2', false: 'pr-1 pl-6' },
    },
  },
);

export const flowScroller = cva('min-h-0 flex-1', {
  variants: {
    narrow: {
      true: 'overflow-auto overscroll-contain [container-type:size]',
      false: '-ml-[9px] w-[calc(100%+9px)] overflow-x-auto overflow-y-hidden pl-[9px]',
    },
  },
});

export const columnRow = cva('relative flex w-max gap-4', {
  variants: {
    narrow: { true: 'min-h-full items-start', false: 'h-full min-w-full items-stretch' },
  },
});
