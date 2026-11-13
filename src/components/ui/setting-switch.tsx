import { Switch } from '@base-ui/react/switch';
import { cva } from 'class-variance-authority';

// ─────────────────────────────
// 設定のタブの入れ切り。ComfyUI と会話の両方の設定のタブで使うので共有の置き場に置く。
// スイッチは基盤（Base UI）に任せる
// ─────────────────────────────

/**
 * 上の欄との間。見出しの下に置くときは空けない（見出しが空ける）。行の上下には余白を持たず、
 * 入力欄と同じく並びの間隔だけで離す
 */
const settingRow = cva('text-muted-foreground flex items-center gap-2 px-1', {
  variants: { spaced: { true: 'mt-2', false: '' } },
});

/** 設定の入れ切りの props */
export interface SettingSwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** スイッチの右に出す名前（読み上げの名前を兼ねる） */
  readonly label: string;
  /** 上の欄との間を空ける（既定）。見出しの下に置くなら false */
  readonly spaced?: boolean | undefined;
}

/** 名前つきのスイッチ 1 行 */
export function SettingSwitch({
  checked,
  onChange,
  label,
  spaced = true,
}: SettingSwitchProps): React.ReactElement {
  return (
    <label className={settingRow({ spaced })}>
      {/* 押せる高さは 24px、場所を取るのは見えている 16px（負の余白。WCAG 2.5.8）。
          地は隣の色と 3:1 を保つ濃さ（WCAG 1.4.11） */}
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        className="group/switch relative -my-1 inline-flex h-6 w-7 shrink-0 items-center rounded-full
          focus-visible:outline-2"
      >
        <span
          aria-hidden
          className="bg-muted-foreground/70 group-data-[checked]/switch:bg-switch-on absolute inset-x-0
            top-1 h-4 rounded-full transition-colors"
        />
        <Switch.Thumb
          className="bg-background relative size-3 translate-x-0.5 rounded-full shadow-sm
            transition-transform data-[checked]:translate-x-3.5"
        />
      </Switch.Root>
      {label}
    </label>
  );
}
