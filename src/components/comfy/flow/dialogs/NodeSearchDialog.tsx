import { PreviewCard } from '@base-ui/react/preview-card';
import { Command } from 'cmdk';
import { useMemo, useRef, useState } from 'react';

import {
  AnyTypeCheckbox,
  ModeTabs,
  RefreshDefinitionsButton,
  TypeSelect,
} from '@/components/comfy/flow/dialogs/NodeSearchFilters';
import {
  CategoryNav,
  ReferenceList,
  ReferenceNodeNav,
} from '@/components/comfy/flow/dialogs/NodeSearchNav';
import { CardPreviewPopup, NodeResult } from '@/components/comfy/flow/dialogs/NodeSearchResults';
import { DialogFrame } from '@/components/ui/dialog';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import { PaneDivider } from '@/components/ui/pane-divider';
import { SEARCH_INPUT_CLASS, SearchBox } from '@/components/ui/search-field';
import { referenceSlots, type ReferenceSide, type ReferenceSlot } from '@/graph/node-reference';
import type { NodeView } from '@/graph/rows';
import {
  defaultGroup,
  groupTree,
  hasFilters,
  NO_FILTERS,
  searchDefinitions,
  slotTypesOf,
  type SearchFilters,
} from '@/graph/search';
import type { NodeDefinition, NodeDefinitionMap, NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// ノード検索ポップアップ。末尾追加と中間挿入で同じ部品を共有し、足すノードを選ぶ（ノード追加）か、
// 既にあるノードの口を選ぶ（ノード参照）。木の組み立ては `graph/search.ts` の `groupTree`。
// ─────────────────────────────

/** ノード参照の起点。入力から開いたら接続元の出力を、出力から開いたら接続先の入力を選ぶ */
export interface ReferenceTarget {
  readonly side: ReferenceSide;
  /** 起点のノード（候補から外す） */
  readonly exclude: NodeId;
  /** 起点の型（型の絞り込みの初期値） */
  readonly type: string;
}

/** 検索のモード（足すノードを探す・既にあるノードを参照する） */
export type PopupMode = 'add' | 'reference';

/** 既定の空の並び（描くたびに新しい配列を作ると、分類の木を毎回数え直す） */
const NO_VIEWS: readonly NodeView[] = [];
const NO_FREQUENCY: readonly string[] = [];

/** ノード検索ポップアップの props */
export interface NodeSearchDialogProps {
  readonly open: boolean;
  readonly definitions: NodeDefinitionMap;
  /** ノードの利用頻度の表（ノード名、多い順）。よく使うものに使う。空なら出さない */
  readonly frequency?: readonly string[] | undefined;
  /** 見出し。末尾追加か中間挿入かを伝える */
  readonly title: string;
  /** 呼び出し元から決まる絞り込みの初期値 */
  readonly initialFilters?: SearchFilters | undefined;
  readonly onSelect: (definition: NodeDefinition) => void;
  readonly onClose: () => void;
  /** ノード参照の起点。無ければノード参照は選べない（末尾に足すとき） */
  readonly reference?: ReferenceTarget | null | undefined;
  /** ノード参照で並べるノード（カードの並び） */
  readonly views?: readonly NodeView[] | undefined;
  /** ノード参照で口を選んだとき */
  readonly onPickReference?: ((slot: ReferenceSlot) => void) | undefined;
}

/** 絞り込みの行（名前とは別の絞り込みと、名前の入力） */
const FILTER_ROW_CLASS =
  'text-muted-foreground flex items-center gap-1.5 border-b px-3 py-1.5 text-2xs';

/** ノード定義を名前・分類・型で絞って選ばせる。起点があればノード参照にも切り替えられる */
export function NodeSearchDialog({
  open,
  definitions,
  title,
  initialFilters,
  onSelect,
  onClose,
  reference = null,
  views = NO_VIEWS,
  frequency = NO_FREQUENCY,
  onPickReference,
}: NodeSearchDialogProps): React.ReactElement | null {
  // 現在使用中（隠しているノードも含めた、ワークフローにある種類）とよく使うものの材料
  // 下の検索の結果（手で書く memo）の依存なので、これも手で固定する
  const context = useMemo(
    () => ({ used: new Set(views.map((view) => view.classType)), frequency }),
    [views, frequency],
  );
  const [mode, setMode] = useState<PopupMode>('add');
  const [query, setQuery] = useState('');
  // 候補の名前を指したときのカードの見本。見本はダイアログの枠の右に並べる
  const [preview] = useState(() => PreviewCard.createHandle<NodeDefinition>());
  const body = useRef<HTMLDivElement>(null);
  const dialogOfBody = (): Element | null => body.current?.closest('[role="dialog"]') ?? null;
  // 開いたときはよく使うものを選んでおく（本体の Most relevant と同じ）。出せなければすべて
  const [filters, setFilters] = useState<SearchFilters>(() => ({
    ...(initialFilters ?? NO_FILTERS),
    group: initialFilters?.group || defaultGroup(context),
  }));

  // 検索と分類の木は、切り替えても作り直さないようここで持つ（2,000 件超を数え直さない）
  // 型の一覧と検索の結果は、この部品では compiler が前回の物にしないので手で書く
  const types = useMemo(() => slotTypesOf(definitions), [definitions]);
  const results = useMemo(
    () => searchDefinitions(definitions, query, { filters, context }),
    [definitions, query, filters, context],
  );
  // 左の分類の木。件数は名前の一致と、分類以外の絞り込みを掛けたあとの数
  const tree = groupTree(definitions, query, filters, context);

  // ノード参照。型の初期値は起点の型。切り替えて戻っても選んだものを残す
  const [referenceType, setReferenceType] = useState(reference?.type ?? '');
  const [referenceNode, setReferenceNode] = useState<NodeId | null>(null);
  const referenceable = reference !== null && onPickReference !== undefined;
  const candidates = reference
    ? referenceSlots(views, reference.side, {
        exclude: reference.exclude,
        type: referenceType,
        anyType: filters.anyType,
        query,
      })
    : [];
  const setAnyType = (anyType: boolean): void =>
    setFilters((previous) => ({ ...previous, anyType }));

  // 名前の入力。どちらの切り替えでも同じもの
  const searchInput = (
    <SearchBox className="flex-[2]">
      <Command.Input
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder={t(
          mode === 'add'
            ? 'nodeSearch.search.addPlaceholder'
            : 'nodeSearch.search.referencePlaceholder',
        )}
        className={SEARCH_INPUT_CLASS}
      />
    </SearchBox>
  );

  // ─── 左の列の幅を変える（端末に残す。枠を動かす・大きさを変えるのは共通の枠）
  const listWidth = useSettingsStore((state) => state.nodeSearchListWidth);
  const setListWidth = useSettingsStore((state) => state.setNodeSearchListWidth);
  // 左の列の境目。キーボードでも 16px ずつ動かせる
  const listDivider = (
    <PaneDivider
      label={t('nodeSearch.listColumn')}
      size={listWidth}
      side="left"
      onResize={setListWidth}
    />
  );

  return (
    <DialogFrame
      id="node-search"
      movable
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="lg"
      // 題名は読み上げの名前にだけ使う（説明の見出しは置かない）
      title={title}
      header={<ModeTabs mode={mode} referenceable={referenceable} onMode={setMode} />}
      actions={<RefreshDefinitionsButton />}
    >
      {/* キーボード操作は cmdk に任せる（a11y の部品を自作しない）。候補は 2,000 件を超えるので、
          絞り込みはこちらで掛けてから上限の件数だけ渡す */}
      <Command
        ref={body}
        shouldFilter={false}
        label={title}
        className="flex min-h-0 flex-1 flex-col"
      >
        <CardPreviewPopup handle={preview} definitions={definitions} anchor={dialogOfBody} />
        {mode === 'reference' && reference ? (
          <>
            <div className={FILTER_ROW_CLASS}>
              <TypeSelect
                label={t('nodeSearch.reference.type')}
                title={t(
                  reference.side === 'outputs'
                    ? 'nodeSearch.reference.typeOutputs'
                    : 'nodeSearch.reference.typeInputs',
                )}
                ariaLabel={t('nodeSearch.reference.typeFilter')}
                value={referenceType}
                types={[...new Set([reference.type, ...types])]}
                onChange={setReferenceType}
              />
              <AnyTypeCheckbox checked={filters.anyType} onChange={setAnyType} />
              {searchInput}
            </div>
            <div className="flex min-h-0 flex-1">
              <ReferenceNodeNav
                candidates={candidates}
                selected={referenceNode}
                width={listWidth}
                onSelect={setReferenceNode}
              />
              {listDivider}
              <ReferenceList
                side={reference.side}
                candidates={
                  referenceNode === null
                    ? candidates
                    : candidates.filter((candidate) => candidate.nodeId === referenceNode)
                }
                onPick={(slot) => onPickReference?.(slot)}
              />
            </div>
          </>
        ) : (
          <>
            {/* 名前とは別の絞り込み。呼び出し元のスロットから初期値が入る */}
            <div className={FILTER_ROW_CLASS}>
              <TypeSelect
                label={t('nodeSearch.filter.input')}
                title={t('nodeSearch.filter.inputTitle')}
                ariaLabel={t('nodeSearch.filter.inputFilter')}
                value={filters.input}
                types={types}
                onChange={(input) => setFilters((previous) => ({ ...previous, input }))}
              />
              <TypeSelect
                label={t('nodeSearch.filter.output')}
                title={t('nodeSearch.filter.outputTitle')}
                ariaLabel={t('nodeSearch.filter.outputFilter')}
                value={filters.output}
                types={types}
                onChange={(output) => setFilters((previous) => ({ ...previous, output }))}
              />
              <AnyTypeCheckbox checked={filters.anyType} onChange={setAnyType} />
              {searchInput}
            </div>
            <div className="flex min-h-0 flex-1">
              <CategoryNav
                tree={tree}
                selected={filters.group}
                width={listWidth}
                onSelect={(group) => setFilters((previous) => ({ ...previous, group }))}
              />
              {listDivider}
              <Command.List className="min-w-0 flex-1 overflow-y-auto p-1">
                <Command.Empty className={EMPTY_NOTICE_CLASS}>
                  {emptyMessage(definitions.size, filters)}
                </Command.Empty>
                {results.map((definition) => (
                  <NodeResult
                    key={definition.name}
                    definition={definition}
                    preview={preview}
                    onSelect={onSelect}
                  />
                ))}
              </Command.List>
            </div>
          </>
        )}
      </Command>
    </DialogFrame>
  );
}

/** 候補が無いときの一言。定義が無いのか、絞り込みで消えたのかを分ける */
function emptyMessage(definitionCount: number, filters: SearchFilters): string {
  if (definitionCount === 0) return t('nodeSearch.empty.noDefinitions');
  return hasFilters(filters) ? t('nodeSearch.empty.filtered') : t('nodeSearch.empty.none');
}
