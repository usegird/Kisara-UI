import { cva } from 'class-variance-authority';
import { ArrowDown, ArrowUp, RotateCcw, Trash2 } from 'lucide-react';

import type { PysssssRowDraft } from '@/components/comfy/dialogs/tag-panel-draft';
import type { TagSort, TagSortKey } from '@/components/comfy/dialogs/tag-table-sort';
import { field } from '@/components/ui/field';
import { formatTagPriority } from '@/graph/tag-complete';
import { t, type MessageKey } from '@/i18n';

const ROW_ICON = `text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1
  disabled:opacity-40`;
const HEAD_BUTTON = `text-muted-foreground hover:text-foreground flex items-center gap-0.5 rounded
  px-1 py-1 text-left`;

const TABLE_ROW = `grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_2rem] items-center
  gap-1`;

const cellInput = cva(field({ size: 'sm', width: 'full' }), {
  variants: { struck: { true: 'text-muted-foreground line-through', false: '' } },
});

const cellText = cva('truncate px-1 py-1', {
  variants: {
    struck: { true: 'line-through', false: '' },
    muted: { true: 'text-muted-foreground', false: '' },
  },
});

export interface TagRowDraft {
  readonly id: number;
  readonly tag: string;
  readonly aliases: string;
  readonly priority: string;
  readonly kind: string;
  readonly removed: boolean;
}

export interface TagRowView {
  readonly key: string;
  readonly tag: string;
  readonly aliases: readonly string[];
  readonly priority: number;
}

export interface PysssssRowView {
  readonly key: string;
  readonly row: PysssssRowDraft;
}

export interface TagSortProps {
  readonly sort: TagSort | null;
  readonly onSort: (key: TagSortKey) => void;
}

const SORT_COLUMNS: readonly { readonly key: TagSortKey; readonly label: MessageKey }[] = [
  { key: 'tag', label: 'tags.tag' },
  { key: 'aliases', label: 'tags.aliases' },
  { key: 'priority', label: 'tags.priority' },
];

export function TagTable({
  sort,
  onSort,
  children,
}: TagSortProps & { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div role="table" aria-label={t('tags.list')} className="flex flex-col gap-0.5 text-xs">
      <div role="row" className={TABLE_ROW}>
        {SORT_COLUMNS.map(({ key, label }) => {
          const ascending = sort?.key === key ? sort.ascending : null;
          const Icon = ascending === null ? null : ascending ? ArrowUp : ArrowDown;
          return (
            <span
              key={key}
              role="columnheader"
              aria-sort={ascending === null ? 'none' : ascending ? 'ascending' : 'descending'}
            >
              <button
                type="button"
                className={HEAD_BUTTON}
                title={t('tags.sortTitle', { name: t(label) })}
                onClick={() => onSort(key)}
              >
                {t(label)}
                {Icon === null ? null : <Icon className="size-3" aria-hidden />}
              </button>
            </span>
          );
        })}
        <span role="columnheader" className="sr-only">
          {t('tags.rowActions')}
        </span>
      </div>
      {children}
    </div>
  );
}

interface EditableTableProps extends TagSortProps {
  readonly rows: readonly TagRowDraft[];
  readonly blank: TagRowDraft;
  readonly onChange: (id: number, part: Partial<TagRowDraft>) => void;
  readonly onToggle: (id: number) => void;
}

export function EditableTagTable({
  rows,
  blank,
  onChange,
  onToggle,
  sort,
  onSort,
}: EditableTableProps): React.ReactElement {
  return (
    <TagTable sort={sort} onSort={onSort}>
      {[...rows, blank].map((row) => (
        <div key={row.id} role="row" className={TABLE_ROW}>
          <CellInput
            label={t('tags.tag')}
            value={row.tag}
            struck={row.removed}
            onChange={(tag) => onChange(row.id, { tag })}
          />
          <CellInput
            label={t('tags.aliases')}
            value={row.aliases}
            struck={row.removed}
            onChange={(aliases) => onChange(row.id, { aliases })}
          />
          <CellInput
            label={t('tags.priority')}
            value={row.priority}
            struck={row.removed}
            numeric
            onChange={(priority) => onChange(row.id, { priority })}
          />
          <span role="cell">
            {row.id === blank.id ? null : (
              <ToggleButton removed={row.removed} name={row.tag} onClick={() => onToggle(row.id)} />
            )}
          </span>
        </div>
      ))}
    </TagTable>
  );
}

export function TagRow({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div role="row" className={TABLE_ROW}>
      {children}
    </div>
  );
}

export function TagTextCell({
  struck,
  children,
}: {
  readonly struck: boolean;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <span role="cell" className={cellText({ struck, muted: struck })}>
      {children}
    </span>
  );
}

export function CellInput({
  label,
  value,
  struck,
  numeric = false,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly struck: boolean;
  readonly numeric?: boolean;
  readonly onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <span role="cell">
      <input
        className={cellInput({ struck })}
        aria-label={label}
        value={value}
        readOnly={struck}
        inputMode={numeric ? 'numeric' : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  );
}

interface ReadOnlyTableProps extends TagSortProps {
  readonly rows: readonly TagRowView[];
}

export function ReadOnlyTagTable({ rows, sort, onSort }: ReadOnlyTableProps): React.ReactElement {
  return (
    <TagTable sort={sort} onSort={onSort}>
      {rows.map((row) => (
        <div key={row.key} role="row" className={TABLE_ROW}>
          <span role="cell" className={cellText({ struck: false, muted: false })}>
            {row.tag}
          </span>
          <span role="cell" className={cellText({ struck: false, muted: true })}>
            {row.aliases.join(', ')}
          </span>
          <span role="cell" className={cellText({ struck: false, muted: true })}>
            <span className="tabular-nums">{formatTagPriority(row.priority)}</span>
          </span>
          <span role="cell" />
        </div>
      ))}
    </TagTable>
  );
}

export function ToggleButton({
  removed,
  name,
  onClick,
}: {
  readonly removed: boolean;
  readonly name: string;
  readonly onClick: () => void;
}): React.ReactElement {
  const Icon = removed ? RotateCcw : Trash2;
  return (
    <button
      type="button"
      className={ROW_ICON}
      aria-label={t(removed ? 'tags.restoreRow' : 'tags.removeRow', { name })}
      title={t(removed ? 'tags.restoreRowTitle' : 'tags.removeRowTitle')}
      onClick={onClick}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}
