import { useSortable } from '@dnd-kit/sortable';

import { PLAYBOOK_ID } from '@/chat/assemble';
import { CardHeader } from '@/components/llm/prompt/CardHeader';
import { cardRow, type BandJoin } from '@/components/llm/prompt/prompt-card-style';
import { LockMark } from '@/components/llm/prompt/PromptItemCard';
import { sortableStyle } from '@/components/ui/sortable-style';
import { slideKey } from '@/hooks/ui/use-reorder-slide';
import { t } from '@/i18n';

// ─────────────────────────────
// プロンプトのタブの「プレイブック」の行。構成の項目ではないので掴めず、落とし先にもしない。
// ─────────────────────────────

/**
 * プレイブックの行の鍵（構成の項目ではない）
 */
export const PLAYBOOK_KEY = PLAYBOOK_ID;

/** プレイブックの行に出すもの */
export interface PlaybookPromptRow {
  /** プレイブックの名前と今のフェーズ */
  readonly summary: string;
  /** 送るフェーズの文（置き換えの後） */
  readonly text: string;
  readonly tokens: number | undefined;
}

/** プレイブックの名前と今のフェーズの行。開くと送るフェーズの文を読むだけで出す */
export function PlaybookPromptCard({
  row,
  open,
  onToggle,
  join,
}: {
  readonly row: PlaybookPromptRow;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** 動かせない行の地のつなぎ方 */
  readonly join: BandJoin;
}): React.ReactElement {
  const { setNodeRef, transform, transition } = useSortable({
    id: PLAYBOOK_KEY,
    // 掴めない。指せないことは slotCollision で決める（落とし先のまま置いて、行の大きさを測らせる）
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
