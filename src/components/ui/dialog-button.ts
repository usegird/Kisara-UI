import { cva } from 'class-variance-authority';

export const dialogButton = cva('rounded-md px-3 py-1 text-sm disabled:opacity-50', {
  variants: {
    tone: {
      primary: 'bg-primary text-primary-foreground',
      secondary: 'border-input border',
    },
  },
});
