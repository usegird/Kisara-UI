import { cva } from 'class-variance-authority';

export const ICON_BUTTON = `text-muted-foreground hover:text-foreground hover:bg-muted inline-flex
  size-6 shrink-0 items-center justify-center rounded-md disabled:pointer-events-none
  disabled:opacity-40`;

export const PLAYBOOK_FIELD =
  'bg-background w-full rounded-md border px-2 py-1 text-xs outline-none focus:border-ring';

export const PLAYBOOK_TOGGLE =
  'text-muted-foreground hover:text-foreground flex items-center gap-1 self-start text-xs';

export const playbookLink = cva(
  `text-primary self-start text-left text-xs underline-offset-2 hover:underline
    disabled:pointer-events-none disabled:opacity-40`,
  {
    variants: { primary: { true: 'font-medium', false: '' } },
    defaultVariants: { primary: false },
  },
);
