import { cva } from 'class-variance-authority';

export const dialogControl = cva(
  `rounded-sm border-0 bg-transparent px-0.5 text-xs outline-none
    focus-visible:outline-1 focus-visible:outline-ring`,
  {
    variants: {
      kind: {
        field: '',
        choice: 'text-muted-foreground hover:text-foreground',
      },
    },
  },
);
