import type { Active, Announcements, Over, ScreenReaderInstructions } from '@dnd-kit/core';

import { t } from '@/i18n';
import { isRecord } from '@/lib/guards';

type Entry = Pick<Active, 'id' | 'data'> | Pick<Over, 'id' | 'data'>;

function entryLabelOf(entry: Entry): string {
  const data: unknown = entry.data.current;
  if (isRecord(data)) {
    const { label } = data;
    if (typeof label === 'string' && label.length > 0) return label;
  }
  return t('ui.drag.item');
}

function isSortable(over: Over): boolean {
  const data: unknown = over.data.current;
  return isRecord(data) && 'sortable' in data;
}

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

interface DragAccessibility {
  readonly announcements: Announcements;
  readonly screenReaderInstructions: ScreenReaderInstructions;
}

export function dragAccessibility(): DragAccessibility {
  return {
    announcements,
    screenReaderInstructions: { draggable: t('ui.drag.instructions') },
  };
}

interface DragRoleAttributes {
  readonly roleDescription: string;
}

export function sortableAttributes(): DragRoleAttributes {
  return { roleDescription: t('ui.drag.sortable') };
}

export function draggableAttributes(): DragRoleAttributes {
  return { roleDescription: t('ui.drag.draggable') };
}
