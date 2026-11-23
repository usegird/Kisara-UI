import { cva } from 'class-variance-authority';
import { Triangle, type LucideIcon } from 'lucide-react';

import { dialogControl } from '@/components/ui/dialog-control';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

const sortIcon = cva(cn(dialogControl({ kind: 'choice' }), 'flex h-7 items-center px-1'), {
  variants: {
    active: {
      true: 'text-foreground',
      false: 'text-muted-foreground hover:text-foreground',
    },
  },
});

const sortArrow = cva(
  'flex h-3 items-center rounded-sm px-0.5 focus-visible:outline-1 focus-visible:outline-ring',
  {
    variants: {
      on: {
        true: 'text-foreground',
        false: 'text-muted-foreground hover:text-foreground',
      },
    },
  },
);

export interface SortOption<K extends string> {
  readonly key: K;
  readonly label: string;
  readonly Icon: LucideIcon;
}

export interface SortButtonsProps<K extends string> {
  readonly options: readonly SortOption<K>[];
  readonly sortKey: K;
  readonly ascending: boolean;
  readonly onSort: (key: K, ascending: boolean) => void;
}

export function SortButtons<K extends string>({
  options,
  sortKey,
  ascending,
  onSort,
}: SortButtonsProps<K>): React.ReactElement {
  return (
    <span className="mr-1.5 flex items-center gap-1">
      {options.map((option) => (
        <SortButton
          key={option.key}
          option={option}
          active={option.key === sortKey}
          ascending={ascending}
          onSort={onSort}
        />
      ))}
    </span>
  );
}

function SortButton<K extends string>({
  option,
  active,
  ascending,
  onSort,
}: {
  readonly option: SortOption<K>;
  readonly active: boolean;
  readonly ascending: boolean;
  readonly onSort: (key: K, ascending: boolean) => void;
}): React.ReactElement {
  const label = active
    ? t(ascending ? 'modelPicker.sort.ascending' : 'modelPicker.sort.descending', {
        name: option.label,
      })
    : t('modelPicker.sort.pick', { name: option.label });
  const upLabel = t('modelPicker.sort.setAscending', { name: option.label });
  const downLabel = t('modelPicker.sort.setDescending', { name: option.label });
  return (
    <span className="flex h-7 items-center">
      <button
        type="button"
        className={sortIcon({ active })}
        aria-label={label}
        aria-pressed={active}
        title={label}
        onClick={() => onSort(option.key, active ? !ascending : true)}
      >
        <option.Icon className="size-4" aria-hidden />
      </button>
      <span className="flex flex-col">
        <button
          type="button"
          className={sortArrow({ on: active && ascending })}
          aria-label={upLabel}
          aria-pressed={active && ascending}
          title={upLabel}
          onClick={() => onSort(option.key, true)}
        >
          <Triangle className="size-2 fill-current" aria-hidden />
        </button>
        <button
          type="button"
          className={sortArrow({ on: active && !ascending })}
          aria-label={downLabel}
          aria-pressed={active && !ascending}
          title={downLabel}
          onClick={() => onSort(option.key, false)}
        >
          <Triangle className="size-2 rotate-180 fill-current" aria-hidden />
        </button>
      </span>
    </span>
  );
}
