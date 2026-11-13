// ─────────────────────────────
// キーの入力の窓のアイコン。ゲートウェイは React を持たないので、SVG を DOM で組む。
// ─────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 本体のアイコン（lucide）と同じ線の描き方 */
const VIEW_BOX = '0 0 24 24';
const STROKE_WIDTH = '2';

/** 開いた目（キーを伏せている間に出し、押すと見せる） */
const EYE = [
  'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
  'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
] as const;

/** 斜線の入った目（キーを見せている間に出し、押すと伏せる） */
const EYE_OFF = [
  'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49',
  'M14.084 14.158a3 3 0 0 1-4.242-4.242',
  'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143',
  'm2 2 20 20',
] as const;

/** 目のアイコンを作る。`shown` はキーを見せているか（見せている間は斜線の目） */
export function createEyeIcon(shown: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', VIEW_BOX);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', STROKE_WIDTH);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  // 名前はボタンが持つので、絵は読み上げない
  svg.setAttribute('aria-hidden', 'true');
  for (const d of shown ? EYE_OFF : EYE) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
