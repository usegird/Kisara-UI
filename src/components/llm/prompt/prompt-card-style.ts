import { cva } from 'class-variance-authority';

export const cardRow = cva('group/card flex min-w-0 flex-col rounded-md px-1 py-1 text-xs', {
  defaultVariants: { locked: false, joinUp: false, joinDown: false },
  variants: {
    enabled: { true: '', false: 'text-muted-foreground' },
    dragging: { true: 'opacity-30', false: '' },
    locked: { true: 'bg-band/50', false: '' },
    joinUp: { true: '-mt-1 rounded-t-none pt-2', false: '' },
    joinDown: { true: 'rounded-b-none', false: '' },
  },
});

export interface BandJoin {
  readonly joinUp: boolean;
  readonly joinDown: boolean;
}

export const NO_JOIN: BandJoin = { joinUp: false, joinDown: false };
