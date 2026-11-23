import { cva } from 'class-variance-authority';

import type { FlowColumnWidths } from '@/components/comfy/flow/flow-canvas-values';
import { ColumnDivider, type ColumnDividerProps } from '@/components/ui/column-divider';
import { BrokenNotice, ErrorBoundary } from '@/components/ui/error-boundary';
import { t } from '@/i18n';

const CARDS_DIVIDER_OFFSET = -9;

const NARROW_VARIABLES_GAP = 28;

const NARROW_VARIABLES_WIDTH = 'w-[calc((100cqw-2rem)*0.6)]';

const variableFrame = cva('flex shrink-0 items-stretch', {
  variants: {
    narrow: { true: [NARROW_VARIABLES_WIDTH, 'sticky top-0 h-[100cqh]'], false: '' },
  },
});

const VARIABLES_DIVIDER_OFFSET = 20;

const VARIABLES_RIGHT_DIVIDER_OFFSET = 7;

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

      <div className="shrink-0" style={{ width: widths.variablesGap }} aria-hidden />

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
