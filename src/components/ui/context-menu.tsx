import { ContextMenu } from '@base-ui/react/context-menu';
import { Check, ChevronRight } from 'lucide-react';

import type { MenuAction, MenuActionSection } from '@/lib/menu-actions';

// ─────────────────────────────
// 右クリックメニューの見た目。開閉・矢印キー・焦点の持ち回り・メニューキー / Shift+F10 は
// Base UI に任せ、ここは層をまたいで同じ見た目にするだけ。
// ─────────────────────────────

/** 右クリックメニューの根（Base UI のまま） */
export const ContextMenuRoot = ContextMenu.Root;
/** 右クリックで開く要素（Base UI のまま） */
export const ContextMenuTrigger = ContextMenu.Trigger;

/** メニューの中身の props */
export interface ContextMenuContentProps {
  readonly children: React.ReactNode;
  /** 読み上げのメニューの名前 */
  readonly label: string;
  /** 閉じたあとの焦点。既定は基盤に任せる */
  readonly finalFocus?: (() => HTMLElement | true) | undefined;
}

/** メニューの浮かぶ枠 */
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

/** 操作のまとまりの props */
export interface ContextMenuActionSectionsProps {
  readonly sections: readonly MenuActionSection[];
  readonly onChoose: (action: MenuAction) => void;
  /** 各まとまりの末尾に足す項目（見出しの名前で引く） */
  readonly extra?: ((section: MenuActionSection, index: number) => React.ReactNode) | undefined;
}

/** 名前を key にする。同じ名前が続いたら何度目かを添える（位置そのものは key にしない） */
function uniqueKeys(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}#${String(count)}`;
  });
}

/**
 * Tab から外した操作のまとまり。見出しごとに区切り、最後にも区切りを置く
 * （続くいつもの項目と分ける）
 */
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

/** メニューの項目の props */
export interface ContextMenuItemProps {
  readonly children: React.ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  /** 押せない理由などの補足。指し示したときに出す */
  readonly title?: string | undefined;
}

/** メニューの項目 1 つ */
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

/** 項目の間の区切りの線 */
export function ContextMenuSeparator(): React.ReactElement {
  return <ContextMenu.Separator className="bg-border mx-1 my-1 h-px" />;
}

/** 入れ子のメニューの props */
export interface ContextMenuSubmenuProps {
  /** 開く項目の名前。入れ子のメニューの読み上げの名前にもなる */
  readonly label: string;
  readonly children: React.ReactNode;
}

/** 入れ子のメニュー。指すか右キーで開く（開閉と焦点は Base UI に任せる） */
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

/** 1 つだけ選ぶ組の props */
export interface ContextMenuRadioGroupProps<T> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly children: React.ReactNode;
}

/** 1 つだけ選ぶ項目の組。選んでいるものに印を付ける */
export function ContextMenuRadioGroup<T>({
  value,
  onValueChange,
  children,
}: ContextMenuRadioGroupProps<T>): React.ReactElement {
  return (
    <ContextMenu.RadioGroup
      value={value}
      // Base UI の値は any で渡ってくる。ここに並べた項目の値だけが来る
      onValueChange={(next: T) => onValueChange(next)}
    >
      {children}
    </ContextMenu.RadioGroup>
  );
}

/** 1 つだけ選ぶ項目の props */
export interface ContextMenuRadioItemProps<T> {
  readonly value: T;
  readonly children: React.ReactNode;
  /** 名前の前に置く色見本。無ければ出さない */
  readonly swatch?: string | undefined;
}

/** 1 つだけ選ぶ項目。選んだら閉じる */
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
