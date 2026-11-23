import { cva } from 'class-variance-authority';

export const stateLine = cva('inline-flex items-center gap-1.5 text-left', {
  variants: { failed: { true: 'text-destructive', false: 'text-muted-foreground' } },
});

export const disclosure = cva('size-2 shrink-0 fill-current transition-transform', {
  variants: { open: { true: 'rotate-90', false: '' } },
});

export const rerunButton = cva(
  `text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-5 shrink-0
  items-center justify-center rounded disabled:pointer-events-none`,
  { variants: { busy: { true: '', false: 'disabled:opacity-40' } } },
);

export const rerunIcon = cva('size-3', {
  variants: { busy: { true: 'motion-safe:animate-spin', false: '' } },
});
