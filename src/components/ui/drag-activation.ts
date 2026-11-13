// ─────────────────────────────
// 掴み始めの決まり。フロー画面のドラッグ（並べ替え・結線）と会話のプロンプトの項目の並べ替えで共有する。
// ─────────────────────────────

/** マウスは 4px 動かしたら掴む（押しただけのクリックと分ける） */
export const MOUSE_ACTIVATION = { activationConstraint: { distance: 4 } };

/**
 * 指は 250ms 押したままで掴む。その間に 8px 以上動いたら掴まず、画面の送りになる
 * （動かしてすぐ掴むと、カードや変数の上から画面を送れない）
 */
export const TOUCH_ACTIVATION = { activationConstraint: { delay: 250, tolerance: 8 } };
