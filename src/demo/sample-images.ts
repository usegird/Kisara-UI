// ─────────────────────────────
// 模擬実行の結果に出す見本の画像。権利者が用意した画像から、埋め込みの情報を
// 取り除いて縮めたもの。**ワークフローから作ったものではない。**
// ─────────────────────────────

/** 画像の種類。輪郭（Canny の見立て）・最初の生成（粗い）・最終 */
type SampleImageKind = 'edges' | 'first' | 'final';

const IMAGES = import.meta.glob<string>('./images/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** 組の数（run1〜run4） */
export const SAMPLE_SETS = 4;

/** `set` 番目（0 から）の組の画像。無ければ undefined */
export function sampleImage(set: number, kind: SampleImageKind): string | undefined {
  const index = ((set % SAMPLE_SETS) + SAMPLE_SETS) % SAMPLE_SETS;
  return IMAGES[`./images/run${String(index + 1)}-${kind}.jpg`];
}

/**
 * 出力ノードが出す画像の種類。見本のワークフローの輪郭と最初の生成のノードだけを分け、
 * ほか（手元のファイルを含む）は最終の画像にする
 */
const SAMPLE_OUTPUT_KINDS: Readonly<Record<string, SampleImageKind>> = {
  '11': 'edges',
  '15': 'first',
};

/** 出力ノードの id から、そのノードに出す見本の画像の種類を選ぶ */
export function outputKind(nodeId: string): SampleImageKind {
  return SAMPLE_OUTPUT_KINDS[nodeId] ?? 'final';
}
