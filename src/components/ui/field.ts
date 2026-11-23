import { cva } from 'class-variance-authority';

export const field = cva('border-input bg-background rounded-md border px-2 py-1', {
  variants: {
    size: { inherit: '', xs: 'text-xs', sm: 'text-sm' },
    width: { auto: '', full: 'w-full', control: 'max-w-(--control-max)' },
  },
  defaultVariants: { size: 'inherit', width: 'auto' },
});

export const FIELD_XS = field({ size: 'xs' });
