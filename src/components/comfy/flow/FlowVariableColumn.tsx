import { cva } from 'class-variance-authority';

import type { FlowColumnWidths } from '@/components/comfy/flow/flow-canvas-values';
import { ColumnDivider, type ColumnDividerProps } from '@/components/ui/column-divider';
import { BrokenNotice, ErrorBoundary } from '@/components/ui/error-boundary';
import { t } from '@/i18n';

// ─────────────────────────────
// カードの列の境目から右（線を通す余白・変数の列と右の仕切り）
// ─────────────────────────────

/**
 * カードの列の仕切りを、見た目だけ左へ寄せる量。線を**列のスクロールバーの右 3px** に置く
 * （列の右端から列の間隔 gap-4 と仕切りの -mx-1 のぶん戻す。線は掴める幅の左端）。
 * 脇の切り替えのアイコン（列の右端から 3〜27px）と重なる。重なりはアイコンを上にする（z-20）
 */
const CARDS_DIVIDER_OFFSET = -9;

const NARROW_VARIABLES_GAP = 28;

/** 狭い画面の変数の列の幅 */
const NARROW_VARIABLES_WIDTH = 'w-[calc((100cqw-2rem)*0.6)]';

/**
 * 変数の列と右の仕切り。狭い画面では表示領域とほぼ同じ幅にし、面を縦に送っても
 * 見えている高さに留まって、列の中だけで送る（詰めて並べ、カードに連動する）
 */
const variableFrame = cva('flex shrink-0 items-stretch', {
  variants: {
    narrow: { true: [NARROW_VARIABLES_WIDTH, 'sticky top-0 h-[100cqh]'], false: '' },
  },
});

/**
 * 変数の左の仕切り（余白の幅を変える）を、見た目だけ右へ寄せる量
 */
const VARIABLES_DIVIDER_OFFSET = 20;

/**
 * 変数の右の仕切り（変数の幅を変える）を、見た目だけ右へ寄せる量。
 * 列の間隔を挟まずに変数の右端へ付け、線を**列のスクロールバーの右 3px** に置く（線は掴める幅の左端）
 */
const VARIABLES_RIGHT_DIVIDER_OFFSET = 7;

/**
 * カードの列の境目から右（線を通す余白・変数の列）。狭い画面では境目を出さず、
 * 余白は決まった幅
 */
export function VariableSide({
  narrow,
  widths,
  resetKey,
  onResize,
  children,
}: {
  readonly narrow: boolean;
  readonly widths: FlowColumnWidths;
  readonly resetKey: unknown;
  readonly onResize: ColumnDividerProps['onResize'];
  readonly children: React.ReactNode;
}): React.ReactElement {
  if (narrow) {
    return (
      <>
        <div className="shrink-0" style={{ width: NARROW_VARIABLES_GAP }} aria-hidden />
        <VariableColumn narrow width={widths.variables} resetKey={resetKey} onResize={onResize}>
          {children}
        </VariableColumn>
      </>
    );
  }
  return (
    <>
      <ColumnDivider
        column="cards"
        label={t('flow.canvas.cardColumn')}
        width={widths.cards}
        offset={CARDS_DIVIDER_OFFSET}
        line="start"
        onResize={onResize}
      />

      {/* 接続線を通す余白。幅は変数の左の境目で決める（残りは取らない） */}
      <div className="shrink-0" style={{ width: widths.variablesGap }} aria-hidden />

      {/* どの境目も左の部品の幅を変える。変数の左は余白、変数の右は変数の幅 */}
      <ColumnDivider
        column="variablesGap"
        label={t('flow.canvas.variablesGap')}
        width={widths.variablesGap}
        offset={VARIABLES_DIVIDER_OFFSET}
        onResize={onResize}
      />
      <VariableColumn
        narrow={false}
        width={widths.variables}
        resetKey={resetKey}
        onResize={onResize}
      >
        {children}
      </VariableColumn>
    </>
  );
}

/**
 * 変数の列と右の仕切り。間隔を挟まずに並べる（右の列との間を詰める）
 */
function VariableColumn({
  narrow,
  width,
  resetKey,
  onResize,
  children,
}: {
  readonly narrow: boolean;
  readonly width: number;
  readonly resetKey: unknown;
  readonly onResize: ColumnDividerProps['onResize'];
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={variableFrame({ narrow })}>
      <ErrorBoundary
        label={t('flow.canvas.variableColumn')}
        resetKey={resetKey}
        fallback={(error, retry) => (
          <div className="h-full shrink-0" style={{ width }}>
            <BrokenNotice label={t('flow.canvas.variableColumn')} error={error} onRetry={retry} />
          </div>
        )}
      >
        {children}
      </ErrorBoundary>
      {narrow ? null : (
        <ColumnDivider
          column="variables"
          label={t('flow.canvas.variableColumn')}
          width={width}
          offset={VARIABLES_RIGHT_DIVIDER_OFFSET}
          line="start"
          onResize={onResize}
        />
      )}
    </div>
  );
}
