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

export interface PysssssTagTableProps extends TagSortProps {
  readonly rows: readonly PysssssRowView[];
  readonly onChange: (row: PysssssRowView, part: Partial<PysssssRowDraft>) => void;
}

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
