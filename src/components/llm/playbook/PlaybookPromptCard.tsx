import { useSortable } from '@dnd-kit/sortable';

import { PLAYBOOK_ID } from '@/chat/assemble';
import { CardHeader } from '@/components/llm/prompt/CardHeader';
import { cardRow, type BandJoin } from '@/components/llm/prompt/prompt-card-style';
import { LockMark } from '@/components/llm/prompt/PromptItemCard';
import { sortableStyle } from '@/components/ui/sortable-style';
import { slideKey } from '@/hooks/ui/use-reorder-slide';
import { t } from '@/i18n';

export const PLAYBOOK_KEY = PLAYBOOK_ID;

export interface PlaybookPromptRow {
  readonly summary: string;
  readonly text: string;
  readonly tokens: number | undefined;
}

export function PlaybookPromptCard({
  row,
  open,
  onToggle,
  join,
}: {
  readonly row: PlaybookPromptRow;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly join: BandJoin;
}): React.ReactElement {
  const { setNodeRef, transform, transition } = useSortable({
    id: PLAYBOOK_KEY,
    disabled: { draggable: true, droppable: false },
  });
  return (
    <li
      ref={setNodeRef}
      style={sortableStyle(transform, transition)}
      className={cardRow({ enabled: true, dragging: false, locked: true, ...join })}
      {...slideKey(PLAYBOOK_KEY)}
    >
      <CardHeader
        label={t('llm.playbook.row')}
        position={null}
        tokens={row.tokens}
        summary={row.summary}
        open={open}
        onToggle={onToggle}
        grip={<LockMark />}
      />
      {open ? (
        <pre className="text-muted-foreground px-1 pb-1 font-sans text-xs whitespace-pre-wrap">
          {row.text}
        </pre>
      ) : null}
    </li>
  );
}
