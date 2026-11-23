import { ChevronLeft, ChevronRight } from 'lucide-react';

import { t } from '@/i18n';

const ICON_BUTTON = `text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-6
  items-center justify-center rounded disabled:pointer-events-none disabled:opacity-40`;

export interface StepSwitchProps {
  readonly index: number;
  readonly count: number;
  readonly nextDisabled?: boolean | undefined;
  readonly onStep: (delta: -1 | 1) => void;
}

export function StepSwitch({
  index,
  count,
  nextDisabled,
  onStep,
}: StepSwitchProps): React.ReactElement {
  return (
    <span className="text-muted-foreground mr-1 inline-flex items-center text-xs tabular-nums">
      <button
        type="button"
        className={ICON_BUTTON}
        disabled={index === 0}
        aria-label={t('llm.chat.previous')}
        title={t('llm.chat.previous')}
        onClick={() => onStep(-1)}
      >
        <ChevronLeft className="size-3.5" aria-hidden />
      </button>
      <span aria-label={t('llm.chat.candidate', { index: index + 1, count })}>
        {index + 1}/{count}
      </span>
      <button
        type="button"
        className={ICON_BUTTON}
        disabled={nextDisabled ?? index === count - 1}
        aria-label={t('llm.chat.next')}
        title={t('llm.chat.next')}
        onClick={() => onStep(1)}
      >
        <ChevronRight className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}
