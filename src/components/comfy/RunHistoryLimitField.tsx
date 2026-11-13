import { NumberField } from '@base-ui/react/number-field';
import { Triangle } from 'lucide-react';

import { t } from '@/i18n';
import {
  normalizeRunHistoryLimit,
  RUN_HISTORY_LIMIT_MAX,
  RUN_HISTORY_LIMIT_MIN,
} from '@/store/settings-fields/run-history-limit';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 実行の記録の上限（1 セッションのファイルに残す実行の数）の欄。
// 数の欄は自作せず基盤（Base UI の NumberField）に任せる。形はスライドショーの間隔の欄と同じ。
// ─────────────────────────────

/** 実行の記録の上限の欄の props */
export interface RunHistoryLimitFieldProps {
  /** 欄の id（設定のタブの見出しが指す） */
  readonly id: string;
}

const STEP_BUTTON = `text-muted-foreground hover:text-foreground flex h-3 items-center px-0.5
  data-disabled:opacity-40`;

/** 設定のストアの上限を読み書きする数の欄。上下の三角で増減する */
export function RunHistoryLimitField({ id }: RunHistoryLimitFieldProps): React.ReactElement {
  const limit = useSettingsStore((state) => state.runHistoryLimit);
  const setLimit = useSettingsStore((state) => state.setRunHistoryLimit);

  return (
    <NumberField.Root
      id={id}
      value={limit}
      min={RUN_HISTORY_LIMIT_MIN}
      max={RUN_HISTORY_LIMIT_MAX}
      step={10}
      // 空にした途中（null）は書かない。離れると基盤が今の値に戻す
      onValueChange={(value) => {
        if (value !== null) setLimit(normalizeRunHistoryLimit(value));
      }}
    >
      <NumberField.Group className="flex items-center">
        <span className="flex flex-col">
          <NumberField.Increment
            className={STEP_BUTTON}
            aria-label={t('settings.runHistory.limitIncrease')}
          >
            <Triangle className="size-2 fill-current" aria-hidden />
          </NumberField.Increment>
          <NumberField.Decrement
            className={STEP_BUTTON}
            aria-label={t('settings.runHistory.limitDecrease')}
          >
            <Triangle className="size-2 rotate-180 fill-current" aria-hidden />
          </NumberField.Decrement>
        </span>
        <NumberField.Input
          className="border-input bg-background w-16 rounded-md border px-2 py-1 text-xs
            tabular-nums"
          aria-label={t('settings.runHistory.limitLabel')}
        />
      </NumberField.Group>
    </NumberField.Root>
  );
}
