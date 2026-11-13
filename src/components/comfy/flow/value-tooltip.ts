import type { ValuePart } from '@/graph/widgets';
import { t } from '@/i18n';

// ─────────────────────────────
// 値のホバー説明の文字列。変数ボックスとカードのチップで同じ書式にする。
// ─────────────────────────────

/**
 * 値のホバー説明を組み立てる。実行で使われない値は行頭に理由を付ける。ホバー説明は素のテキストしか
 * 出せず、画面側のように取り消し線を引けないため。
 */
export function valueTooltip(
  index: string | null,
  label: string,
  values: readonly ValuePart[],
  muted = false,
): string {
  const head = index === null ? label : `${index} ${label}`;
  const lines = values.map((part) => `${unusedReasonOf(part, muted)}${part.label}`);

  return [head, ...lines].filter((line) => line.length > 0).join('\n');
}

/** 実行で使われない値の行頭に付ける理由。使われる値は空 */
function unusedReasonOf(part: ValuePart, muted: boolean): string {
  if (muted) return t('flow.valueTooltip.muted');
  return part.bypassed ? t('flow.valueTooltip.bypassed') : '';
}
