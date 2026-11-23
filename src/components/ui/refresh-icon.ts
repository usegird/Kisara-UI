import { cva } from 'class-variance-authority';

export const refreshIcon = cva('', {
  variants: {
    size: { sm: 'size-3.5', md: 'size-4' },
    loading: { true: 'motion-safe:animate-spin', false: '' },
  },
  defaultVariants: { size: 'md', loading: false },
});
