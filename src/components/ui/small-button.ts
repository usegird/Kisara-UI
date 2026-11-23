import { cva } from 'class-variance-authority';

export const smallButton = cva(
  'hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
  {
    variants: { fade: { true: 'disabled:opacity-40', false: '' } },
    defaultVariants: { fade: false },
  },
);

export const SMALL_ICON_BUTTON = 'hover:bg-muted rounded p-0.5 disabled:opacity-40';
