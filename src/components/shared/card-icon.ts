import { cva } from 'class-variance-authority';

export const cardIcon = cva(
  `inline-flex size-6 items-center justify-center rounded-sm text-white
    drop-shadow-[0_0_2px_rgb(0_0_0/0.9)] hover:text-white/80 focus-visible:opacity-100`,
  {
    variants: {
      shown: {
        always: '',
        hover: 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
      },
    },
  },
);

export const CARD_NAME_ICON = `text-muted-foreground hover:text-foreground hover:bg-accent
  inline-flex size-5 items-center justify-center rounded-sm`;
