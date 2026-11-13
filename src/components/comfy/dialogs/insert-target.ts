import { INSERT_SOURCE_MARK, type TextField } from '@/lib/insert-at-caret';

export { INSERT_SOURCE_MARK };

// ─────────────────────────────
// 重ねる画面（スタイルの編集・ワイルドカード）から外の入力欄へ文字を差し込む決まり。
// 2 つの画面で同じ決まりを使うので、ここに 1 つだけ置く。
// ─────────────────────────────

/**
 * 差し込み先にしてよい欄か。差し込み元の画面の中の欄は除く（自分の文面を自分へ入れても意味がない）。
 * `useTextFieldWhile` に渡す。描画ごとに作り直さないよう、ここで 1 つだけ作る
 */
export function acceptInsertTarget(field: TextField): boolean {
  return field instanceof HTMLTextAreaElement && field.closest(`[${INSERT_SOURCE_MARK}]`) === null;
}
