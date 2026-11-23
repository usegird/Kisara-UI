import { useSortable } from '@dnd-kit/sortable';

import { SUMMARY_ID } from '@/chat/assemble';
import { CardHeader } from '@/components/llm/prompt/CardHeader';
import { ChatSummaryField } from '@/components/llm/prompt/ChatSummaryField';
import { cardRow, type BandJoin } from '@/components/llm/prompt/prompt-card-style';
import { LockMark } from '@/components/llm/prompt/PromptItemCard';
import { sortableStyle } from '@/components/ui/sortable-style';
import { slideKey } from '@/hooks/ui/use-reorder-slide';
import { t } from '@/i18n';

export const SUMMARY_KEY = SUMMARY_ID;

export interface SessionSummaryRow {
  readonly count: number;
  readonly tokens: number | undefined;
}

export function SummaryCard({
  chatId,
  row,
  open,
  onToggle,
  join,
}: {
  readonly chatId: string;
  readonly row: SessionSummaryRow;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly join: BandJoin;
}): React.ReactElement {
  const { setNodeRef, transform, transition } = useSortable({
    id: SUMMARY_KEY,
    disabled: { draggable: true, droppable: false },
  });
  return (
    <li
      ref={setNodeRef}
      style={sortableStyle(transform, transition)}
      className={cardRow({ enabled: row.count > 0, dragging: false, locked: true, ...join })}
      {...slideKey(SUMMARY_KEY)}
    >
      <CardHeader
        label={t('llm.prompt.items.chatSummary')}
        position={null}
        tokens={row.tokens}
        summary={t('llm.summary.count', { count: row.count })}
        open={open}
        onToggle={onToggle}
        grip={<LockMark />}
      />
      {open ? <ChatSummaryField chatId={chatId} /> : null}
    </li>
  );
}
