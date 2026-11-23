const MENU_ACTION_ATTR = 'data-menu-action';
const MENU_ROW_ATTR = 'data-menu-row';
const MENU_SCOPE_ATTR = 'data-menu-scope';
const MENU_LABEL_ATTR = 'data-menu-label';

export const MENU_ACTION = { tabIndex: -1, [MENU_ACTION_ATTR]: '' } as const;

export interface MenuAction {
  readonly label: string;
  readonly disabled: boolean;
  readonly focus: boolean;
  readonly element: HTMLElement;
}

export interface MenuActionSection {
  readonly label: string;
  readonly actions: readonly MenuAction[];
}

function actionOf(element: HTMLElement): MenuAction {
  const label =
    element.getAttribute(MENU_LABEL_ATTR) ??
    element.getAttribute('aria-label') ??
    element.getAttribute('title') ??
    element.textContent?.trim() ??
    '';
  const disabled =
    (element instanceof HTMLButtonElement && element.disabled) ||
    element.getAttribute('aria-disabled') === 'true';
  const focus =
    element.getAttribute('role') === 'separator' || element.hasAttribute('aria-roledescription');
  return { label, disabled, focus, element };
}

function collect(
  root: Element,
  scope: Element,
  include: (element: HTMLElement) => boolean,
): MenuAction[] {
  return [...root.querySelectorAll<HTMLElement>(`[${MENU_ACTION_ATTR}]`)]
    .filter((element) => element.closest(`[${MENU_SCOPE_ATTR}]`) === scope && include(element))
    .map(actionOf)
    .filter((action) => action.label.length > 0);
}

export function menuActionSections(origin: Element): MenuActionSection[] {
  const scope = origin.closest(`[${MENU_SCOPE_ATTR}]`);
  if (scope === null) return [];
  const row = origin.closest(`[${MENU_ROW_ATTR}]`);
  const inRow = row !== null && scope.contains(row) ? row : null;

  const sections: MenuActionSection[] = [];
  if (inRow !== null) {
    sections.push({
      label: inRow.getAttribute(MENU_ROW_ATTR) ?? '',
      actions: collect(inRow, scope, () => true),
    });
  }
  sections.push({
    label: scope.getAttribute(MENU_SCOPE_ATTR) ?? '',
    actions: collect(scope, scope, (element) => {
      const owner = element.closest(`[${MENU_ROW_ATTR}]`);
      return owner === null || !scope.contains(owner);
    }),
  });
  return sections.filter((section) => section.actions.length > 0);
}
