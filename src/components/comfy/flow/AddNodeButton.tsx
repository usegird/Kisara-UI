import { cva } from 'class-variance-authority';
import { CirclePlus } from 'lucide-react';

import { MENU_ACTION } from '@/lib/menu-actions';

const addNodeButton = cva(
  'bg-background text-muted-foreground hover:text-foreground rounded-full transition-opacity',
  {
    variants: {
      shown: {
        always: '',
        hover: 'opacity-0 group-hover/gap:opacity-100 focus:opacity-100',
      },
    },
  },
);

export interface AddNodeButtonProps {
  readonly label: string;
  readonly title: string;
  readonly shown: 'always' | 'hover';
  readonly onClick: () => void;
  readonly menuAction?: boolean | undefined;
}

export function AddNodeButton({
  label,
  title,
  shown,
  onClick,
  menuAction = false,
}: AddNodeButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={addNodeButton({ shown })}
      aria-label={label}
      title={title}
      onClick={onClick}
      {...(menuAction ? MENU_ACTION : {})}
    >
      <CirclePlus className="size-4" aria-hidden />
    </button>
  );
}
