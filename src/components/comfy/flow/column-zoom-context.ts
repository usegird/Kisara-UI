import { createContext } from 'react';

// ─────────────────────────────
// 列の中身にかかっている倍率（1 が等倍）。画面の px で求めた移動量を、倍率のかかった要素へ
// 渡す前に割り戻すのに使う。列の外では等倍のまま。
// ─────────────────────────────

export const ColumnZoomContext = createContext(1);
