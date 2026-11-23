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

const GRID = ENTRY_GRID;

interface ShownEntry {
  readonly entry: LoreEntry;
  readonly index: number;
}

export interface DictionaryEntryListProps {
  readonly shown: readonly ShownEntry[];
  readonly generation: number;
  readonly expanded: ReadonlySet<number>;
  readonly sortable: boolean;
  readonly onToggle: (index: number) => void;
  readonly onChange: (index: number, entry: LoreEntry) => void;
  readonly onRemove: (index: number) => void;
  readonly onMove: (from: number, to: number) => void;
  readonly footer?: React.ReactNode;
}

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
