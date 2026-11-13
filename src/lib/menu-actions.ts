// ─────────────────────────────
// Tab の止まる所から外した操作を、キーボードで開くメニューへ並べる。
// 印で集めるので、外したのにメニューに無い操作ができない。
// ─────────────────────────────

/** 外した操作の印 */
const MENU_ACTION_ATTR = 'data-menu-action';
/** 行のまとまり。値は行の名前（メニューの見出し） */
const MENU_ROW_ATTR = 'data-menu-row';
/** カード・枠のまとまり。値はその名前（メニューの見出し） */
const MENU_SCOPE_ATTR = 'data-menu-scope';
/** メニューでの名前。読み上げの名前が操作を言っていないもの（カードの名前）に付ける */
const MENU_LABEL_ATTR = 'data-menu-label';

/** Tab で止めず、キーボードで開くメニューから届く操作に付ける */
export const MENU_ACTION = { tabIndex: -1, [MENU_ACTION_ATTR]: '' } as const;

/** メニューに載せる操作 1 つ。印の付いた要素の読み上げの名前と、押せるかどうか */
export interface MenuAction {
  readonly label: string;
  readonly disabled: boolean;
  /** 焦点を移して続きをキーで行うもの（掴み）。false なら押す */
  readonly focus: boolean;
  readonly element: HTMLElement;
}

/** 見出しの下にまとめた操作の並び */
export interface MenuActionSection {
  /** 見出し（行・カードの名前） */
  readonly label: string;
  readonly actions: readonly MenuAction[];
}

function actionOf(element: HTMLElement): MenuAction {
  // 名前が無いもの（出力のチップ）は説明、それも無ければ文字
  const label =
    element.getAttribute(MENU_LABEL_ATTR) ??
    element.getAttribute('aria-label') ??
    element.getAttribute('title') ??
    element.textContent?.trim() ??
    '';
  const disabled =
    (element instanceof HTMLButtonElement && element.disabled) ||
    element.getAttribute('aria-disabled') === 'true';
  // 区切りの掴み（幅・高さ）と並べ替えの取っ手（基盤が役割の説明を付ける）は、焦点を移して動かす
  const focus =
    element.getAttribute('role') === 'separator' || element.hasAttribute('aria-roledescription');
  return { label, disabled, focus, element };
}

/**
 * `root` の中の印の付いた操作。`include` で絞る（表示の順）。
 * 入れ子のカード（開いた subgraph の中）の操作は、そのカードのものなので除く
 */
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

/**
 * `origin`（メニューを開いた所）から、その行とそのカード・枠の操作を集める。
 * 行の操作は行の見出しの下、残り（行の外の操作）はカード・枠の見出しの下に並べる
 */
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
    // 行の中の操作はその行で出す（ほかの行の操作は並べない）
    actions: collect(scope, scope, (element) => {
      const owner = element.closest(`[${MENU_ROW_ATTR}]`);
      return owner === null || !scope.contains(owner);
    }),
  });
  return sections.filter((section) => section.actions.length > 0);
}
