import { cva } from 'class-variance-authority';
import { useContext } from 'react';

import { AddNodeButton } from '@/components/comfy/flow/AddNodeButton';
import {
  AnchorContext,
  bodyAnchorKey,
  outputAnchorKey,
} from '@/components/comfy/flow/anchor-context';
import { anchorStyle } from '@/components/comfy/flow/card-style';
import { OutputChips } from '@/components/comfy/flow/CardOutputChips';
import { FlowLookContext } from '@/components/comfy/flow/flow-look-context';
import { TextHeightHandle } from '@/components/comfy/flow/HeightHandle';
import type { CardActions, NodeCardBodyProps } from '@/components/comfy/flow/NodeCard';
import { NodeRow } from '@/components/comfy/flow/NodeRow';
import type { NodeRow as NodeRowData, NodeView } from '@/graph/rows';
import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { t } from '@/i18n';

// ─────────────────────────────
// カードの本体（注記・行・下端の欄）と、縁に重ねる物（高さの取っ手・上の ⊕）
// ─────────────────────────────

/**
 * カードの下端の高さの掴みに渡す複数行の入力。アプリ入力にして 1 行になったものしか
 * 無ければ、そのまま 1 つぶんとして変える（左の列の入力欄の高さが変わる）
 */
function textRowsOf(view: NodeView): NodeRowData[] {
  const texts = view.rows.filter(
    (row) => row.kind === 'widget' && row.multiline && row.target?.kind === 'node',
  );
  const shown = texts.filter((row) => !row.appInput);
  return shown.length > 0 ? shown : texts.slice(0, 1);
}

/** 下端の欄（出力）。デモは余白を倍にする */
const cardFooter = cva('group/out relative flex items-start gap-1.5', {
  variants: { roomy: { false: 'py-1 pr-3 pl-1', true: 'py-2 pr-6 pl-2' } },
});

/**
 * 下端の出力チップ。既定は右寄せで折り返し、デモは右寄せの縦 1 列
 */
const footerChips = cva('flex min-w-0 flex-1 justify-end', {
  variants: {
    vertical: { false: 'flex-wrap items-center gap-1.5', true: 'flex-col items-end gap-1' },
  },
});

/**
 * ⊕ を乗せる場所。`gap` はカードの上の隙間（列の gap 12px）いっぱいで、⊕ はその真ん中。
 * `edge` は先頭のカード用で、カードの上端 8px に重ね、⊕ は上端に付ける
 * （列の上端は隣の列と同じ基準線で、カードの上に隙間が無いため）
 */
const insertAbove = cva('group/gap absolute inset-x-0 z-10 flex justify-center', {
  variants: {
    at: { gap: '-top-3 h-3 items-center', edge: 'top-0 h-2 items-start' },
  },
});

/**
 * カードの上に乗せたときだけ出る ⊕。押すと、このカードの手前に繋がずに足す
 */
function InsertAbove({
  label,
  at,
  onInsert,
}: {
  readonly label: string;
  readonly at: 'gap' | 'edge';
  readonly onInsert: () => void;
}): React.ReactElement {
  return (
    <div className={insertAbove({ at })}>
      <AddNodeButton
        shown="hover"
        label={t('flow.card.insertAboveLabel', { name: label })}
        title={t('flow.card.insertAboveTitle')}
        onClick={onInsert}
        menuAction
      />
    </div>
  );
}

type CardBodyProps = Pick<
  NodeCardBodyProps,
  | 'view'
  | 'onCommit'
  | 'onNeedOptions'
  | 'onDisconnect'
  | 'onAddBefore'
  | 'onToggleAppInput'
  | 'onAddAfter'
> & {
  readonly anchors: AnchorRegistry | null;
  /** 折りたたみで上下に開閉する本体 */
  readonly bodyRef: React.Ref<HTMLDivElement>;
  readonly definitionsLoaded: boolean;
};

