import { cva } from 'class-variance-authority';

export const THUMBNAIL_FRAME = `bg-muted text-muted-foreground/60 flex size-14 shrink-0 items-center
  justify-center overflow-hidden rounded border`;

export const cardList = cva('gap-1.5', {
  variants: {
    wrap: {
      false: 'flex flex-col',
      true: 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]',
    },
  },
});
