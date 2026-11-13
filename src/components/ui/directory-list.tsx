import { cva } from 'class-variance-authority';
import { Folder } from 'lucide-react';

import { t } from '@/i18n';
import type { PathDirectory } from '@/lib/path-tree';

// ─────────────────────────────
// 階層の絞り込みの一覧。モデルを選ぶ画面とワイルドカードの画面で同じ見た目にする。
// 階層の組み立ては `lib/path-tree`、幅と境目は置く側の列（`SidePane`）が持つ。
// ─────────────────────────────

/** 階層の行の左の余白（`px-2` と同じ） */
export const TREE_INDENT_BASE = 8;

/** 階層 1 段ごとに足す字下げ */
export const TREE_INDENT_STEP = 12;

/** 階層 1 つの行 */
const entry = cva(
  'hover:bg-accent flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs',
  { variants: { active: { true: 'bg-accent', false: '' } } },
);

/** 階層の一覧の props */
export interface DirectoryListProps {
  /** 読み上げの名前 */
  readonly label: string;
  /** 全部の件数（「すべて」に添える） */
  readonly total: number;
  readonly directories: readonly PathDirectory[];
  /** 選んでいる階層。空文字は「すべて」 */
  readonly selected: string;
  readonly onSelect: (path: string) => void;
}

function Entry({
  label,
  count,
  depth,
  title,
  active,
  onClick,
}: {
  readonly label: string;
  readonly count: number;
  readonly depth: number;
  readonly title?: string | undefined;
  readonly active: boolean;
  readonly onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={entry({ active })}
      style={{ paddingLeft: TREE_INDENT_BASE + depth * TREE_INDENT_STEP }}
      title={title}
      aria-pressed={active}
      onClick={onClick}
    >
      {/* 列を狭めたとき（Lora の左の列）は絵を隠して名前に幅を回す */}
      <Folder className="size-3.5 shrink-0 @max-[8rem]:hidden" aria-hidden />
      <span className="truncate">{label}</span>
      {/* 件数も狭めたときは隠す（名前だけ残す） */}
      <span className="text-muted-foreground ml-auto tabular-nums @max-[8rem]:hidden">{count}</span>
    </button>
  );
}

/** 先頭に「すべて」、下に入れ子の階層と件数を並べ、押した階層を選ぶ */
export function DirectoryList({
  label,
  total,
  directories,
  selected,
  onSelect,
}: DirectoryListProps): React.ReactElement {
  return (
    <nav aria-label={label} className="min-h-0 flex-1 overflow-y-auto p-1">
      <Entry
        label={t('ui.directory.all')}
        count={total}
        depth={0}
        active={selected === ''}
        onClick={() => onSelect('')}
      />
      {directories.map((entry) => (
        <Entry
          key={entry.path}
          label={entry.label}
          count={entry.count}
          depth={entry.depth}
          title={entry.path}
          active={selected === entry.path}
          onClick={() => onSelect(entry.path)}
        />
      ))}
    </nav>
  );
}
