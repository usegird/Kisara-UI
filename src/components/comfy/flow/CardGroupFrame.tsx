import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { createContext, useContext, useRef, useState } from 'react';

import { AnchorContext, groupAnchorKey } from '@/components/comfy/flow/anchor-context';
import { ColumnZoomContext } from '@/components/comfy/flow/column-zoom-context';
import {
  GROUP_TAB_HEIGHT,
  groupContainerId,
  groupSortId,
  keepInPlace,
  noLayoutAnimation,
} from '@/components/comfy/flow/flow-dnd';
import {
  GROUP_FRAME_PADDING,
  GROUP_FRAME_PADDING_BOTTOM,
  GROUP_FRAME_PADDING_TOP,
  groupTone,
} from '@/components/comfy/flow/group-frame-look';
import { GroupSwitchMenuItem } from '@/components/comfy/flow/GroupSwitchPanel';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuSubmenu,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { sortableAttributes } from '@/components/ui/drag-announcements';
import { DRAGGING_Z_INDEX } from '@/components/ui/sortable-style';
import type { GroupLabel } from '@/graph/groups';
import { DEFAULT_GROUP_COLOR, NODE_COLOR_OPTIONS } from '@/graph/node-settings';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { paintableColor, toHexColor } from '@/lib/color';
import { entryKeyOf } from '@/lib/text-entry';
import { zoomedTransform } from '@/store/settings-fields/column-zoom';

// ─────────────────────────────
// グループの枠。メンバーのカードをタブの付いた枠で囲み、子のグループは同じ部品を中に入れ子で描く。
// ─────────────────────────────

/** 掴んでいる間の元の枠の濃さ（落とす先として薄く見せる） */
const DROP_TARGET_OPACITY = 0.4;

/** グループの枠の受け取り物 */
export interface CardGroupFrameProps {
  readonly label: GroupLabel;
  /**
   * 直下のカードと子のグループの並べ替えの id（受け口に渡す。並びが同じなら同じ配列を渡す）。
   * ドラッグ中の置き直しは入れない（受け口が位置を測り直し、全カードを描き直す）
   */
  readonly items: readonly (NodeId | string)[];
  /** 中のカード全部（子のグループの中も）。グループごと削除で外す */
  readonly memberIds: readonly NodeId[];
  readonly onRename: (key: string, title: string) => void;
  readonly onUngroup: (key: string) => void;
  /** グループごと削除（メンバーをまとめて外す）。無ければ出さない */
  readonly onDeleteMembers?: ((ids: readonly NodeId[]) => void) | undefined;
  /**
   * subgraph に変換。外の階層だけ。無ければ出さない
   */
  readonly onConvertToSubgraph?: ((key: string) => void) | undefined;
  /** 色を変える（本体の `color`）。null で既定に戻す */
  readonly onColorChange: (key: string, color: string | null) => void;
  /** アプリ入力の列にグループの切り替えを出せるか（外の階層だけ） */
  readonly switchable?: boolean | undefined;
  readonly children: React.ReactNode;
}

/**
 * 枠の中か（子のグループの枠は親の枠の内側に収める）
 */
const InsideFrameContext = createContext(false);

/** 枠の余白（上・横・下）。CSS の padding の値 */
function framePadding(side: number): string {
  return [GROUP_FRAME_PADDING_TOP, side, GROUP_FRAME_PADDING_BOTTOM]
    .map((value) => `${String(value)}px`)
    .join(' ');
}

/**
 * グループの枠を描く。枠そのものが、載っている列（外の列か親の枠）の並べ替えの 1 つ（id は
 * `groupSortId`）で、中のカードと子のグループは枠ごとの受け口（`groupContainerId`）で並べ替える
 */
