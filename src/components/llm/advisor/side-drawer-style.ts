import { cva } from 'class-variance-authority';

export const cardStack = cva(
  'top-column-top absolute z-20 flex max-w-[calc(100%-1rem)] flex-row items-start',
  { variants: { side: { left: 'left-2 flex-row-reverse', right: 'right-4' } } },
);

export const sideDrawer = cva(
  `top-column-top bottom-column-bottom bg-background animate-in pointer-events-auto absolute flex
    max-w-[calc(100%-1rem)] rounded-md border shadow-lg animation-duration-200 ease-out
    motion-reduce:animate-none`,
  {
    variants: {
      side: {
        left: 'slide-in-from-left left-2 flex-row-reverse',
        right: 'slide-in-from-right right-4',
      },
    },
  },
);
