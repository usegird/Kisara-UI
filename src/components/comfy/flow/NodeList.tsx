import { SortableContext } from '@dnd-kit/sortable';
import { Fragment, useState } from 'react';

import { AddNodeButton } from '@/components/comfy/flow/AddNodeButton';
import {
  entryCardIds,
  entryKey,
  entrySortId,
  withPreview,
  type DragPreview,
  type OutlineEntry,
} from '@/components/comfy/flow/card-outline';
import { CardGroupFrame } from '@/components/comfy/flow/CardGroupFrame';
import {
  groupSortId,
  keepInPlace,
  sortLevelOf,
  subgraphContainerId,
} from '@/components/comfy/flow/flow-dnd';
import {
  CARD_COLUMN_PADDING,
  CARD_COLUMN_PADDING_LEFT,
} from '@/components/comfy/flow/group-frame-look';
import { NO_MEMBERS } from '@/components/comfy/flow/node-list-values';
import type { NodeCardState } from '@/components/comfy/flow/NodeCardContent';
import { CardItem } from '@/components/comfy/flow/NodeListCardItem';
import { SubgraphBranch } from '@/components/comfy/flow/SubgraphBranch';
import {
  groupLabelOf,
  segmentByGroup,
  type CardSegment,
  type GroupLabel,
  type GroupParents,
  type Membership,
} from '@/graph/groups';
import type { NodeSettingsPatch } from '@/graph/node-settings';
import type { NodeRow, NodeView } from '@/graph/rows';
import type { SubgraphFrame as SubgraphFrameData } from '@/graph/subgraph-display';
import { levelOfId } from '@/graph/subgraph-level';
import type { LinkId, NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { reuseEqualItems, sameContent } from '@/lib/reuse-equal';

// ─────────────────────────────
// カードの列。縦に 1 列に並べ、dnd-kit で並べ替える（キーボードでも操作できる）。DndContext は
// FlowCanvas 側に 1 つだけ置く（つかむ側と落とす側が変数パネルにまたがり、入れ子では相手を見つけられない）。
// ─────────────────────────────

/** カードの列の受け取り物 */
export interface NodeListProps {
  readonly views: readonly NodeView[];
  /** ノード定義が読み込めているか（未取得ならカードごとの注記を出さない） */
  readonly definitionsLoaded?: boolean | undefined;
  /** 選んでいるカード */
  readonly selectedIds: ReadonlySet<NodeId>;
  /**
   * ノードの所属（`groups[]` の添字）と、グループの親、添字ごとの名前・色
   */
  readonly groupOf: Membership;
  readonly groupParents: GroupParents;
  readonly groupLabels: readonly GroupLabel[];
  /** 実行状態のカード（実行中・エラー）。無ければ選択状態か idle */
  readonly cardStates: ReadonlyMap<NodeId, NodeCardState>;
  /** カードを選ぶ。`additive`（Ctrl+クリック）なら選択に足す・外す */
  readonly onSelect: (id: NodeId, additive?: boolean) => void;
  readonly onCommentChange: (id: NodeId, comment: string) => void;
  readonly onCommit: (row: NodeRow, value: unknown) => void;
  /** 複数行の入力の高さを変える（ノードの `size` に残す） */
  readonly onResizeText: (row: NodeRow, height: number) => void;
  readonly onNeedOptions: (row: NodeRow) => void;
  /** 渡さなければ「詳細設定…」を押せない */
  readonly onOpenSettings?: ((id: NodeId) => void) | undefined;
  /** 右クリックメニューの「削除」 */
  readonly onDelete: (id: NodeId) => void;
  /** 右クリックメニューの「クローン」 */
  readonly onClone: (id: NodeId) => void;
  /** 選んだカードの右クリックメニューの「グループ化」 */
  readonly onGroup: (id: NodeId) => void;
  readonly onRenameGroup: (key: string, title: string) => void;
  readonly onUngroup: (key: string) => void;
  readonly onGroupColorChange: (key: string, color: string | null) => void;
  /** ドラッグ中に枠をまたいだとき、掴んだカードを落とす先へ置き直して見せる */
  readonly preview?: DragPreview | null | undefined;
  /** 実行モード・色（カード左下と右クリックメニュー） */
  readonly onSettingsChange: (id: NodeId, patch: NodeSettingsPatch) => void;
  readonly onDisconnect: (linkId: LinkId) => void;
  /** 出力チップの下の ▼。その出力の先にノードを足す（型は絞り込みの初期値） */
  readonly onAddAfter: (id: NodeId, slot: number, type: string) => void;
  /** 行の三角。その入力（パラメータを含む）の手前にノードを足す（型は絞り込みの初期値） */
  readonly onAddBefore: (id: NodeId, row: NodeRow) => void;
  /** パラメータ右端のアイコン。App Mode の対象を切り替える */
  readonly onToggleAppInput: (id: NodeId, widgetName: string) => void;
  /** 通番のクリック。パラメータの表示・非表示を切り替える */
  readonly onToggleCollapsed: (id: NodeId) => void;
  /** 列の末尾の「ノードを追加」。起点が無いので繋がずに足す */
  readonly onAppend: () => void;
  /**
   * 開いている subgraph の枠。無ければ開いているものは無い
   */
  readonly frames?: ReadonlyMap<NodeId, SubgraphFrameData> | undefined;
  /** グループごと削除（メンバーをまとめて外す） */
  readonly onDeleteCards?: ((ids: readonly NodeId[]) => void) | undefined;
  /** グループを subgraph に変換する（外の階層だけ） */
  readonly onConvertGroup?: ((key: string) => void) | undefined;
  /** subgraph をグループに戻す（外の階層だけ） */
  readonly onConvertSubgraph?: ((id: NodeId) => void) | undefined;
  /** subgraph を開く・閉じる。無ければカードに開く印を出さない */
  readonly onSetSubgraphOpen?: ((id: NodeId, open: boolean) => void) | undefined;
  /**
   * カードの間の ⊕。そのカードの手前に繋がずに足す
   */
  readonly onInsertBefore: (id: NodeId) => void;
  /** 滑り込ませるカード。無ければ null */
  readonly enteringId?: NodeId | null | undefined;
  /** 抜けさせるカード（まとめて消すときは何枚でも） */
  readonly leavingIds?: readonly NodeId[] | undefined;
  /** カードの動きが終わった */
  readonly onMotionEnd?: ((id: NodeId) => void) | undefined;
}

/** 塊を列の段にする（入れ子の塊は枠の中の段） */
function outlineOf(
  segments: readonly CardSegment<NodeView>[],
  labels: readonly GroupLabel[],
): OutlineEntry[] {
  return segments.map((segment): OutlineEntry => {
    if (segment.kind === 'single') return { kind: 'card', id: segment.item.id };
    const label = groupLabelOf(labels, segment.index);
    return { kind: 'group', label, entries: outlineOf(segment.children, labels) };
  });
}

/**
 * カードの並びをグループの塊に分けたもの。中身が同じ塊は前回のものを返す。
 * 新しい配列を並べ替えの受け口に渡すと、その中のカードが全部描き直しになる
 */
function useOutline(
  views: readonly NodeView[],
  groupOf: Membership,
  parents: GroupParents,
  labels: readonly GroupLabel[],
): readonly OutlineEntry[] {
  const next = outlineOf(segmentByGroup(views, groupOf, parents), labels);
  const [kept, setKept] = useState<readonly OutlineEntry[]>(next);
  if (sameContent(kept, next)) return kept;
  const reused = reuseEqualItems(kept, next, entryKey);
  setKept(reused);
  return reused;
}

const NO_ITEMS: readonly (NodeId | string)[] = [];

/** 枠ごとの、直下の並べ替えの id と中のカード全部（置き直す前の並びから。受け口に渡す） */
interface FrameLists {
  readonly items: readonly (NodeId | string)[];
  readonly members: readonly NodeId[];
}

function frameListsOf(entries: readonly OutlineEntry[], into: Map<string, FrameLists>): void {
  for (const entry of entries) {
    if (entry.kind === 'card') continue;
    into.set(entry.label.key, {
      items: entry.entries.map(entrySortId),
      members: entryCardIds(entry),
    });
    frameListsOf(entry.entries, into);
  }
}

/** 開いた subgraph が無いとき（毎回同じものを使う） */
const NO_FRAMES: ReadonlyMap<NodeId, SubgraphFrameData> = new Map();
const NO_VIEWS: readonly NodeView[] = [];

/**
 * カードを階層ごとに分ける（外と、開いた subgraph の中ごと）
 */
function splitByLevel(views: readonly NodeView[]): {
  readonly outer: readonly NodeView[];
  readonly inner: ReadonlyMap<NodeId, readonly NodeView[]>;
} {
  const outer: NodeView[] = [];
  const inner = new Map<NodeId, NodeView[]>();
  for (const view of views) {
    const level = levelOfId(view.id);
    if (level === null) outer.push(view);
    else inner.set(level, [...(inner.get(level) ?? []), view]);
  }
  return { outer, inner };
}

/** ドラッグ中の置き直しが属する階層 */
function previewLevel(preview: DragPreview): NodeId | null {
  return sortLevelOf(typeof preview.id === 'number' ? preview.id : groupSortId(preview.id.group));
}

/** カードを階層ごとの列に並べ、末尾にノードを足す ⊕ を置く */
export function NodeList(props: NodeListProps): React.ReactElement {
  const { views, groupOf, groupLabels, onAppend, onSetSubgraphOpen } = props;
  const levels = splitByLevel(views);
  const openSubgraph = (id: NodeId): void => onSetSubgraphOpen?.(id, true);
  const closeSubgraph = (id: NodeId): void => onSetSubgraphOpen?.(id, false);
  // 左右は枠の広がるぶん空ける（枠はカードの外側へ広げる）
  const pad = CARD_COLUMN_PADDING;
  // 左は subgraph の点線の〇のぶん広い
  const padLeft = CARD_COLUMN_PADDING_LEFT;

  return (
    // 左右はグループの枠の余白のぶん空ける（列は横にはみ出した分を切るため、枠がそこへはみ出す）。
    // ▶ はカード枠に重ねて置き、枠からわずかに出る分もこの中に収まる。
    // 上は空けない（列の上端は隣の列と同じ基準線。先頭の ⊕ はカードの上端に重ねる）
    <div style={{ paddingLeft: padLeft, paddingRight: pad }}>
      <LevelList
        {...props}
        level={null}
        levelViews={levels.outer}
        innerViews={levels.inner}
        membership={groupOf}
        parents={props.groupParents}
        labels={groupLabels}
        openSubgraph={onSetSubgraphOpen ? openSubgraph : undefined}
        closeSubgraph={closeSubgraph}
      />

      {/* 末尾。**どこにも繋がずに**足せる入口（最初の1枚もここから） */}
      <div className="mt-3 flex justify-center">
        <AddNodeButton
          shown="always"
          label={t('flow.list.addNode')}
          title={t('flow.list.addNodeTitle')}
          onClick={onAppend}
        />
      </div>
      {/* カードが 1 枚も無いときは、⊕ を指す吹き出しで最初の 1 枚を促す */}
      {views.length === 0 ? <FirstNodeHint /> : null}
    </div>
  );
}

/** ⊕ の真下に置き、上向きの尖りで ⊕ を指す吹き出し */
function FirstNodeHint(): React.ReactElement {
  return (
    <div className="mt-2 flex justify-center">
      <p
        className="bg-popover text-popover-foreground relative rounded-md border px-3 py-1.5
          text-xs shadow-sm"
      >
        <span
          aria-hidden
          className="bg-popover absolute -top-[5px] left-1/2 size-2 -translate-x-1/2 rotate-45
            border-t border-l"
        />
        {t('flow.list.firstNode')}
      </p>
    </div>
  );
}

/** 1 階層分のカードの並びの受け取り物 */
export interface LevelListProps extends NodeListProps {
  /** 階層（開いた subgraph のインスタンス。外なら null） */
  readonly level: NodeId | null;
  readonly levelViews: readonly NodeView[];
  /** 開いた subgraph ごとの中のカード */
  readonly innerViews: ReadonlyMap<NodeId, readonly NodeView[]>;
  readonly membership: Membership;
  readonly parents: GroupParents;
  readonly labels: readonly GroupLabel[];
  readonly openSubgraph: ((id: NodeId) => void) | undefined;
  readonly closeSubgraph: (id: NodeId) => void;
}

/**
 * 1 つの階層のカードの列。階層ごとに並べ替えの受け口を分ける（落とせる先は同じ階層の中だけ）。
 * 開いた subgraph は枠にして、中に同じ列を入れる
 */
function LevelList(props: LevelListProps): React.ReactElement {
  const { level, levelViews, innerViews, membership, parents, labels } = props;
  const { onRenameGroup, onUngroup, onGroupColorChange, closeSubgraph } = props;
  const { onDeleteCards, onConvertGroup } = props;
  const { frames = NO_FRAMES, preview = null } = props;
  const kept = useOutline(levelViews, membership, parents, labels);
  // 描くのはドラッグ中の置き直しを入れた並び（この階層のものを掴んでいるときだけ）
  const shown = preview !== null && previewLevel(preview) === level ? preview : null;
  const outline = withPreview(kept, shown);
  // 並べ替えの受け口には置き直す前の並びを渡す。並びが変わると、受け口は
  // 位置を測り直して全カードを描き直す。落とす先は掴んだときの位置で決めるので、測り直しも要らない。
  // 並びが同じなら前回の配列を渡す（値を 1 つ変えただけでも `views` は新しくなる）
  const ids = kept.map(entrySortId);
  const listsOf = new Map<string, FrameLists>();
  frameListsOf(kept, listsOf);
  const viewOf = new Map(levelViews.map((view) => [view.id, view]));
  const firstId = levelViews[0]?.id;

  const cardOf = (id: NodeId): React.ReactNode => {
    const view = viewOf.get(id);
    if (!view) return null;
    const frame = level === null ? frames.get(id) : undefined;
    if (frame) {
      // 見出しだけのカード（並べ替えはこれを掴む）と、その下に字下げした中の列
      return (
        <Fragment key={id}>
          <CardItem {...props} view={view} first={id === firstId} subgraphUses={frame.uses} />
          <SubgraphBranch frame={frame} head={view} onClose={closeSubgraph}>
            <LevelList
              {...props}
              level={id}
              levelViews={innerViews.get(id) ?? NO_VIEWS}
              membership={frame.membership}
              parents={frame.parents}
              labels={frame.groupLabels}
            />
          </SubgraphBranch>
        </Fragment>
      );
    }
    return <CardItem key={id} {...props} view={view} first={id === firstId} />;
  };

  /** 段 1 つ。グループは枠の中に直下の段を同じく描く（入れ子） */
  const entryOf = (entry: OutlineEntry): React.ReactNode => {
    if (entry.kind === 'card') return cardOf(entry.id);
    const lists = listsOf.get(entry.label.key);
    return (
      <CardGroupFrame
        key={entryKey(entry)}
        label={entry.label}
        items={lists?.items ?? NO_ITEMS}
        memberIds={lists?.members ?? NO_MEMBERS}
        onRename={onRenameGroup}
        onUngroup={onUngroup}
        onDeleteMembers={onDeleteCards}
        // subgraph への変換は外の階層だけ
        onConvertToSubgraph={level === null ? onConvertGroup : undefined}
        onColorChange={onGroupColorChange}
        // 切り替えは外の階層のグループだけ（開いた subgraph の中のものは指せない）
        switchable={level === null}
      >
        {entry.entries.map(entryOf)}
      </CardGroupFrame>
    );
  };

  return (
    // 並びはずらさない。掴んだものは落とす先へ置き直して見せる
    <SortableContext
      {...(level === null ? {} : { id: subgraphContainerId(level) })}
      items={ids}
      strategy={keepInPlace}
    >
      <ol className="flex flex-col gap-3">{outline.map(entryOf)}</ol>
    </SortableContext>
  );
}
