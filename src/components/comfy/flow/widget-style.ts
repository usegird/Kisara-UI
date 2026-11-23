import { cva, type VariantProps } from 'class-variance-authority';

import { field } from '@/components/ui/field';
import { cn } from '@/lib/utils';

const widgetControlVariants = cva('w-full text-xs disabled:opacity-60', {
  variants: {
    appearance: {
      box: field(),
      underline: `border-foreground/25 hover:border-foreground/45 focus:border-ring rounded-none
        border-0 border-b bg-transparent px-0.5 py-0.5 focus:outline-none`,
    },
    multiline: {
      true: 'resize-none font-mono leading-snug',
      false: '',
    },
    dirty: {
      true: '',
      false: '',
    },
    muted: {
      true: 'text-muted-foreground',
      false: '',
    },
    invalid: {
      true: 'text-destructive',
      false: '',
    },
    clearable: {
      true: 'pr-6',
      false: '',
    },
  },
  compoundVariants: [
    { appearance: 'box', multiline: true, className: 'min-h-12' },
    {
      appearance: 'underline',
      multiline: true,
      className: 'min-h-12 rounded-md border border-input px-1.5 py-1',
    },
    {
      multiline: true,
      dirty: true,
      className: 'border-edited focus:border-edited border-2 focus:outline-none',
    },
    { appearance: 'box', multiline: true, dirty: true, className: 'px-[7px] py-[3px]' },
    { appearance: 'underline', multiline: true, dirty: true, className: 'px-[5px] py-[3px]' },
  ],
  defaultVariants: {
    appearance: 'box',
    multiline: false,
    dirty: false,
    muted: false,
    invalid: false,
    clearable: false,
  },
});

export type WidgetAppearance = NonNullable<
  VariantProps<typeof widgetControlVariants>['appearance']
>;

export function widgetControl(
  options: VariantProps<typeof widgetControlVariants>,
  className?: string,
): string {
  return cn(widgetControlVariants(options), className);
}
