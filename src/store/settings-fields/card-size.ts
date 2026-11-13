import { normalizeInRange } from '@/lib/clamp';

// ─────────────────────────────
// 一覧のカードの大きさ。**刻みで大小できる**ようにするための計算だけを持つ。
// 端末に残す値なので、壊れた保存値でも既定へ落ちること。
// ─────────────────────────────

/** カードの幅の下限の、高さに対する比（おおよそ 2:3） */
const CARD_WIDTH_RATIO = 0.7;

export const CARD_HEIGHT_MIN = 120;
export const CARD_HEIGHT_MAX = 600;
/** 入力欄の上下 1 回ぶん */
export const CARD_HEIGHT_STEP = 30;
export const CARD_HEIGHT_DEFAULT = 240;

/** 一度に描くカードの枚数。同時に走る画像の要求もこの数で頭打ちになる */
export const CARD_LIST_STEP = 40;

/** 保存値の読み直し。数値でなければ既定、範囲外なら端に寄せる */
export function normalizeCardHeight(value: unknown): number {
  // 上下限が整数なので、丸めてから収めても収めてから丸めても同じ値になる
  return normalizeInRange(
    value,
    { initial: CARD_HEIGHT_DEFAULT, min: CARD_HEIGHT_MIN, max: CARD_HEIGHT_MAX },
    { round: true },
  );
}

/**
 * 入力欄に打った高さ。**整数で範囲に入ったときだけ**値にする（空・打鍵の途中・範囲外は null）。
 * 打鍵の途中で端へ寄せない（寄せると「1」と打った瞬間に下限へ飛ぶ）
 */
export function parseCardHeight(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text);
  return value >= CARD_HEIGHT_MIN && value <= CARD_HEIGHT_MAX ? value : null;
}

/**
 * カードの幅の下限。高さから決めて**画面が広いほど枚数が増える**ようにする。
 * 縦長（おおよそ 2:3）にすると、モデルの見本画像がいちばん収まりよく出る。
 */
export function cardMinWidth(height: number): number {
  return Math.round(height * CARD_WIDTH_RATIO);
}
