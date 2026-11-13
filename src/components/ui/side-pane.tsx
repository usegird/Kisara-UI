import { PaneDivider } from '@/components/ui/pane-divider';
import { DEFAULT_SIDE_LIST_WIDTH } from '@/lib/dialog-rect';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// ダイアログの左右（または下）の列。本体との間の線を掴んで幅（下なら高さ）を変え、端末に残す。
// ─────────────────────────────

const DEFAULT_MIN_SIZE = 140;

/** ダイアログの列の props */
export interface SidePaneProps {
  /** 大きさを残す名前。`ダイアログの名前:列の名前` */
  readonly paneKey: string;
  /** 列の名前（境目の読み上げ） */
  readonly label: string;
  /** 本体のどちら側に置くか。下なら本体と縦に並べる側（呼び出し側）が置く */
  readonly side: 'left' | 'right' | 'bottom';
  /** 既定の幅（下なら高さ） */
  readonly defaultSize?: number | undefined;
  /** 縮められる下限。既定は 140px。操作の帯を絵だけにできる列はもっと縮める */
  readonly minSize?: number | undefined;
  /** 広げられる上限。既定は無し。中身の長さが決まっている列で、余白を広げすぎないために使う */
  readonly maxSize?: number | undefined;
  /**
   * ダイアログを狭めたとき、本体より先に下限まで縮むか（残した幅は変えない）。本体の側に最小の幅を
   * 持たせて使う。既定は縮まない
   */
  readonly shrinkable?: boolean | undefined;
  /** 列の上に置く操作の帯（`DialogToolbar`）。左の列なら決定と右寄せの閉じる × */
  readonly toolbar?: React.ReactNode | undefined;
  readonly children: React.ReactNode;
}

/** 列のいまの大きさ（端末に残した値を下限と上限で丸める）。列の外で大きさに合わせるときにも使う */
export function usePaneSize(
  paneKey: string,
  defaultSize: number = DEFAULT_SIDE_LIST_WIDTH,
  minSize: number = DEFAULT_MIN_SIZE,
  maxSize: number = Infinity,
): number {
  const stored = useSettingsStore((state) => state.dialogPaneWidths[paneKey] ?? defaultSize);
  return clampPane(stored, minSize, maxSize);
}

/** 下限と上限で丸める（上限が下限より小さければ下限） */
export function clampPane(size: number, minSize: number, maxSize: number = Infinity): number {
  return Math.max(minSize, Math.min(maxSize, size));
}

/** ダイアログの列。中身は縦に伸びる 1 つの塊を渡し、列の上に操作の帯を置ける */
export function SidePane({
  paneKey,
  label,
  side,
  defaultSize = DEFAULT_SIDE_LIST_WIDTH,
  minSize = DEFAULT_MIN_SIZE,
  maxSize = Infinity,
  shrinkable = false,
  toolbar,
  children,
}: SidePaneProps): React.ReactElement {
  const size = usePaneSize(paneKey, defaultSize, minSize, maxSize);
  const setSize = useSettingsStore((state) => state.setDialogPaneWidth);

  const divider = (
    <PaneDivider
      label={label}
      size={size}
      side={side}
      onResize={(next) => setSize(paneKey, clampPane(next, minSize, maxSize))}
    />
  );

  return (
    <>
      {side === 'left' ? null : divider}
      {/* 幅で中身を変えられるように、列を大きさの基準にする（狭いと決定の文字を隠すなど） */}
      <div
        className="@container flex min-h-0 min-w-0 shrink-0 flex-col"
        style={paneStyleOf(side, size, shrinkable ? minSize : null)}
      >
        {toolbar}
        {children}
      </div>
      {side === 'left' ? divider : null}
    </>
  );
}

/** 列の大きさ。下に置くなら高さ、左右なら幅。縮められるなら最小の幅まで縮める */
function paneStyleOf(side: string, size: number, shrinkTo: number | null): React.CSSProperties {
  if (side === 'bottom') return { height: size };
  return shrinkTo === null ? { width: size } : { width: size, minWidth: shrinkTo, flexShrink: 1 };
}
