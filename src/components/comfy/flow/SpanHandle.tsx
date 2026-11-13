import { APP_INPUT_SPANS } from '@/graph/app-inputs';
import { useDragFrom } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';
import { clamp } from '@/lib/clamp';
import { MENU_ACTION } from '@/lib/menu-actions';

// ─────────────────────────────
// 12 分割の幅を変える掴み。入力欄の枠の上に重ね、その右の枠線を掴む（どの入力欄も枠いっぱいに
// 広がるので、入力欄の種類に依存しない）。1 つ分が何 px かは測定の仕組みが 1 本なので、測った値を受け取る。
// ─────────────────────────────

/** 幅の掴みの受け取り物 */
export interface SpanHandleProps {
  /** 何の幅かを読み上げるための名前 */
  readonly label: string;
  /** 今の幅（1〜12） */
  readonly span: number;
  /** 12 分割の 1 つ分（px）。測れていなければ null＝掴んでも動かさない */
  readonly unit: number | null;
  /** 掴める場所に薄い点線を常時出す。枠線を持たない入力で使う（線が無いと掴めることに気づけない） */
  readonly guide?: boolean | undefined;
  readonly onChange: (span: number) => void;
}

/** 掴んで引くと 1 つ分ずつ吸い付き、キーボードだけでも幅を変えられる区切りを出す */
export function SpanHandle({
  label,
  span,
  unit,
  guide = false,
  onChange,
}: SpanHandleProps): React.ReactElement {
  const step = (delta: number): void => onChange(clamp(span + delta, 1, APP_INPUT_SPANS));
  // 掴んだ時点の幅＋動かした量。1 つ分が測れていなければ動かさない
  const drag = useDragFrom(
    () => span,
    (from: number, dx: number) => {
      if (unit === null || unit <= 0) return;
      onChange(clamp(from + Math.round(dx / unit), 1, APP_INPUT_SPANS));
    },
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('flow.resize.spanWidth', { name: label })}
      aria-valuenow={span}
      aria-valuemin={1}
      aria-valuemax={APP_INPUT_SPANS}
      // Tab で止めず、キーボードで開くメニューから届く
      {...MENU_ACTION}
      className="group/span absolute inset-y-0 -right-1 z-10 flex w-2 cursor-col-resize
        items-stretch justify-center focus:outline-none"
      {...drag}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') step(-1);
        else if (event.key === 'ArrowRight') step(1);
        else if (event.key === 'Home') onChange(1);
        else if (event.key === 'End') onChange(APP_INPUT_SPANS);
        else return;

        event.preventDefault();
      }}
    >
      {/* 掴める場所の目印。枠線を持たない入力では薄い点線を出したままにする */}
      {guide ? (
        <span
          aria-hidden
          className="border-muted-foreground/40 absolute inset-y-0 border-l border-dotted"
        />
      ) : null}
      {/* 枠線の上に重ねる細い線。乗せたときと焦点が当たったときだけ出す */}
      <span
        aria-hidden
        className="bg-ring h-full w-0.5 rounded-full opacity-0 transition-opacity
          group-hover/span:opacity-100 group-focus/span:opacity-100"
      />
    </div>
  );
}
