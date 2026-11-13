import { useId } from 'react';

import {
  CHAT_LOG_WINDOW_MAX,
  CHAT_LOG_WINDOW_MIN,
  CHAT_MAX_MB_MAX,
  CHAT_MAX_MB_MIN,
} from '@/chat/size';
import { t } from '@/i18n';
import { entryKeyOf } from '@/lib/text-entry';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 会話の大きさの上限と、一度に描く発言の数。会話の右の列の設定のタブに置く。
// ─────────────────────────────

/** 会話の大きさの上限と一度に描く発言の数の数の欄 */
export function ChatLimitFields(): React.ReactElement {
  const maxMegabytes = useSettingsStore((state) => state.chatMaxMegabytes);
  const logWindow = useSettingsStore((state) => state.chatLogWindow);
  const store = useSettingsStore.getState();
  return (
    <div className="flex flex-col gap-1 px-1">
      <LimitField
        label={t('llm.limits.maxSize')}
        unit="MB"
        value={maxMegabytes}
        min={CHAT_MAX_MB_MIN}
        max={CHAT_MAX_MB_MAX}
        onCommit={store.setChatMaxMegabytes}
      />
      <LimitField
        label={t('llm.limits.logWindow')}
        unit={t('llm.limits.messages')}
        value={logWindow}
        min={CHAT_LOG_WINDOW_MIN}
        max={CHAT_LOG_WINDOW_MAX}
        onCommit={store.setChatLogWindow}
      />
    </div>
  );
}

function LimitField({
  label,
  unit,
  value,
  min,
  max,
  onCommit,
}: {
  readonly label: string;
  readonly unit: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onCommit: (value: number) => void;
}): React.ReactElement {
  const id = useId();
  // 打ち込みの途中で範囲に丸めないよう、焦点が外れたとき（Enter を含む）に決める
  const commit = (input: HTMLInputElement): void => {
    const next = Number(input.value);
    // 空や読めない値は決めず、今の値に戻す
    if (input.value === '' || !Number.isFinite(next)) input.value = String(value);
    else onCommit(next);
  };
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-muted-foreground min-w-0 flex-1">
        {label}
      </label>
      <input
        // 決めた値（丸めた値）で欄を置き直す
        key={value}
        id={id}
        type="number"
        className="border-input bg-background w-20 rounded-md border px-2 py-0.5 tabular-nums"
        min={min}
        max={max}
        step={1}
        defaultValue={value}
        onBlur={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (entryKeyOf(event) === 'commit') event.currentTarget.blur();
        }}
      />
      <span className="text-muted-foreground w-6">{unit}</span>
    </div>
  );
}
