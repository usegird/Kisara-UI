import { createContext } from 'react';

// ─────────────────────────────
// 出力（出力チップ・変数ボックス）を掴んでいる間だけ真。パラメータ行は、この間だけ落とし先を置く。
// 掴んだときと離したときにだけ変わるので、カードの並べ替えの間は行が描き直されない
// ─────────────────────────────

export const LinkDragContext = createContext(false);
