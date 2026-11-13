import { cva } from 'class-variance-authority';

import { useDragFrom } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';
import { KEYBOARD_RESIZE_STEP } from '@/lib/resize-step';
import { unzoom } from '@/store/settings-fields/column-zoom';

// ─────────────────────────────
// 高さを変える辺の掴み。カード・アプリ入力の欄と、下に置いた右の列の帯が使う。
// **掴んだ時点の高さ＋動かした量**で決める（ここでは測らない。座標測定の仕組みは 1 本だけにする）。
// ─────────────────────────────

// 下のカードの上の ⊕（z-10）より上、出力の三角（z-20）より下に重ねる
const handle = cva(
  `group/height absolute inset-x-0 z-[15] flex h-2 cursor-ns-resize items-center
    focus:outline-none`,
  { variants: { edge: { bottom: '-bottom-1', top: '-top-1' } } },
);

/** 高さの掴みの props */
export interface HeightHandleProps {
  /** 何の高さかを読み上げるための名前 */
  readonly label: string;
  /** 今の高さ（px）。呼び出し側が持つ値を渡す */
  readonly height: number;
  /** これより縮めない（px） */
  readonly min: number;
  /** これより伸ばさない（px）。既定は上限なし */
  readonly max?: number | undefined;
  /** 掴みを付ける辺。既定は下端。上端では上へ動かすと伸びる */
  readonly edge?: 'top' | 'bottom' | undefined;
  readonly onChange: (height: number) => void;
  /**
   * Tab で止めず、キーボードで開くメニューから届くようにする（カード・アプリ入力）
   */
  readonly menuAction?: boolean | undefined;
  /** 掴みを置いた列の倍率。動かした量（画面の px）を列の中の px に直す。既定は 1 */
  readonly zoom?: number | undefined;
}

/**
 * 高さの掴み。`role="separator"` で、キーボードの上下キーでも変えられる。
 * 常時は見せず、指したときか焦点が当たったときだけ線を出す
 */
export function HeightHandle({
  label,
  height,
  min,
  max = Number.POSITIVE_INFINITY,
  edge = 'bottom',
  onChange,
  menuAction = false,
  zoom = 1,
}: HeightHandleProps): React.ReactElement {
  // 上端は上へ動かすと伸びる
  const sign = edge === 'top' ? -1 : 1;
  const clamp = (value: number): number => Math.min(max, Math.max(min, Math.round(value)));
  const drag = useDragFrom(
    () => height,
    (from: number, _dx: number, dy: number) => onChange(clamp(from + sign * unzoom(dy, zoom))),
  );

  return (
    <div
      role="separator"
      {...(menuAction ? MENU_ACTION : { tabIndex: 0 })}
      aria-orientation="horizontal"
      aria-label={t('flow.resize.height', { name: label })}
      aria-valuenow={height}
      aria-valuemin={min}
      aria-valuemax={Number.isFinite(max) ? max : undefined}
      title={t('flow.resize.heightTitle')}
      className={handle({ edge })}
      {...drag}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') onChange(clamp(height - sign * KEYBOARD_RESIZE_STEP));
        else if (event.key === 'ArrowDown') onChange(clamp(height + sign * KEYBOARD_RESIZE_STEP));
        else return;

        event.preventDefault();
      }}
    >
      <span
        aria-hidden
        className="bg-ring h-0.5 w-full rounded-full opacity-0 transition-opacity
          group-hover/height:opacity-100 group-focus/height:opacity-100"
      />
    </div>
  );
}
