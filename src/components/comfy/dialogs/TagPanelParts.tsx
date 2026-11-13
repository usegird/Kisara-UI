import { cva } from 'class-variance-authority';
import { ArrowDown, ArrowUp, RotateCcw, Trash2 } from 'lucide-react';

import type { PysssssRowDraft } from '@/components/comfy/dialogs/tag-panel-draft';
import type { TagSort, TagSortKey } from '@/components/comfy/dialogs/tag-table-sort';
import { field } from '@/components/ui/field';
import { formatTagPriority } from '@/graph/tag-complete';
import { t, type MessageKey } from '@/i18n';

// ─────────────────────────────
// タグ辞書の画面の右の列の表（タグ・別名・優先度と行の右端のアイコン）。直しかけは親が持つ。
// ─────────────────────────────

const ROW_ICON = `text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1
  disabled:opacity-40`;
/** 見出しの並べ替えのボタン */
const HEAD_BUTTON = `text-muted-foreground hover:text-foreground flex items-center gap-0.5 rounded
  px-1 py-1 text-left`;

/** 表の列の幅（タグ・別名・優先度・アイコン） */
const TABLE_ROW = `grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_2rem] items-center
  gap-1`;

/** 直せる表の欄。消す印の行は取り消し線を引いて薄くする */
const cellInput = cva(field({ size: 'sm', width: 'full' }), {
  variants: { struck: { true: 'text-muted-foreground line-through', false: '' } },
});

/** 読むだけの表の文字。消す印・消した印の行は取り消し線を引く */
const cellText = cva('truncate px-1 py-1', {
  variants: {
    struck: { true: 'line-through', false: '' },
    muted: { true: 'text-muted-foreground', false: '' },
  },
});

/** 直せる表の 1 行。欄の文字のまま持ち、確定のときに行へ直す */
export interface TagRowDraft {
  readonly id: number;
  readonly tag: string;
  readonly aliases: string;
  readonly priority: string;
  /** 種別は表に出さず、読んだ値を書くときに戻す */
  readonly kind: string;
  /** 消す印。確定でこの行を外す */
  readonly removed: boolean;
}

/** 読むだけの表の 1 行 */
export interface TagRowView {
  readonly key: string;
  readonly tag: string;
  readonly aliases: readonly string[];
  readonly priority: number;
  /** 取り消し線を引くか（消した印・消す印の辞書） */
  readonly struck: boolean;
}

/** pysssss の表の 1 行。鍵はタグの鍵 */
export interface PysssssRowView {
  readonly key: string;
  readonly row: PysssssRowDraft;
}

/** 見出しで選ぶ並べ替えと、その切り替え */
export interface TagSortProps {
  readonly sort: TagSort | null;
  readonly onSort: (key: TagSortKey) => void;
}

const SORT_COLUMNS: readonly { readonly key: TagSortKey; readonly label: MessageKey }[] = [
  { key: 'tag', label: 'tags.tag' },
  { key: 'aliases', label: 'tags.aliases' },
  { key: 'priority', label: 'tags.priority' },
];

/** 表の見出しの行と、行を包む入れ物。見出しを押すとその列で並べ替える */
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
  /** 最下行の空の行（タグを入れると行が足される） */
  readonly blank: TagRowDraft;
  readonly onChange: (id: number, part: Partial<TagRowDraft>) => void;
  /** 行に消す印を付ける・外す */
  readonly onToggle: (id: number) => void;
}

/** 直せる表。欄をそのまま直し、最下行は常に空のタグ行。消す印の行は取り消し線で読むだけにする */
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

/** 表の 1 行の入れ物（列の幅を揃える） */
export function TagRow({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div role="row" className={TABLE_ROW}>
      {children}
    </div>
  );
}

/** 読むだけの文字の欄。消した行は取り消し線を引いて薄くする */
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

/** 直せる欄 1 つ */
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

/** 読むだけの表（すべて・消す印の辞書） */
export function ReadOnlyTagTable({ rows, sort, onSort }: ReadOnlyTableProps): React.ReactElement {
  return (
    <TagTable sort={sort} onSort={onSort}>
      {rows.map((row) => (
        <div key={row.key} role="row" className={TABLE_ROW}>
          <span role="cell" className={cellText({ struck: row.struck, muted: row.struck })}>
            {row.tag}
          </span>
          <span role="cell" className={cellText({ struck: row.struck, muted: true })}>
            {row.aliases.join(', ')}
          </span>
          <span role="cell" className={cellText({ struck: row.struck, muted: true })}>
            <span className="tabular-nums">{formatTagPriority(row.priority)}</span>
          </span>
          <span role="cell" />
        </div>
      ))}
    </TagTable>
  );
}

/** 行の右端のアイコン。消す印が無ければ削除、あれば戻す */
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
