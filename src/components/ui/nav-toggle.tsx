import { Menu } from 'lucide-react';

export const NAV_TOGGLE_MARK = 'data-nav-toggle';

export interface NavToggleProps {
  readonly label: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

export function NavToggle({ label, expanded, onToggle }: NavToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground hover:bg-muted relative top-px flex
        size-6 shrink-0 items-center justify-center rounded focus-visible:outline-2"
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      onClick={onToggle}
      {...{ [NAV_TOGGLE_MARK]: '' }}
    >
      <Menu className="size-4" aria-hidden />
    </button>
  );
}
