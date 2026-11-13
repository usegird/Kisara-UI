import { Command } from 'cmdk';
import { LayoutList, SquareStack } from 'lucide-react';

import { listButton } from '@/components/comfy/flow/dialogs/node-search-look';
import { CategoryBranch } from '@/components/comfy/flow/dialogs/NodeSearchResults';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import { referenceNodes, type ReferenceSide, type ReferenceSlot } from '@/graph/node-reference';
import { groupTree } from '@/graph/search';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';

// ─────────────────────────────
// ノードの検索の左の案内（カテゴリ・参照するノード）と参照の一覧
// ─────────────────────────────

interface CategoryNavProps {
  readonly tree: ReturnType<typeof groupTree>;
  readonly selected: string;
  readonly width: number;
  readonly onSelect: (group: string) => void;
}

/** 左: 分類の木。よく使うもの・現在使用中 → すべて → 本体の分類・カスタム・パートナー */
export function CategoryNav({
  tree,
  selected,
  width,
  onSelect,
}: CategoryNavProps): React.ReactElement {
  return (
    <nav
      aria-label={t('nodeSearch.nav.categories')}
      className="shrink-0 overflow-y-auto p-1"
      style={{ width }}
    >
      <CategoryBranch nodes={tree.leading} depth={0} selected={selected} onSelect={onSelect} />
      {tree.leading.length > 0 ? <hr aria-hidden className="border-border mx-1 my-1" /> : null}
      <button
        type="button"
        className={listButton({ selected: selected === '' })}
        aria-pressed={selected === ''}
        onClick={() => onSelect('')}
      >
        <LayoutList className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{t('nodeSearch.nav.all')}</span>
        <span className="text-muted-foreground ml-auto tabular-nums">{tree.total}</span>
      </button>
      <CategoryBranch nodes={tree.nodes} depth={0} selected={selected} onSelect={onSelect} />
    </nav>
  );
}

interface ReferenceNodeNavProps {
  readonly candidates: readonly ReferenceSlot[];
  /** 選んでいるノード。null はすべて */
  readonly selected: NodeId | null;
  readonly width: number;
  readonly onSelect: (nodeId: NodeId | null) => void;
}

/** 左: 参照するノード。先頭にすべて、あとはカードの並び */
export function ReferenceNodeNav({
  candidates,
  selected,
  width,
  onSelect,
}: ReferenceNodeNavProps): React.ReactElement {
  const nodes = referenceNodes(candidates);
  return (
    <nav
      aria-label={t('nodeSearch.reference.nodes')}
      className="shrink-0 overflow-y-auto p-1"
      style={{ width }}
    >
      <button
        type="button"
        className={listButton({ selected: selected === null })}
        aria-pressed={selected === null}
        onClick={() => onSelect(null)}
      >
        <SquareStack className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{t('nodeSearch.nav.all')}</span>
        <span className="text-muted-foreground ml-auto tabular-nums">{candidates.length}</span>
      </button>
      {nodes.map((node) => (
        <button
          key={node.nodeId}
          type="button"
          className={listButton({ selected: selected === node.nodeId })}
          title={node.nodeLabel}
          aria-pressed={selected === node.nodeId}
          onClick={() => onSelect(node.nodeId)}
        >
          <span className="w-5 shrink-0 text-right font-semibold tabular-nums">
            {node.nodeIndex ?? ''}
          </span>
          <span className="truncate">{node.nodeLabel}</span>
          <span className="text-muted-foreground ml-auto tabular-nums">{node.count}</span>
        </button>
      ))}
    </nav>
  );
}

interface ReferenceListProps {
  readonly side: ReferenceSide;
  readonly candidates: readonly ReferenceSlot[];
  readonly onPick: (slot: ReferenceSlot) => void;
}

/** 右: 出力（接続元を選ぶ）か入力（接続先を選ぶ） */
export function ReferenceList({
  side,
  candidates,
  onPick,
}: ReferenceListProps): React.ReactElement {
  return (
    <Command.List
      label={t(
        side === 'outputs' ? 'nodeSearch.reference.outputsList' : 'nodeSearch.reference.inputsList',
      )}
      className="min-w-0 flex-1 overflow-y-auto p-1"
    >
      <Command.Empty className={EMPTY_NOTICE_CLASS}>
        {t(side === 'outputs' ? 'nodeSearch.reference.noOutputs' : 'nodeSearch.reference.noInputs')}
      </Command.Empty>
      {candidates.map((candidate) => (
        <Command.Item
          key={candidate.key}
          value={candidate.key}
          onSelect={() => onPick(candidate)}
          className="data-[selected=true]:bg-accent flex cursor-pointer items-center gap-2
            rounded px-2 py-1.5 text-sm"
        >
          <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums">
            {candidate.nodeIndex ?? ''}
          </span>
          <span className="text-muted-foreground shrink-0 truncate text-xs">
            {candidate.nodeLabel} /
          </span>
          <span className="truncate">{candidate.name}</span>
          {candidate.linked ? (
            <span
              className="text-muted-foreground shrink-0 text-3xs"
              title={t('nodeSearch.reference.linkedTitle')}
            >
              {t('nodeSearch.reference.linked')}
            </span>
          ) : null}
          <span className="text-muted-foreground ml-auto shrink-0 text-xs">{candidate.type}</span>
        </Command.Item>
      ))}
    </Command.List>
  );
}
