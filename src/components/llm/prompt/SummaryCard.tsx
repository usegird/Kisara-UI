import { useSortable } from '@dnd-kit/sortable';

import { SUMMARY_ID } from '@/chat/assemble';
import { CardHeader } from '@/components/llm/prompt/CardHeader';
import { ChatSummaryField } from '@/components/llm/prompt/ChatSummaryField';
import { cardRow, type BandJoin } from '@/components/llm/prompt/prompt-card-style';
import { LockMark } from '@/components/llm/prompt/PromptItemCard';
import { sortableStyle } from '@/components/ui/sortable-style';
import { slideKey } from '@/hooks/ui/use-reorder-slide';
import { t } from '@/i18n';

// ─────────────────────────────
// プロンプトのタブのセッション要約の行。
// ─────────────────────────────

/**
 * セッション要約の行の鍵（構成の項目ではない）
 */
export const SUMMARY_KEY = SUMMARY_ID;

/** セッション要約の行に出すもの */
export interface SessionSummaryRow {
  /** 要約で縮めた発言の件数（要約が無ければ 0） */
  readonly count: number;
  /** 送る要約の見積もり。送らなければ undefined */
  readonly tokens: number | undefined;
}

/**
 * セッション要約の行。会話履歴の行のすぐ上に置く。掴めず、落とし先にもしない。
 * 開くと要約の欄を出す
 */
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
    // 掴めない。指せないことは slotCollision で決める（落とし先のまま置いて、行の大きさを測らせる）
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