export function CardGroupFrame({
  label,
  items,
  memberIds,
  onRename,
  onUngroup,
  onDeleteMembers,
  onConvertToSubgraph,
  onColorChange,
  switchable = false,
  children,
}: CardGroupFrameProps): React.ReactElement {
  const sortable = useSortable({
    id: groupSortId(label.key),
    data: { label: label.title },
    attributes: sortableAttributes(),
    animateLayoutChanges: noLayoutAnimation,
  });
  // ずらし量は画面の px で来るので、列の倍率で割り戻す
  const zoom = useContext(ColumnZoomContext);
  // 枠はカードの外側へ広げる（カードの位置と幅は枠の外と同じ）。列が左右に空けた場所へはみ出す。
  // 子のグループの枠は親の枠の余白に重ねず、内側に収める（中のカードはその分だけ狭まる）
  const pad = GROUP_FRAME_PADDING;
  const nested = useContext(InsideFrameContext);
  const outside = nested ? 0 : -pad;
  // 枠とタブの塗りはグループの色。無ければ本体の既定と同じ淡青（`color` は書き足さない）
  const tone = groupTone(label.color);
  // 枠の位置を台帳に載せる（変数の列のタブから、ここへ列を送る）
  const anchors = useContext(AnchorContext);
  const attachAnchor = anchors?.register(groupAnchorKey(label.key));
  const picker = useGroupColorPicker(label.key, onColorChange);

  return (
    <li
      ref={(element) => {
        sortable.setNodeRef(element);
        attachAnchor?.(element);
      }}
      data-sort-id={groupSortId(label.key)}
      className="relative"
      style={{
        // タブの帯の分だけ枠を下げる（帯は枠の外として扱う。flow-dnd）
        paddingTop: GROUP_TAB_HEIGHT,
        marginLeft: outside,
        marginRight: outside,
        transform: CSS.Transform.toString(zoomedTransform(sortable.transform, zoom)),
        transition: sortable.transition,
        zIndex: sortable.isDragging ? DRAGGING_Z_INDEX : undefined,
        // 掴んでいる間は指に写しが付くので、ここは落とす先として薄く見せる
        opacity: sortable.isDragging ? DROP_TARGET_OPACITY : undefined,
      }}
      aria-label={t('flow.cardGroup.label', { title: label.title })}
    >
      <ContextMenuRoot>
        <ContextMenuTrigger
          // 左端は枠の左端と揃える。丸めるのはグループ全体の左上（タブの左上）だけで、
          // 枠の左上（タブとの繋ぎ目）は丸めない
          className="absolute top-0 left-0 flex max-w-[70%] items-center gap-0.5 rounded-t-md
            pr-1.5 pl-0.5"
          style={{ ...tone.tab, height: GROUP_TAB_HEIGHT }}
        >
          <button
            type="button"
            // 押せる大きさは 24px、場所を取るのは今までの 18px（負の余白。WCAG 2.5.8）。色はグループの色が
            // 入れ子で重なっても 3:1 を保てるよう、補助の文字の色でなく文字の色にする（WCAG 1.4.11）
            className="text-foreground -m-[3px] cursor-grab rounded p-[5px]"
            aria-label={t('flow.cardGroup.reorder', { title: label.title })}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical className="size-3.5" aria-hidden />
          </button>
          <GroupTitle label={label} onRename={onRename} />
        </ContextMenuTrigger>
        <ContextMenuContent label={t('flow.cardGroup.menu', { title: label.title })}>
          <GroupColorMenu label={label} onColorChange={onColorChange} onPickColor={picker.open} />
          <ContextMenuSeparator />
          {switchable ? <GroupSwitchMenuItem groupKey={label.key} /> : null}
          <ContextMenuItem
            title={t('flow.cardGroup.ungroupTitle')}
            onClick={() => onUngroup(label.key)}
          >
            {t('flow.cardGroup.ungroup')}
          </ContextMenuItem>
          {onConvertToSubgraph ? (
            <ContextMenuItem
              title={t('flow.cardGroup.toSubgraphTitle')}
              onClick={() => onConvertToSubgraph(label.key)}
            >
              {t('flow.cardGroup.toSubgraph')}
            </ContextMenuItem>
          ) : null}
          {onDeleteMembers ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                title={t('flow.cardGroup.deleteGroupTitle')}
                onClick={() => onDeleteMembers(memberIds)}
              >
                {t('flow.cardGroup.deleteGroup')}
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenuRoot>
      {picker.input}

      {/* 枠。線は引かず、中を淡く塗る（タブの下に続ける） */}
      <div
        className="rounded-lg rounded-tl-none"
        style={{ ...tone.frame, padding: framePadding(pad) }}
      >
        <SortableContext
          id={groupContainerId(label.key)}
          items={items as (NodeId | string)[]}
          strategy={keepInPlace}
        >
          <InsideFrameContext value={true}>
            <ol className="flex flex-col gap-3">{children}</ol>
          </InsideFrameContext>
        </SortableContext>
      </div>
    </li>
  );
}

/** 既定（色なし）を表す選択肢の値。選ぶと `color` のキーを落とす */
const NO_COLOR = '';
/** 組に無い色を表す選択肢の値（どの項目にも印を付けない） */
const CUSTOM_COLOR = 'custom';

/** 右クリックの「色」。本体と同じ 9 色（ノードの色の組の `groupcolor`）・既定・カスタム */
function GroupColorMenu({
  label,
  onColorChange,
  onPickColor,
}: Pick<CardGroupFrameProps, 'label' | 'onColorChange'> & {
  readonly onPickColor: (current: string | null) => void;
}): React.ReactElement {
  const current = label.color ?? null;
  const choice =
    current === null
      ? NO_COLOR
      : (NODE_COLOR_OPTIONS.find((option) => option.groupcolor === current)?.key ?? CUSTOM_COLOR);
  const swatch = paintableColor(current);

  return (
    <ContextMenuSubmenu label={t('flow.style.color')}>
      <ContextMenuRadioGroup
        value={choice}
        onValueChange={(key: string) => {
          const option = NODE_COLOR_OPTIONS.find((candidate) => candidate.key === key);
          onColorChange(label.key, option ? option.groupcolor : null);
        }}
      >
        <ContextMenuRadioItem value={NO_COLOR}>{t('flow.style.defaultColor')}</ContextMenuRadioItem>
        {NODE_COLOR_OPTIONS.map((option) => (
          <ContextMenuRadioItem key={option.key} value={option.key} swatch={option.groupcolor}>
            {option.label}
          </ContextMenuRadioItem>
        ))}
      </ContextMenuRadioGroup>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onPickColor(current)}>
        <span className="flex items-center gap-2 pl-[22px]">
          {/* 組に無い色のときだけ、今の色の見本を付ける */}
          {choice === CUSTOM_COLOR && swatch !== null ? (
            <span
              aria-hidden
              className="border-border size-3.5 shrink-0 rounded-sm border"
              style={{ backgroundColor: swatch }}
            />
          ) : null}
          {t('flow.style.custom')}
        </span>
      </ContextMenuItem>
    </ContextMenuSubmenu>
  );
}

