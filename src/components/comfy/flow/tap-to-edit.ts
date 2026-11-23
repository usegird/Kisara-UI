const EDITABLE =
  'input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=hidden]),' +
  ' textarea';

const OWN_TAP = 'button, a, select, label, [role=button], [role=combobox], [role=switch]';

const BOUNDARY = 'article, [data-flow-item]';

export const TAP_TO_EDIT_CLASS =
  'pointer-coarse:[&_:is(input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=hidden]),textarea):not(:focus)]:pointer-events-none';

function coarsePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

export function focusTappedField(event: React.MouseEvent<HTMLElement>): void {
  if (!coarsePointer()) return;
  const target = event.target;
  if (!(target instanceof Element) || target.matches(EDITABLE) || target.closest(OWN_TAP)) return;

  for (
    let node: Element | null = target;
    node !== null && node !== event.currentTarget;
    node = node.parentElement
  ) {
    const fields: NodeListOf<HTMLElement> = node.querySelectorAll<HTMLElement>(EDITABLE);
    const only: HTMLElement | undefined = fields.length === 1 ? fields[0] : undefined;
    if (only !== undefined) {
      only.focus();
      return;
    }
    if (fields.length > 1 || node.matches(BOUNDARY)) return;
  }
}
