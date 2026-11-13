import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import type { LoreEntry } from '@/chat/lore';
import { ENTRY_GRID } from '@/components/llm/dictionary/dictionary-entry-grid';
import { EntryRow } from '@/components/llm/dictionary/EntryRow';
import { MOUSE_ACTIVATION, TOUCH_ACTIVATION } from '@/components/ui/drag-activation';
import { dragAccessibility } from '@/components/ui/drag-announcements';
import { t } from '@/i18n';

// ─────────────────────────────
// 追加辞書のダイアログの項目の一覧。並べ替えは dnd-kit（キーボードでも動く）。
// ─────────────────────────────

/** 見出しの行と項目の行で同じ列（dictionary-entry-grid） */
const GRID = ENTRY_GRID;

/** 一覧に出す 1 項目と、辞書の中の位置 */
interface ShownEntry {
  readonly entry: LoreEntry;
  /** 辞書の中の位置 */
  readonly index: number;
}

/** 追加辞書の項目の一覧の props */
export interface DictionaryEntryListProps {
  readonly shown: readonly ShownEntry[];
  /** 項目を足す・消す・並べ替えるたびに進める（行を作り直し、打ちかけを別の項目に持ち越さない） */
  readonly generation: number;
  readonly expanded: ReadonlySet<number>;
  /** 並べ替えられるか（絞り込んでいる間は取っ手を出さない） */
  readonly sortable: boolean;
  readonly onToggle: (index: number) => void;
  readonly onChange: (index: number, entry: LoreEntry) => void;
  readonly onRemove: (index: number) => void;
  /** 辞書の中の位置 `from` の項目を `to` へ動かす */
  readonly onMove: (from: number, to: number) => void;
  /** 一覧の下に置くもの（ほか N 件・当たる項目が無い） */
  readonly footer?: React.ReactNode;
}

/** 見出しの行と 1 項目 1 行の並び。開いた項目は追加条件と追加内容の段を出す */
export function DictionaryEntryList(props: DictionaryEntryListProps): React.ReactElement {
  const { shown, generation } = props;
  const idOf = (index: number): string => `${generation}:${index}`;
  const ids = shown.map(({ index }) => idOf(index));
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_ACTIVATION),
    useSensor(TouchSensor, TOUCH_ACTIVATION),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (over === null || active.id === over.id) return;
    const from = shown[ids.indexOf(String(active.id))];
    const to = shown[ids.indexOf(String(over.id))];
    if (from !== undefined && to !== undefined) props.onMove(from.index, to.index);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-2 text-xs">
      {/* 見出しの行。アイコンとチェックの列は空 */}
      <div className={`${GRID} text-muted-foreground px-1 pb-1`} aria-hidden>
        <span className="col-start-4">{t('llm.dictionary.trigger')}</span>
        <span>{t('llm.dictionary.probability')}</span>
        <span>{t('llm.dictionary.placement')}</span>
        <span>{t('llm.dictionary.depthValue')}</span>
        <span>{t('llm.dictionary.role')}</span>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={dragAccessibility()}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-0.5">
            {shown.map(({ entry, index }) => (
              <EntryRow
                key={idOf(index)}
                id={idOf(index)}
                entry={entry}
                open={props.expanded.has(index)}
                sortable={props.sortable}
                onToggle={() => props.onToggle(index)}
                onChange={(next) => props.onChange(index, next)}
                onRemove={() => props.onRemove(index)}
              />
            ))}
            {props.footer}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
