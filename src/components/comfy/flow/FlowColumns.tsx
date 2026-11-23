import { cva } from 'class-variance-authority';
import { useContext } from 'react';

import {
  AnchorContext,
  APP_VIEWPORT_ANCHOR_KEY,
  VIEWPORT_ANCHOR_KEY,
} from '@/components/comfy/flow/anchor-context';
import { AppInputPanel } from '@/components/comfy/flow/AppInputPanel';
import { ColumnZoomContext } from '@/components/comfy/flow/column-zoom-context';
import { APP_ICON_GAP } from '@/components/comfy/flow/flow-canvas-values';
import { CARD_COLUMN_PADDING_LEFT } from '@/components/comfy/flow/group-frame-look';
import { HiddenNodeToggles } from '@/components/comfy/flow/HiddenNodeToggles';
import { InsertBar } from '@/components/comfy/flow/InsertBar';
import { SortByProcessingButton } from '@/components/comfy/flow/SortByProcessingButton';
import { ColumnDivider, type ColumnDividerProps } from '@/components/ui/column-divider';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import type { AppInputColumn as AppInputColumnData } from '@/hooks/flow/use-app-input-column';
import type { NodeEditing } from '@/hooks/flow/use-node-editing';
import { t } from '@/i18n';
import { useGraphStore } from '@/store/use-graph-store';

const APP_DIVIDER_OFFSET = -16;

const APP_GAP_DIVIDER_OFFSET = 2;

const appScroll = cva('min-w-0 flex-1 overflow-x-hidden overflow-y-auto', {
  variants: {
    left: { true: '[direction:rtl]', false: '' },
    narrow: {
      true: 'max-h-[100cqh] overscroll-y-contain',
      false: 'h-full overscroll-contain',
    },
  },
});

const cardScroll = cva('in-data-dragging:[overflow-anchor:none]', {
  variants: {
    sheet: {
      true: '',
      false: 'h-full overflow-x-hidden overflow-y-auto overscroll-contain',
    },
  },
});

const NARROW_APP_GAP = 40;

const NARROW_COLUMN_WIDTH = 'w-[calc(100cqw-2rem)]';

const NARROW_APP_WIDTH = 'w-[calc((100cqw-2rem)*0.9)]';

const columnFrame = cva('shrink-0', {
  variants: {
    narrow: { true: '', false: 'relative h-full' },
    shift: { true: '', false: '' },
  },
  compoundVariants: [
    { narrow: false, shift: true, className: '-left-[9px] flex' },
    { narrow: true, shift: true, className: ['sticky top-0 flex', NARROW_APP_WIDTH] },
    { narrow: true, shift: false, className: ['relative', NARROW_COLUMN_WIDTH] },
  ],
  defaultVariants: { shift: false },
});

export function AppInputColumn({
  narrow,
  width,
  zoom,
  attachScroll,
  resetKey,
  appInputs,
  onNeedOptions,
  insertBar,
  scrollbarLeft,
}: {
  readonly width: number;
  readonly zoom: number;
  readonly attachScroll: (element: HTMLDivElement | null) => void;
  readonly resetKey: unknown;
  readonly appInputs: AppInputColumnData;
  readonly onNeedOptions: NodeEditing['needOptions'];
  readonly insertBar: boolean;
  readonly scrollbarLeft: boolean;
  readonly narrow: boolean;
}): React.ReactElement {
  const anchors = useContext(AnchorContext);
  const setTitle = useGraphStore((state) => state.setTitle);
  const setAppInputSpan = useGraphStore((state) => state.setAppInputSpan);
  const setAppInputHeight = useGraphStore((state) => state.setAppInputHeight);

  return (
    <div className={columnFrame({ narrow, shift: true })} style={narrow ? undefined : { width }}>
      <div
        data-app-scroll
        ref={(element) => {
          attachScroll(element);
          anchors?.register(APP_VIEWPORT_ANCHOR_KEY)(element);
        }}
        className={appScroll({ left: scrollbarLeft && !narrow, narrow })}
      >
        <div className="[direction:ltr]" style={{ zoom }}>
          <ErrorBoundary label={t('flow.canvas.appColumn')} resetKey={resetKey}>
            <ColumnZoomContext.Provider value={zoom}>
              <AppInputPanel
                groups={appInputs.groups}
                spans={appInputs.spans}
                heights={appInputs.heights}
                onNeedOptions={onNeedOptions}
                onResize={setAppInputSpan}
                onCommentChange={setTitle}
                onResizeHeight={setAppInputHeight}
                onRemoveGroup={appInputs.removeGroup}
                enteringKey={appInputs.groupMotion.entering}
                leavingKey={appInputs.groupMotion.leaving}
                onMotionEnd={appInputs.groupMotion.finish}
                enteringField={appInputs.fieldMotion.entering}
                leavingField={appInputs.fieldMotion.leaving}
                onFieldMotionEnd={appInputs.fieldMotion.finish}
              />
            </ColumnZoomContext.Provider>
          </ErrorBoundary>
        </div>
      </div>
      {insertBar && !narrow ? (
        <div className="absolute top-0 left-full z-20" style={{ marginLeft: APP_ICON_GAP }}>
          <div style={{ zoom }}>
            <InsertBar />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CardColumn({
  narrow,
  width,
  zoom,
  attachScroll,
  tools,
  children,
}: {
  readonly narrow: boolean;
  readonly width: number;
  readonly zoom: number;
  readonly attachScroll: (element: HTMLDivElement | null) => void;
  readonly tools: boolean;
  readonly children: React.ReactNode;
}): React.ReactElement {
  const anchors = useContext(AnchorContext);
  return (
    <div className={columnFrame({ narrow })} style={narrow ? undefined : { width }}>
      <div
        data-flow-scroll
        ref={(element) => {
          attachScroll(element);
          if (!narrow) anchors?.register(VIEWPORT_ANCHOR_KEY)(element);
        }}
        className={cardScroll({ sheet: narrow })}
      >
        <div style={{ zoom }}>
          <ColumnZoomContext.Provider value={zoom}>{children}</ColumnZoomContext.Provider>
        </div>
      </div>
      {tools && !narrow ? (
        <div className="absolute top-2.5 left-full z-20 ml-[3px]">
          <div className="flex flex-col gap-0.5" style={{ zoom }}>
            <HiddenNodeToggles />
            <SortByProcessingButton />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppGap({
  narrow,
  appWidth,
  gapWidth,
  onResize,
}: {
  readonly narrow: boolean;
  readonly appWidth: number;
  readonly gapWidth: number;
  readonly onResize: ColumnDividerProps['onResize'];
}): React.ReactElement {
  if (narrow) return <div className="shrink-0" style={{ width: NARROW_APP_GAP }} aria-hidden />;
  return (
    <>
      <ColumnDivider
        column="app"
        label={t('flow.canvas.appColumn')}
        width={appWidth}
        offset={APP_DIVIDER_OFFSET}
        line="start"
        onResize={onResize}
      />
      <div className="shrink-0" style={{ width: gapWidth }} aria-hidden />
      <ColumnDivider
        column="appGap"
        label={t('flow.canvas.appGap')}
        width={gapWidth}
        offset={APP_GAP_DIVIDER_OFFSET + CARD_COLUMN_PADDING_LEFT}
        onResize={onResize}
      />
    </>
  );
}
