import type { PysssssRowDraft } from '@/components/comfy/dialogs/tag-panel-draft';
import {
  CellInput,
  TagRow,
  TagTable,
  TagTextCell,
  ToggleButton,
  type PysssssRowView,
  type TagSortProps,
} from '@/components/comfy/dialogs/TagPanelParts';
import { t } from '@/i18n';

// ─────────────────────────────
// pysssss の表。タグは直せず、別名・優先度を直し、行の右端で消す・戻す（どれも上書きとして書く）。
// ─────────────────────────────

/** pysssss の表の props */
export interface PysssssTagTableProps extends TagSortProps {
  readonly rows: readonly PysssssRowView[];
  /** 行を直す（消す印の付け外しを含む） */
  readonly onChange: (row: PysssssRowView, part: Partial<PysssssRowDraft>) => void;
}

/** pysssss の表。消した行は取り消し線を引いて読むだけにする */
export function PysssssTagTable({
  rows,
  onChange,
  sort,
  onSort,
}: PysssssTagTableProps): React.ReactElement {
  return (
    <TagTable sort={sort} onSort={onSort}>
      {rows.map((view) => {
        const { row } = view;
        return (
          <TagRow key={view.key}>
            <TagTextCell struck={row.removed}>{row.tag}</TagTextCell>
            <CellInput
              label={t('tags.aliases')}
              value={row.aliases}
              struck={row.removed}
              onChange={(aliases) => onChange(view, { aliases })}
            />
            <CellInput
              label={t('tags.priority')}
              value={row.priority}
              struck={row.removed}
              numeric
              onChange={(priority) => onChange(view, { priority })}
            />
            <span role="cell">
              <ToggleButton
                removed={row.removed}
                name={row.tag}
                onClick={() => onChange(view, { removed: !row.removed })}
              />
            </span>
          </TagRow>
        );
      })}
    </TagTable>
  );
}
