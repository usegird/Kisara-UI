// ─────────────────────────────
// 並びの 1 つが滑り込む・抜ける動きの長さ。画面の動き（globals.css の `--kisara-motion`）と、
// 終わりを待つ手続きの両方がこの値に従う。
// ─────────────────────────────

/**
 * 滑り込み・抜け出し・折りたたみの動きの長さ（ms）。CSS は値を読めないので `--kisara-motion` に
 * 同じ値を書き、`tests/styles/motion-duration.test.ts` が揃っていることを確かめる
 */
export const MOTION_MS = 300;
