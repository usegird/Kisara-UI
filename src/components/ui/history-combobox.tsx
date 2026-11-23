import { Autocomplete } from '@base-ui/react/autocomplete';
import { cva } from 'class-variance-authority';
import { ChevronDown, X } from 'lucide-react';
import { useState } from 'react';

import { MENU_ITEM_CLASS } from '@/components/ui/menu-item';
import { t } from '@/i18n';
import { insertAtCaret } from '@/lib/insert-at-caret';
import { entryKeyOf } from '@/lib/text-entry';
import { cn } from '@/lib/utils';

export interface HistoryComboboxProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly items: readonly string[];
  readonly label: string;
  readonly placeholder?: string | undefined;
  readonly example?: string | undefined;
  readonly title?: string | undefined;
  readonly onEnter?: (() => void) | undefined;
  readonly onPick?: ((item: string) => void) | undefined;
  readonly onRemove?: ((item: string) => void) | undefined;
  readonly className?: string | undefined;
  readonly bare?: boolean | undefined;
  readonly actions?: readonly HistoryComboboxAction[] | undefined;
}

interface HistoryComboboxAction {
  readonly label: string;
  readonly onSelect: () => void;
}

const ACTION_PREFIX = ':history-combobox:action:';

const actionItem = cva('', {
  variants: { first: { true: 'border-border mt-1 border-t', false: '' } },
});

function actionIndex(value: string): number | null {
  return value.startsWith(ACTION_PREFIX) ? Number(value.slice(ACTION_PREFIX.length)) : null;
}

const input = cva('w-full min-w-0 rounded-md py-1 pr-7 pl-2', {
  variants: {
    bare: {
      true: `hover:bg-background/60 focus:bg-background field-sizing-content w-auto max-w-full
        bg-transparent text-right outline-none focus-visible:outline-1 focus-visible:outline-ring`,
      false: 'border-input bg-background border',
    },
  },
});

const ITEM = `group/item ${MENU_ITEM_CLASS}`;

export function HistoryCombobox({
  value,
  onValueChange,
  items,
  label,
  placeholder,
  example,
  title,
  onEnter,
  onPick,
  onRemove,
  className,
  bare = false,
  actions = [],
}: HistoryComboboxProps): React.ReactElement {
  const [typed, setTyped] = useState(false);
  const [highlighted, setHighlighted] = useState<string | undefined>(undefined);
  const query = value.trim().toLowerCase();
  const matched =
    typed && query.length > 0 ? items.filter((item) => item.toLowerCase().includes(query)) : items;
  const actionValues = actions.map((_, index) => `${ACTION_PREFIX}${index}`);
  const all = [...items, ...actionValues];
  const shown = [...matched, ...actionValues];

  return (
    <div className={cn('relative inline-flex min-w-0 items-center', className)}>
      <Autocomplete.Root
        items={[...all]}
        filteredItems={[...shown]}
        value={value}
        openOnInputClick
        onOpenChange={(open) => {
          if (open) setTyped(false);
        }}
        onValueChange={(next, details) => {
          const index = actionIndex(next);
          if (index !== null) {
            actions[index]?.onSelect();
            return;
          }
          if (details.reason === 'input-change') setTyped(true);
          onValueChange(next);
          if (details.reason === 'item-press') onPick?.(next);
        }}
        onItemHighlighted={(item) => setHighlighted(typeof item === 'string' ? item : undefined)}
      >
        <Autocomplete.Input
          className={input({ bare })}
          placeholder={placeholder}
          aria-label={label}
          title={title}
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(event) => {
            if (event.key === 'Tab' && !event.shiftKey && value.length === 0 && example) {
              event.preventDefault();
              if (!insertAtCaret(event.currentTarget, example)) onValueChange(example);
              return;
            }
            if (event.key === 'Delete' && event.shiftKey && highlighted && onRemove) {
              event.preventDefault();
              onRemove(highlighted);
              return;
            }
            if (entryKeyOf(event) === 'commit' && highlighted === undefined && onEnter) {
              event.preventDefault();
              onEnter();
            }
          }}
        />
        {all.length > 0 ? (
          <Autocomplete.Trigger
            className="text-muted-foreground hover:text-foreground absolute right-1 rounded p-0.5"
            aria-label={t('ui.combobox.open', { name: label })}
          >
            <ChevronDown className="size-3.5" aria-hidden />
          </Autocomplete.Trigger>
        ) : null}
        <Autocomplete.Portal>
          <Autocomplete.Positioner className="z-50 outline-none" sideOffset={4} align="start">
            <Autocomplete.Popup
              className="bg-popover text-popover-foreground max-h-72 w-(--anchor-width) min-w-48
              overflow-y-auto rounded-md border p-1 text-xs shadow-md outline-none"
            >
              <Autocomplete.List>
                {(item: string) =>
                  actionIndex(item) !== null ? (
                    <Autocomplete.Item
                      key={item}
                      value={item}
                      className={cn(ITEM, actionItem({ first: actionIndex(item) === 0 }))}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {actions[actionIndex(item) ?? 0]?.label}
                      </span>
                    </Autocomplete.Item>
                  ) : (
                    <Autocomplete.Item key={item} value={item} className={ITEM}>
                      <span className="min-w-0 flex-1 truncate">{item}</span>
                      {onRemove ? (
                        <button
                          type="button"
                          tabIndex={-1}
                          className="text-muted-foreground hover:text-foreground rounded opacity-0
                        group-hover/item:opacity-100 group-data-highlighted/item:opacity-100"
                          aria-label={t('ui.combobox.remove', { item })}
                          title={t('ui.combobox.removeHint')}
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemove(item);
                          }}
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      ) : null}
                    </Autocomplete.Item>
                  )
                }
              </Autocomplete.List>
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      </Autocomplete.Root>
    </div>
  );
}