/**
 * カスタムの色選び。ブラウザ標準の色選びを、メニューの外に置いた見えない入力から開く
 * （メニューの中に置くと、選んでいる途中でメニューと一緒に消える。カードの色選びと同じ）。
 * 選んでいる間も書き込み、その場で枠の色が変わる
 */
function useGroupColorPicker(
  key: string,
  onColorChange: CardGroupFrameProps['onColorChange'],
): { readonly open: (current: string | null) => void; readonly input: React.ReactNode } {
  const ref = useRef<HTMLInputElement | null>(null);

  const open = (current: string | null): void => {
    const element = ref.current;
    if (!element) return;
    // 色選びは #rrggbb しか受けない。今の色が読めなければ本体の既定（淡青）から始める
    element.value = (current === null ? null : toHexColor(current)) ?? DEFAULT_GROUP_COLOR;
    try {
      element.showPicker();
    } catch {
      element.click();
    }
  };

  const input = (
    <input
      ref={ref}
      type="color"
      tabIndex={-1}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 size-0 opacity-0"
      onChange={(event) => {
        const hex = toHexColor(event.target.value);
        if (hex) onColorChange(key, hex);
      }}
    />
  );

  return { open, input };
}

/** タブの名前。押すと書ける（Enter か外へ出ると確定、Esc でやめる） */
function GroupTitle({
  label,
  onRename,
}: Pick<CardGroupFrameProps, 'label' | 'onRename'>): React.ReactElement {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <button
        type="button"
        className="hover:border-input min-w-0 cursor-text truncate rounded border
          border-transparent px-1 text-left text-2xs font-semibold"
        title={label.title}
        aria-label={t('flow.cardGroup.rename', { title: label.title })}
        onClick={() => setDraft(label.title)}
      >
        {label.title}
      </button>
    );
  }

  const commit = (): void => {
    const title = draft.trim();
    if (title.length > 0 && title !== label.title) onRename(label.key, title);
    setDraft(null);
  };

  return (
    <input
      // 押した操作の続きで書けるよう、現れたらすぐ焦点を当てて全体を選ぶ
      ref={(element) => {
        if (element === null || element === document.activeElement) return;
        element.focus();
        element.select();
      }}
      className="border-input min-w-0 rounded border bg-transparent px-1 text-2xs font-semibold
        focus:border-ring focus:outline-none"
      value={draft}
      aria-label={t('flow.cardGroup.name', { title: label.title })}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        const key = entryKeyOf(event);
        if (key === 'commit') event.currentTarget.blur();
        if (key === 'cancel') setDraft(null);
      }}
    />
  );
}
