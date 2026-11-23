import { cva } from 'class-variance-authority';

export const chatRow = cva(
  'flex w-full min-w-0 items-center gap-1.5 rounded px-2 py-1 text-left text-sm',
  {
    variants: {
      active: { true: 'bg-background font-medium', false: 'hover:bg-background/60' },
      tone: { plain: '', caution: 'text-caution' },
    },
    defaultVariants: { tone: 'plain' },
  },
);
