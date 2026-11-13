import type { Active, Announcements, Over, ScreenReaderInstructions } from '@dnd-kit/core';

import { t } from '@/i18n';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// 並べ替え・結線のドラッグで読み上げに渡す文言。dnd-kit の既定は英語で、id をそのまま読むので
// 差し替える。名前は掴むもの・落とす先の `data` の `label` から引く（id から引き直さない）
// ─────────────────────────────

type Entry = Pick<Active, 'id' | 'data'> | Pick<Over, 'id' | 'data'>;

function entryLabelOf(entry: Entry): string {
  const data: unknown = entry.data.current;
  if (isRecord(data)) {
    const { label } = data;
    if (typeof label === 'string' && label.length > 0) return label;
  }
  return t('ui.drag.item');
}

/** 並べ替えの相手か（`useSortable` の data には `sortable` が入る） */
function isSortable(over: Over): boolean {
  const data: unknown = over.data.current;
  return isRecord(data) && 'sortable' in data;
}

/**
 * 掴んだものが元の位置から離れたか。並べ替えでは掴んだ直後に自分の上に来たと知らされるので、
 * 離れるまでは黙る（「掴みました」を上書きしない）。ドラッグは同時に 1 つなので 1 つで持つ
 */
let leftHome = false;

const announcements: Announcements = {
  onDragStart: ({ active }) => {
    leftHome = false;
    return t('ui.drag.start', { name: entryLabelOf(active) });
  },
  onDragOver: ({ active, over }) => {
    const name = entryLabelOf(active);
    if (over?.id === active.id) return leftHome ? t('ui.drag.overHome', { name }) : undefined;
    leftHome = true;
    if (over === null) return t('ui.drag.overNone', { name });
    const target = entryLabelOf(over);
    return t(isSortable(over) ? 'ui.drag.overSort' : 'ui.drag.overDrop', { name, target });
  },
  onDragEnd: ({ active, over }) => {
    const name = entryLabelOf(active);
    if (over === null) return t('ui.drag.endNone', { name });
    if (over.id === active.id) return t('ui.drag.endHome', { name });
    const target = entryLabelOf(over);
    return t(isSortable(over) ? 'ui.drag.endSort' : 'ui.drag.endDrop', { name, target });
  },
  onDragCancel: ({ active }) => t('ui.drag.cancel', { name: entryLabelOf(active) }),
};

/** `DndContext` の `accessibility` に渡す読み上げの文言と案内 */
interface DragAccessibility {
  readonly announcements: Announcements;
  readonly screenReaderInstructions: ScreenReaderInstructions;
}

/**
 * `DndContext` の `accessibility` に渡すもの。言語は描く前に決まるので、描くときに引く
 * （読み込んだ時点ではまだ英語のため、定数にしない）
 */
export function dragAccessibility(): DragAccessibility {
  return {
    announcements,
    screenReaderInstructions: { draggable: t('ui.drag.instructions') },
  };
}

/** 取っ手の役割の名前（`aria-roledescription`）。dnd-kit の既定は英語なので差し替える */
interface DragRoleAttributes {
  readonly roleDescription: string;
}

/** 並べ替えの取っ手。`useSortable` の `attributes` に渡す */
export function sortableAttributes(): DragRoleAttributes {
  return { roleDescription: t('ui.drag.sortable') };
}

/** 動かす・結線する取っ手。`useDraggable` の `attributes` に渡す */
export function draggableAttributes(): DragRoleAttributes {
  return { roleDescription: t('ui.drag.draggable') };
}
