// ─────────────────────────────
// タブと中身の欄を読み上げで結ぶ id。タブバーと外枠の両方が使う
// （部品のファイルから部品以外を export すると Fast Refresh が状態を保てないので、ここに置く）。
// ─────────────────────────────

/** アクティブなタブの中身の欄（`role="tabpanel"`） */
export const TAB_PANEL_ID = 'app-tab-panel';

/** タブ 1 枚の要素の id */
export function tabElementId(tabId: string): string {
  return `app-tab-${tabId}`;
}