/** カードの本体（注記・行・下部の欄）。折りたたみで上下に開閉する */
export function CardBody({
  view,
  anchors,
  bodyRef,
  definitionsLoaded,
  onCommit,
  onNeedOptions,
  onDisconnect,
  onAddBefore,
  onToggleAppInput,
  onAddAfter,
}: CardBodyProps): React.ReactElement {
  return (
    // 見出しの帯と行の間を少し空ける
    <div ref={bodyRef} className="pt-1">
      <BodyNote view={view} definitionsLoaded={definitionsLoaded} />

      {view.rows.length > 0 ? (
        <div ref={anchors?.register(bodyAnchorKey(view.id))}>
          {view.rows.map((row) => (
            <NodeRow
              key={row.name}
              nodeId={view.id}
              row={row}
              onCommit={onCommit}
              onNeedOptions={onNeedOptions}
              onDisconnect={onDisconnect}
              onAddBefore={onAddBefore}
              onToggleAppInput={onToggleAppInput}
            />
          ))}
        </div>
      ) : null}

      <CardFooter view={view} onAddAfter={onAddAfter} />
    </div>
  );
}

/** カードの縁に重ねる物（文字の欄の高さの取っ手・上の ⊕） */
export function CardEdges({
  view,
  collapsed,
  onResizeText,
  onInsertAbove,
  insertAt,
}: Pick<NodeCardBodyProps, 'view' | 'onResizeText' | 'onInsertAbove'> & {
  readonly collapsed: boolean;
  readonly insertAt: NonNullable<NodeCardBodyProps['insertAt']>;
}): React.ReactElement {
  const onInsertClick = (): void => onInsertAbove?.(view.id);
  return (
    <>
      {collapsed || !onResizeText ? null : (
        <TextHeightHandle
          label={view.displayName}
          rows={textRowsOf(view)}
          onResizeText={onResizeText}
        />
      )}
      {onInsertAbove ? (
        <InsertAbove label={view.displayName} at={insertAt} onInsert={onInsertClick} />
      ) : null}
    </>
  );
}

/** 本体の頭の注記。定義が無い・パラメータの位置を解決できないときだけ出す */
function BodyNote({
  view,
  definitionsLoaded,
}: {
  readonly view: NodeView;
  readonly definitionsLoaded: boolean;
}): React.ReactElement | null {
  if (view.broken !== undefined) return null;
  if (view.kind === 'unknown') {
    // 定義そのものが未取得のときは全カードに出てしまうので、バナーに任せて黙る
    if (!definitionsLoaded) return null;
    return (
      <p className="text-muted-foreground px-3 py-2 text-xs">
        {view.linked ? t('flow.card.missingDefinition') : t('flow.card.noServerDefinition')}
      </p>
    );
  }
  if (!view.unresolved) return null;
  return <p className="text-destructive px-3 py-2 text-xs">{t('flow.card.unresolved')}</p>;
}

/**
 * 下端の欄。右に出力（出力アンカーはスロット数に関わらず 1 点）。
 * 出力が無ければ欄を出さない
 */
function CardFooter({
  view,
  onAddAfter,
}: { readonly view: NodeView } & Pick<CardActions, 'onAddAfter'>): React.ReactElement | null {
  const anchors = useContext(AnchorContext);
  const { chipOutputs: vertical, roomy } = useContext(FlowLookContext);
  if (view.outputs.length === 0) return null;

  return (
    <div className={cardFooter({ roomy })}>
      <div className={footerChips({ vertical })}>
        <OutputChips view={view} onAddAfter={onAddAfter} />
        {/* チップごとに線を出すなら、まとめた点は置かない（線はチップから出る） */}
        {vertical ? null : (
          <span
            ref={anchors?.register(outputAnchorKey(view.id))}
            className="size-2.5 shrink-0 rounded-full"
            style={anchorStyle(view)}
          />
        )}
      </div>
    </div>
  );
}
