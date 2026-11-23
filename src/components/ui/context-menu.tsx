import { ContextMenu } from '@base-ui/react/context-menu';
import { Check, ChevronRight } from 'lucide-react';

import type { MenuAction, MenuActionSection } from '@/lib/menu-actions';

export const ContextMenuRoot = ContextMenu.Root;
export const ContextMenuTrigger = ContextMenu.Trigger;

export interface ContextMenuContentProps {
  readonly children: React.ReactNode;
  readonly label: string;
  readonly finalFocus?: (() => HTMLElement | true) | undefined;
}

export function ContextMenuContent({
  children,
  label,
  finalFocus,
}: ContextMenuContentProps): React.ReactElement {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner className="z-50 outline-none">
        <ContextMenu.Popup
          aria-label={label}
          className="bg-popover text-popover-foreground min-w-48 rounded-md border p-1 text-sm
            shadow-md outline-none"
          finalFocus={finalFocus}
        >
          {children}
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  );
}

export interface ContextMenuActionSectionsProps {
  readonly sections: readonly MenuActionSection[];
  readonly onChoose: (action: MenuAction) => void;
  readonly extra?: ((section: MenuActionSection, index: number) => React.ReactNode) | undefined;
}

function uniqueKeys(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}#${String(count)}`;
  });
}

export function ContextMenuActionSections({
  sections,
  onChoose,
  extra,
}: ContextMenuActionSectionsProps): React.ReactElement {
  const sectionKeys = uniqueKeys(sections.map((section) => section.label));
  return (
    <>
      {sections.map((section, index) => {
        const actionKeys = uniqueKeys(section.actions.map((action) => action.label));
        return (
          <ContextMenu.Group key={sectionKeys[index]}>
            <ContextMenu.GroupLabel className="text-muted-foreground px-2 pt-1 pb-0.5 text-xs">
              {section.label}
            </ContextMenu.GroupLabel>
            {section.actions.map((action, at) => (
              <ContextMenuItem
                key={actionKeys[at]}
                disabled={action.disabled}
                onClick={() => onChoose(action)}
              >
                {action.label}
              </ContextMenuItem>
            ))}
            {extra?.(section, index)}
            <ContextMenuSeparator />
          </ContextMenu.Group>
        );
      })}
    </>
  );
}

export interface ContextMenuItemProps {
  readonly children: React.ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly title?: string | undefined;
}

export function ContextMenuItem({
  children,
  onClick,
  disabled = false,
  title,
}: ContextMenuItemProps): React.ReactElement {
  return (
    <ContextMenu.Item
      className="data-highlighted:bg-accent data-highlighted:text-accent-foreground
        flex cursor-default items-center rounded px-2 py-1 outline-none select-none
        data-disabled:opacity-50"
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </ContextMenu.Item>
  );
}

export function ContextMenuSeparator(): React.ReactElement {
  return <ContextMenu.Separator className="bg-border mx-1 my-1 h-px" />;
}

export interface ContextMenuSubmenuProps {
  readonly label: string;
  readonly children: React.ReactNode;
}

export function ContextMenuSubmenu({
  label,
  children,
}: ContextMenuSubmenuProps): React.ReactElement {
  return (
    <ContextMenu.SubmenuRoot>
      <ContextMenu.SubmenuTrigger
        className="data-highlighted:bg-accent data-highlighted:text-accent-foreground
          data-popup-open:bg-accent flex cursor-default items-center justify-between gap-4
          rounded px-2 py-1 outline-none select-none"
      >
        {label}
        <ChevronRight className="size-3.5 opacity-60" aria-hidden />
      </ContextMenu.SubmenuTrigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-50 outline-none" alignOffset={-4}>
          <ContextMenu.Popup
            aria-label={label}
            className="bg-popover text-popover-foreground min-w-40 rounded-md border p-1 text-sm
              shadow-md outline-none"
          >
            {children}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.SubmenuRoot>
  );
}

export interface ContextMenuRadioGroupProps<T> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly children: React.ReactNode;
}

export function ContextMenuRadioGroup<T>({
  value,
  onValueChange,
  children,
}: ContextMenuRadioGroupProps<T>): React.ReactElement {
  return (
    <ContextMenu.RadioGroup
      value={value}
      onValueChange={(next: T) => onValueChange(next)}
    >
      {children}
    </ContextMenu.RadioGroup>
  );
}

export interface ContextMenuRadioItemProps<T> {
  readonly value: T;
  readonly children: React.ReactNode;
  readonly swatch?: string | undefined;
}

export function ContextMenuRadioItem<T>({
  value,
  children,
  swatch,
}: ContextMenuRadioItemProps<T>): React.ReactElement {
  return (
    <ContextMenu.RadioItem
      value={value}
      closeOnClick
      className="data-highlighted:bg-accent data-highlighted:text-accent-foreground flex
        cursor-default items-center gap-2 rounded py-1 pr-2 pl-1 outline-none select-none"
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <ContextMenu.RadioItemIndicator>
          <Check className="size-3.5" aria-hidden />
        </ContextMenu.RadioItemIndicator>
      </span>
      {swatch === undefined ? null : (
        <span
          aria-hidden
          className="border-border size-3.5 shrink-0 rounded-sm border"
          style={{ backgroundColor: swatch }}
        />
      )}
      {children}
    </ContextMenu.RadioItem>
  );
}
