import type { ValuePart } from '@/graph/widgets';
import { t } from '@/i18n';

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

function unusedReasonOf(part: ValuePart, muted: boolean): string {
  if (muted) return t('flow.valueTooltip.muted');
  return part.bypassed ? t('flow.valueTooltip.bypassed') : '';
}
