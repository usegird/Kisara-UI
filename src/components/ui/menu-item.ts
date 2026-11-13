// ─────────────────────────────
// メニューの項目の見た目（Base UI の Menu.Item・Autocomplete.Item に渡す）。
// 指した・キーで選んだ項目は accent の色、押せない項目は淡くする（右クリックのメニューと同じ）。
// 部品の中で同じ列を書き直さない
// ─────────────────────────────

/** メニューの 1 項目。文字だけの項目でも同じ（並びの間隔は中身が 1 つなら効かない） */
export const MENU_ITEM_CLASS = `data-highlighted:bg-accent data-highlighted:text-accent-foreground
  flex cursor-default items-center gap-2 rounded px-2 py-1 outline-none select-none
  data-disabled:opacity-50`;
