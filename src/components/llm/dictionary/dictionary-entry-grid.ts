// ─────────────────────────────
// 追加辞書のダイアログの項目の列。一覧の見出し・項目の行・操作の帯で同じ列を使う。
// 部品と別のファイルに置く（部品以外を一緒に export すると Fast Refresh が状態を保てない）。
// ─────────────────────────────

/**
 * 列の幅。取っ手・有効・三角・トリガーワード（残りの幅）・発動率・追加先・位置・発言者・消す
 */
export const ENTRY_GRID =
  'grid grid-cols-[1rem_1rem_0.75rem_minmax(0,1fr)_3.5rem_5.625rem_3.5rem_5.5rem_1rem] ' +
  'items-center gap-x-1.5 gap-y-1';

/** 取っ手の列から三角の列まで（「⊕ 追加」と、開いた段の見出し） */
export const ENTRY_LEAD = 'col-[1/4]';

/** トリガーワードの列から右端まで */
export const ENTRY_REST = 'col-[4/-1]';
