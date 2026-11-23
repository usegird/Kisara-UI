import { SortableContext, type SortingStrategy } from '@dnd-kit/sortable';
import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';
import { useContext } from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  AnchorContext,
  appCardAnchorKey,
  appGridAnchorKey,
} from '@/components/comfy/flow/anchor-context';
import { AppField } from '@/components/comfy/flow/AppField';
import { GroupTitle } from '@/components/comfy/flow/AppGroupTitle';
import type { AppInputPanelProps } from '@/components/comfy/flow/AppInputPanel';
import { FlowLookContext } from '@/components/comfy/flow/flow-look-context';
import { CARD_MOTION, motionOf, type MotionKind } from '@/components/comfy/flow/item-motion';
import {
  ContextMenuActionSections,
  ContextMenuContent,
  ContextMenuRoot,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { BrokenNotice, ErrorBoundary } from '@/components/ui/error-boundary';
import { FALLBACK_BUTTON_CLASS } from '@/components/ui/fallback-button';
import { appInputDragId } from '@/graph/app-input-order';
import { APP_INPUT_SPANS, appInputSpanKey } from '@/graph/app-inputs';
import { disabledNodeIdsOf } from '@/graph/node-bypass';
import type { NodeRow } from '@/graph/rows';
import { argumentInputNames } from '@/graph/workflow-tool';
import { shownGroups, useAppDrag } from '@/hooks/flow/use-app-drag';
import { useAnchorRects } from '@/hooks/ui/use-anchor-registry';
import { useKeyboardMenu } from '@/hooks/ui/use-keyboard-menu';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';
import { historyKeyOf, isTextEntry } from '@/lib/text-entry';
import { useAppValuesStore } from '@/store/use-app-values-store';
import { useGraphStore } from '@/store/use-graph-store';

const stillStrategy: SortingStrategy = () => null;

const groupGrid = cva(
  'grid items-start gap-x-1 gap-y-1.5',
  {
    variants: {
      aligned: {
        true: 'grid-cols-[auto_minmax(0,max-content)_minmax(3rem,1fr)_auto]',
        false: 'grid-cols-12',
      },
    },
  },
);

const appCard = cva('bg-band/60 relative rounded-md', {
  variants: {
    motion: CARD_MOTION,
    roomy: { false: 'pt-[5px] pr-2 pb-2 pl-1.5', true: 'pt-2.5 pr-4 pb-4 pl-3' },
    disabled: { true: 'opacity-70', false: '' },
  },
});

export function AppInputColumn({
  groups: committed,
  spans,
  heights,
  onNeedOptions,
  onResize,
  onRemoveGroup,
  onCommentChange,
  onResizeHeight,
  enteringKey = null,
  leavingKey = null,
  onMotionEnd,
  enteringField = null,
  leavingField = null,
  onFieldMotionEnd,
}: AppInputPanelProps): React.ReactElement {
  const undo = useAppValuesStore((state) => state.undo);
  const redo = useAppValuesStore((state) => state.redo);
  const argumentEntries = useGraphStore(useShallow((state) => argumentInputNames(state.workflow)));
  const argumentNames = new Map(
    argumentEntries.map((entry) => {
      const at = entry.indexOf('=');
      return [entry.slice(0, at), entry.slice(at + 1)] as const;
    }),
  );
  const disabledIds = useGraphStore(
    useShallow((state) => disabledNodeIdsOf(state.workflow, committed)),
  );
  const anchors = useContext(AnchorContext);
  const { appRemove: removable, roomy } = useContext(FlowLookContext);
  const keyboardMenu = useKeyboardMenu();

  const onHistoryKey = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const direction = historyKeyOf(event);
    if (direction === null || isTextEntry(event.target)) return;

    if (direction === 'redo' ? redo() : undo()) event.preventDefault();
  };

  const items = committed.flatMap((group) =>
    group.rows.map((row) => appInputDragId({ nodeId: group.nodeId, widgetName: row.widgetName })),
  );
  const drag = useAppDrag();
  const groups = shownGroups(committed, drag);

  const gridWidths = useAnchorRects(
    anchors,
    useShallow((rects) =>
      groups.map((group) => {
        const rect = rects.get(appGridAnchorKey(group.key));
        return rect === undefined ? null : rect.right - rect.left;
      }),
    ),
  );

  const fieldMotionOf = (key: string): MotionKind =>
    motionOf(key === leavingField, key === enteringField);

  return (
    <SortableContext items={items} strategy={stillStrategy}>
      <ContextMenuRoot>
        <ContextMenuTrigger
          className="contents"
          onKeyDownCapture={keyboardMenu.onKeyDownCapture}
          onContextMenuCapture={(event) => {
            const sections = keyboardMenu.take(event);
            if (sections === null || sections.length === 0) event.stopPropagation();
          }}
        >
          <div data-app-input-column className="flex flex-col gap-3" onKeyDown={onHistoryKey}>
            {groups.map((group, index) => {
              const spanOf = (row: NodeRow): number =>
                spans.get(appInputSpanKey(group.nodeId, row.widgetName)) ?? APP_INPUT_SPANS;
              const aligned = group.rows.every((row) => spanOf(row) === APP_INPUT_SPANS);
              const key = appGridAnchorKey(group.key);
              const width = gridWidths[index] ?? null;
              const unit = width === null ? null : width / APP_INPUT_SPANS;

              return (
                <ErrorBoundary
                  key={group.key}
                  label={t('flow.appInput.frame', { name: group.label })}
                  resetKey={group}
                  fallback={(error, retry) => (
                    <BrokenNotice
                      label={t('flow.appInput.frame', { name: group.label })}
                      error={error}
                      onRetry={retry}
                      extra={
                        <button
                          type="button"
                          className={FALLBACK_BUTTON_CLASS}
                          onClick={() => onRemoveGroup(group)}
                        >
                          {t('flow.appInput.remove')}
                        </button>
                      }
                    />
                  )}
                >
                  <section
                    ref={anchors?.register(appCardAnchorKey(group.key))}
                    data-menu-scope={group.label}
                    className={appCard({
                      roomy,
                      disabled: disabledIds.includes(group.nodeId),
                      motion: motionOf(group.key === leavingKey, group.key === enteringKey),
                    })}
                    onAnimationEnd={(event) => {
                      if (event.target === event.currentTarget) onMotionEnd?.(group.key);
                    }}
                  >
                    <p className="text-foreground/70 mb-1.5 flex items-center gap-1 pl-0.5 text-2xs">
                      {group.index === null ? null : (
                        <span className="shrink-0 font-semibold tabular-nums">{group.index}</span>
                      )}
                      <GroupTitle group={group} onCommentChange={onCommentChange} />
                      {removable ? (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground hover:bg-muted
                      ml-auto shrink-0 rounded p-0.5"
                          {...MENU_ACTION}
                          aria-label={t('flow.appInput.closeFrameLabel', { name: group.label })}
                          title={t('flow.appInput.closeFrameTitle')}
                          onClick={() => onRemoveGroup(group)}
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      ) : null}
                    </p>

                    <div ref={anchors?.register(key)} className={groupGrid({ aligned })}>
                      {group.rows.map((row) => (
                        <AppField
                          key={row.name}
                          nodeId={group.nodeId}
                          group={group}
                          row={row}
                          span={spanOf(row)}
                          height={heights.get(appInputSpanKey(group.nodeId, row.widgetName))}
                          unit={unit}
                          aligned={aligned}
                          onNeedOptions={onNeedOptions}
                          onResize={onResize}
                          onResizeHeight={onResizeHeight}
                          argument={
                            argumentNames.get(`${String(group.nodeId)}/${row.widgetName}`) ?? null
                          }
                          motion={fieldMotionOf(appInputSpanKey(group.nodeId, row.widgetName))}
                          onMotionEnd={onFieldMotionEnd}
                        />
                      ))}
                    </div>
                  </section>
                </ErrorBoundary>
              );
            })}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent label={t('flow.appInput.menu')} finalFocus={keyboardMenu.finalFocus}>
          {keyboardMenu.sections === null ? null : (
            <ContextMenuActionSections
              sections={keyboardMenu.sections}
              onChoose={keyboardMenu.choose}
            />
          )}
        </ContextMenuContent>
      </ContextMenuRoot>
    </SortableContext>
  );
}
