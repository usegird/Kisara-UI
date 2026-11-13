// ─────────────────────────────
// スロット型ごとの配色。**色は接続先 ComfyUI の既定パレットに合わせる**。
// トークンは src/styles/globals.css に定義する。
// ─────────────────────────────

/**
 * 本家の既定パレットが色を持つ型。名前は `/object_info` の型名（小文字にして突き合わせる）。
 * ここに無い型は既定色＝本家で色を持たない型と同じ扱いになる
 */
const KNOWN_SLOTS = new Set([
  'clip',
  'clip_vision',
  'clip_vision_output',
  'conditioning',
  'control_net',
  'image',
  'latent',
  'mask',
  'model',
  'style_model',
  'vae',
  'noise',
  'guider',
  'sampler',
  'sigmas',
  'taesd',
]);

/**
 * スロット型の色（CSS 変数の参照）。Tailwind は動的なクラス名を抽出できないため、CSS 変数を
 * 直接参照する
 */
export function slotColor(type: string): string {
  const key = type.toLowerCase();
  if (!KNOWN_SLOTS.has(key)) return 'var(--color-slot-default)';

  return `var(--color-slot-${key.replaceAll('_', '-')})`;
}

/**
 * カード 1 枚ぶんの出力アンカーの色。
 *
 * **型が混ざるときは既定色**にする。点は 1 つしか無いので、どれか 1 つの型の色を置くと
 * 「その型だけが出ている」ように見えてしまう。線はそれぞれの型の色で描かれるので、
 * 型の情報は線の側で読める。全部同じ型（出力が 1 つの場合を含む）ならその色にする。
 */
export function anchorColor(types: readonly string[]): string {
  const unique = new Set(types.map((type) => type.toLowerCase()));
  const only = [...unique][0];

  return unique.size === 1 && only !== undefined ? slotColor(only) : 'var(--color-slot-default)';
}
