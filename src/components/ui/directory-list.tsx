import { cva } from 'class-variance-authority';
import { FileText, Folder, FolderOpen } from 'lucide-react';

import { textDragProps } from '@/components/ui/text-drag';
import { t } from '@/i18n';
import { pathTreeRows, visibleTreeRows, type PathDirectory, type PathLeaf } from '@/lib/path-tree';

export const TREE_INDENT_BASE = 8;

export const TREE_INDENT_STEP = 12;

const entry = cva(
  'hover:bg-accent flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs',
  { variants: { active: { true: 'bg-accent', false: '' } } },
);

export interface DirectoryListProps {
  readonly label: string;
  readonly total: number;
  readonly directories: readonly PathDirectory[];
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
      <Folder className="size-3.5 shrink-0 @max-[8rem]:hidden" aria-hidden />
      <span className="truncate">{label}</span>
      <span className="text-muted-foreground ml-auto tabular-nums @max-[8rem]:hidden">{count}</span>
    </button>
  );
}

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

export interface PathTreeListProps {
  readonly label: string;
  readonly directories: readonly PathDirectory[];
  readonly leaves: readonly PathLeaf[];
  readonly all: {
    readonly total: number;
    readonly active: boolean;
    readonly onSelect: () => void;
  };
  readonly expanded: ReadonlySet<string> | 'all';
  readonly onToggle: (path: string) => void;
  readonly activeDirectory: string | null;
  readonly selected: string | null;
  readonly onSelect: (key: string) => void;
  readonly onPlace: (key: string, origin: DOMRect) => void;
}

export function PathTreeList({
  label,
  directories,
  leaves,
  all,
  expanded,
  onToggle,
  activeDirectory,
  selected,
  onSelect,
  onPlace,
}: PathTreeListProps): React.ReactElement {
  const isOpen = (path: string): boolean => expanded === 'all' || expanded.has(path);
  const rows = visibleTreeRows(pathTreeRows(directories, leaves), isOpen);
  return (
    <nav aria-label={label} className="min-h-0 flex-1 overflow-y-auto p-1">
      <Entry
        label={t('ui.directory.all')}
        count={all.total}
        depth={0}
        active={all.active}
        onClick={all.onSelect}
      />
      {rows.map((row) => {
        const indent = { paddingLeft: TREE_INDENT_BASE + row.depth * TREE_INDENT_STEP };
        if (row.kind === 'directory') {
          const open = isOpen(row.path);
          const Icon = open ? FolderOpen : Folder;
          return (
            <button
              key={`d:${row.path}`}
              type="button"
              className={entry({ active: activeDirectory === row.path })}
              style={indent}
              title={row.path}
              aria-expanded={open}
              onClick={() => onToggle(row.path)}
            >
              <Icon className="size-3.5 shrink-0 @max-[8rem]:hidden" aria-hidden />
              <span className="truncate">{row.label}</span>
              <span className="text-muted-foreground ml-auto tabular-nums @max-[8rem]:hidden">
                {row.count}
              </span>
            </button>
          );
        }
        const onLeafDoubleClick = (event: React.MouseEvent<HTMLButtonElement>): void =>
          onPlace(row.key, event.currentTarget.getBoundingClientRect());
        return (
          <button
            key={`l:${row.key}`}
            type="button"
            className={entry({ active: selected === row.key })}
            style={indent}
            title={row.key}
            aria-pressed={selected === row.key}
            onClick={() => onSelect(row.key)}
            onDoubleClick={onLeafDoubleClick}
            {...textDragProps(row.key)}
          >
            <FileText className="size-3.5 shrink-0 @max-[8rem]:hidden" aria-hidden />
            <span className="truncate">{row.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
