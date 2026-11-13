import { ChevronLeft, ChevronRight } from 'lucide-react';

import { t } from '@/i18n';

// ─────────────────────────────
// 前後へ送る切り替え（‹ N/M ›）。会話の候補と、プロンプトのタブの初期メッセージで同じ形を使う。
// ─────────────────────────────

const ICON_BUTTON = `text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-6
  items-center justify-center rounded disabled:pointer-events-none disabled:opacity-40`;

/** 前後へ送る切り替えの props */
export interface StepSwitchProps {
  /** 今の位置（0 から） */
  readonly index: number;
  readonly count: number;
  /** › を押せないか。渡さなければ最後の 1 件で押せない */
  readonly nextDisabled?: boolean | undefined;
  readonly onStep: (delta: -1 | 1) => void;
}

/** ‹ と › の間に今の位置と数を出し、押すと 1 つ前後へ送る */
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
