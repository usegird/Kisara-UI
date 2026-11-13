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
import { disabledNodeIdsOf } from '@/graph/group-switch';
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

// ─────────────────────────────
// アプリ入力の枠を並べ、列の中での取り消し・やり直しとキーボードで開くメニューを受ける
// ─────────────────────────────

/** 並びをずらさない並べ替え（置き直しで見せるので、ずらすと二重に動く） */
const stillStrategy: SortingStrategy = () => null;

/** 枠の中の格子。揃える枠は行が引き継ぐ格子、そうでなければ 12 列 */
const groupGrid = cva(
  // 行の中も行どうしも上揃え（複数行と 1 行が並んでも頭がそろう）
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

/** 枠。新しくできたら右から滑り込み、外すときは右へ抜ける（ノードのカードと同じ動き） */
// 外枠は引かず、地の塗りだけで範囲を見せる（地と見分けられるよう帯の色を濃いめに敷く）
const appCard = cva('bg-band/60 relative rounded-md', {
  variants: {
    motion: CARD_MOTION,
    // デモは余白を倍にする
    roomy: { false: 'pt-[5px] pr-2 pb-2 pl-1.5', true: 'pt-2.5 pr-4 pb-4 pl-3' },
    // 値は直せるので、押せなくはしない
    disabled: { true: 'opacity-70', false: '' },
  },
});

/**
 * 枠を並べ、列の中での取り消し・やり直しとキーボードで開くメニューを受ける
 */
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
  // LLM の引数にしている欄。並びの中身が同じなら描き直さない（ワークフローの変更ごとには変わらない）
  const argumentEntries = useGraphStore(useShallow((state) => argumentInputNames(state.workflow)));
  const argumentNames = new Map(
    argumentEntries.map((entry) => {
      const at = entry.indexOf('=');
      return [entry.slice(0, at), entry.slice(at + 1)] as const;
    }),
  );
  // 無効（バイパス・ミュート）のノードの枠。並びの中身が同じなら描き直さない
  const disabledIds = useGraphStore(
    useShallow((state) => disabledNodeIdsOf(state.workflow, committed)),
  );
  // 12 分割の 1 つ分を出すために枠の幅を測る（測定は唯一の仕組みに任せる）
  const anchors = useContext(AnchorContext);
  const { appRemove: removable, roomy } = useContext(FlowLookContext);
  const keyboardMenu = useKeyboardMenu();

  // Ctrl+Z で 1 手戻し、Ctrl+Y / Ctrl+Shift+Z でやり直す。値はストアが持っているので、
  // この列の中でだけこちらで受ける。ただし文字を入れている欄では横取りしない
  // （その欄の取り消しに任せる。横取りすると前に確定した別の欄が戻る）
  const onHistoryKey = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const direction = historyKeyOf(event);
    if (direction === null || isTextEntry(event.target)) return;

    if (direction === 'redo' ? redo() : undo()) event.preventDefault();
  };

  // 並べ替えはグループをまたぐので、SortableContext は列全体で1つ。
  // 並びは掴んだときのまま渡す（置き直した並びを渡すと、そのたびに位置を測り直す）
  const items = committed.flatMap((group) =>
    group.rows.map((row) => appInputDragId({ nodeId: group.nodeId, widgetName: row.widgetName })),
  );
  // 掴んでいる間は、落とす先へ置き直した枠の並びで描く
  const drag = useAppDrag();
  const groups = shownGroups(committed, drag);

  // 枠の幅だけを受け取る。ほかの列を送っても描き直さない
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
      {/* 欄からキーボードで開くメニュー。マウスの右クリックはブラウザのまま */}
      <ContextMenuRoot>
        <ContextMenuTrigger
          className="contents"
          onKeyDownCapture={keyboardMenu.onKeyDownCapture}
          onContextMenuCapture={(event) => {
            const sections = keyboardMenu.take(event);
            if (sections === null || sections.length === 0) event.stopPropagation();
          }}
        >
          {/* 列の中でのキー操作を受ける（フォーカスは各入力欄にある） */}
          <div data-app-input-column className="flex flex-col gap-3" onKeyDown={onHistoryKey}>
            {groups.map((group, index) => {
              const spanOf = (row: NodeRow): number =>
                spans.get(appInputSpanKey(group.nodeId, row.widgetName)) ?? APP_INPUT_SPANS;
              // 全部が全幅の枠は枠の格子を行が引き継ぎ、ラベルの幅を枠内で揃える。1 つでも狭めた枠は
              // 12 列の格子に置く（揃えるには列の幅を共有する必要があり、12 分割と両立しないので、
              // 幅を触っていない枠の見え方を変えないほうにする）
              const aligned = group.rows.every((row) => spanOf(row) === APP_INPUT_SPANS);
              const key = appGridAnchorKey(group.key);
              const width = gridWidths[index] ?? null;
              const unit = width === null ? null : width / APP_INPUT_SPANS;

              // 枠 1 つずつ受け止める。描けなければアプリ入力から外せる
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
                    // 右の枠線が、元のカードの行へ引く線の始点になる
                    ref={anchors?.register(appCardAnchorKey(group.key))}
                    // キーボードで開くメニューが、この枠の操作を集める範囲
                    data-menu-scope={group.label}
                    className={appCard({
                      roomy,
                      disabled: disabledIds.includes(group.nodeId),
                      motion: motionOf(group.key === leavingKey, group.key === enteringKey),
                    })}
                    // 中の部品の動きの終わりは拾わない
                    onAnimationEnd={(event) => {
                      if (event.target === event.currentTarget) onMotionEnd?.(group.key);
                    }}
                  >
                    {/* 項目は枠の左から 6px、見出しは 8px（見出しだけ 2px 内へ） */}
                    <p className="text-foreground/70 mb-1.5 flex items-center gap-1 pl-0.5 text-2xs">
                      {group.index === null ? null : (
                        <span className="shrink-0 font-semibold tabular-nums">{group.index}</span>
                      )}
                      <GroupTitle group={group} onCommentChange={onCommentChange} />
                      {/* 戻せない操作ではない（もう一度抜き出せる）ので確かめない。デモでは出さない */}
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
