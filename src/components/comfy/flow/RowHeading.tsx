import { cva } from 'class-variance-authority';
import { PanelsTopLeft } from 'lucide-react';
import { useContext } from 'react';

import { AnchorContext, appTargetAnchorKey } from '@/components/comfy/flow/anchor-context';
import { FlowLookContext } from '@/components/comfy/flow/flow-look-context';
import type { NodeRowProps } from '@/components/comfy/flow/NodeRow';
import type { NodeRow as NodeRowData } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';
import { truncate } from '@/lib/text';
import { slotColor } from '@/styles/slot-color';

// ─────────────────────────────
// 行の見出しと、手前に足す三角・アプリ入力の印
// ─────────────────────────────

/**
 * 行の見出し。1 行の入力との間の余白は、12 文字の名前がちょうど収まる幅で決まる。
 * 狭い画面は左を詰め、幅も詰める（名前と入力の間がおよそ半分）
 */
const rowHeading = cva('group/head text-muted-foreground flex shrink-0 items-center gap-1.5', {
  variants: {
    stacked: { true: 'w-full', false: '' },
    compact: { true: '', false: 'pl-1' },
  },
  compoundVariants: [
    { stacked: false, compact: false, class: 'w-28' },
    { stacked: false, compact: true, class: 'w-[92px]' },
  ],
});

/** 手前にノードを足す三角の押し場所。繋がっていない行は薄く出したままにする */
const addBeforeButton = cva(
  [
    'absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center',
    'transition-opacity hover:opacity-100 focus:opacity-100',
  ],
  { variants: { connected: { true: 'opacity-0', false: 'opacity-40' } } },
);

/** 三角の向き。繋がっていれば線の側を、繋がっていなければ行の内側を指す */
const addBeforeArrow = cva('block h-0 w-0 border-y-[5px] border-y-transparent', {
  variants: { connected: { true: 'border-l-[6px]', false: 'border-r-[6px]' } },
});

/** アプリ入力の切り替え */
const appInputToggle = cva('shrink-0 rounded p-0.5 transition-opacity', {
  variants: {
    // 2px 左へ寄せ（取っ手と同じ横位置）、名前の位置は変えない（右を同じだけ空ける）。
    // 狭い画面は行の左を詰めたぶん、カードの縁と名前の真ん中へ寄せる
    compact: { true: '-mr-[1.5px] ml-[1.5px]', false: '-ml-0.5 mr-0.5' },
    // 出すのは見出しを指したときだけ（入力欄を指しても出さない）
    on: {
      true: 'text-slot-conditioning',
      false: 'opacity-0 group-hover/head:opacity-100 focus:opacity-100',
    },
  },
});

/** パラメータ名をカードに出す上限（文字数）。超えた分は「…」で省略する */
const LABEL_MAX = 12;

interface AddBeforeButtonProps {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
  readonly onAddBefore: (id: number, row: NodeRowData) => void;
}

/**
 * この入力の手前にノードを足す三角。繋がっているかで置き場所と出し方を変える。
 * 繋がっていない行の三角は薄く出したままにする（線が無いので、ホバーでしか出ないと入口が
 * あること自体に気づけない）。パラメータ行は繋がっていない入力と同じ扱い（足すと入力に変わる）
 */
export function AddBeforeButton({
  nodeId,
  row,
  onAddBefore,
}: AddBeforeButtonProps): React.ReactElement {
  const connected = row.kind === 'link';
  return (
    <button
      type="button"
      className={addBeforeButton({ connected })}
      style={{ ...(connected ? { left: -5 } : { right: 2 }), width: 8, height: 14 }}
      {...MENU_ACTION}
      aria-label={t('flow.row.insertBeforeLabel', { name: row.label })}
      title={t('flow.row.insertBeforeTitle')}
      onClick={() => onAddBefore(nodeId, row)}
    >
      <span
        aria-hidden
        className={addBeforeArrow({ connected })}
        style={
          connected
            ? { borderLeftColor: slotColor(row.type) }
            : { borderRightColor: slotColor(row.type) }
        }
      />
    </button>
  );
}

interface RowHeadingProps {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
  readonly stacked: boolean;
  readonly onToggleAppInput: NodeRowProps['onToggleAppInput'];
}

/**
 * 印とラベル。常に同じ行で、複数行のときだけ本文を下へ落とす。
 * 見出しだけ 4px 内側へ寄せる（値の欄の位置は変えない）。型の丸は出さない
 */
export function RowHeading({
  nodeId,
  row,
  stacked,
  onToggleAppInput,
}: RowHeadingProps): React.ReactElement {
  const { compact } = useContext(FlowLookContext);
  return (
    <span className={rowHeading({ stacked, compact })}>
      {/* 名前が確定している widget 行だけ。名前の左に置く。位置しか分からない行は対象にしない */}
      {onToggleAppInput && row.kind === 'widget' ? (
        <AppInputToggle nodeId={nodeId} row={row} onToggleAppInput={onToggleAppInput} />
      ) : onToggleAppInput ? (
        // 印の無い行も名前の位置を揃える（印と同じ幅を空ける）
        <span aria-hidden className="-ml-0.5 mr-0.5 w-[18px] shrink-0" />
      ) : row.appInput ? (
        <AppInputMark nodeId={nodeId} row={row} />
      ) : null}
      {/* 長い名前は省略し、全文は指したときに出す */}
      <span className="min-w-0 truncate" title={row.label}>
        {truncate(row.label, LABEL_MAX)}
      </span>
    </span>
  );
}

/**
 * 切り替えられない行のアプリ入力の印（開いた subgraph の中の、アプリ入力にした昇格の入力）。
 * 左の列から引く線の終点になる
 */
function AppInputMark({
  nodeId,
  row,
}: {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
}): React.ReactElement {
  const anchors = useContext(AnchorContext);
  return (
    <span
      ref={anchors?.register(appTargetAnchorKey(nodeId, row.widgetName))}
      className="text-slot-conditioning -ml-0.5 mr-0.5 shrink-0 p-0.5"
      title={t('flow.row.appInputOnTitle')}
    >
      <PanelsTopLeft className="size-3.5" aria-hidden />
    </span>
  );
}

interface AppInputToggleProps {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
  readonly onToggleAppInput: (id: number, widgetName: string) => void;
}

/**
 * App Mode（アプリ入力）の対象の切り替え。アプリ入力にした行では、
 * 左の列から引く線の終点になる。終点は行のアプリ入力の印
 */
function AppInputToggle({
  nodeId,
  row,
  onToggleAppInput,
}: AppInputToggleProps): React.ReactElement {
  const anchors = useContext(AnchorContext);
  const { compact } = useContext(FlowLookContext);
  const appAnchor = row.appInput
    ? anchors?.register(appTargetAnchorKey(nodeId, row.widgetName))
    : null;
  return (
    <button
      ref={appAnchor ?? undefined}
      type="button"
      className={appInputToggle({ compact, on: row.appInput })}
      {...MENU_ACTION}
      aria-label={t(row.appInput ? 'flow.row.removeAppInput' : 'flow.row.addAppInput', {
        name: row.label,
      })}
      aria-pressed={row.appInput}
      title={row.appInput ? t('flow.row.appInputOnTitle') : t('flow.row.appInputOffTitle')}
      onClick={() => onToggleAppInput(nodeId, row.widgetName)}
    >
      <PanelsTopLeft className="size-3.5" aria-hidden />
    </button>
  );
}
