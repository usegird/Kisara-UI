import {
  CalendarClock,
  CalendarPlus,
  CaseSensitive,
  HardDrive,
  type LucideIcon,
} from 'lucide-react';

import type { ModelCardDrag } from '@/components/comfy/flow/dialogs/ModelCard';
import type { ModelInfoPanelProps } from '@/components/comfy/flow/dialogs/ModelInfoPanel';
import { startTextDrag } from '@/components/ui/text-drag';
import type { ModelItem, ModelSortKey } from '@/graph/model-files';
import { t, type MessageKey } from '@/i18n';
import type { DragTextResult } from '@/lib/text-drag-session';

const SELECTED_CARD = '[data-model-card][aria-pressed="true"]';

export const INFO_SIZE = { right: 320, bottom: 280 } as const;

export const SORT_LABELS: ReadonlyArray<{
  readonly key: ModelSortKey;
  readonly label: MessageKey;
  readonly Icon: LucideIcon;
}> = [
  { key: 'name', label: 'modelPicker.sort.name', Icon: CaseSensitive },
  { key: 'modified', label: 'modelPicker.sort.modified', Icon: CalendarClock },
  { key: 'created', label: 'modelPicker.sort.created', Icon: CalendarPlus },
  { key: 'size', label: 'modelPicker.sort.size', Icon: HardDrive },
];

export interface ModelDragText {
  readonly prepare: (value: string) => void;
  readonly peek: (value: string) => DragTextResult | null;
  readonly resolve: (value: string) => Promise<DragTextResult>;
}

export function cardDragOf(
  drag: ModelDragText | undefined,
  select: (value: string) => void,
  notify: (notice: string | null) => void,
): ModelCardDrag | undefined {
  if (drag === undefined) return undefined;
  return {
    onPointerDown: (item) => drag.prepare(item.value),
    onDragStart: (event, item) => {
      const ready = drag.peek(item.value);
      const text = ready !== null && 'text' in ready ? ready.text : null;
      notify(null);
      select(item.value);
      startTextDrag(event, {
        label: text ?? item.label,
        text,
        resolve: () => drag.resolve(item.value),
        onError: notify,
      });
    },
  };
}

export function selectionOnToggle(
  open: boolean,
  value: string,
  selected: string | null,
): string | null {
  if (!open) return selected;
  return value === '' ? null : value;
}

export function findModelItem(items: readonly ModelItem[], value: string | null): ModelItem | null {
  if (value === null) return null;
  return items.find((item) => item.value === value) ?? null;
}

export function insertPropsOf(
  onInsert: ((text: string) => void) | undefined,
  blocked: string | null,
): ModelInfoPanelProps['insert'] {
  return onInsert === undefined ? undefined : { blocked, onInsert };
}

export function failureNotice(notice: string | null): { text: string; failed: true } | null {
  return notice === null ? null : { text: notice, failed: true };
}

export function bottomInsetOf(item: ModelItem | null, dock: string, size: number): number {
  return item === null || dock !== 'bottom' ? 0 : size;
}

export function canDecide(item: ModelItem | null, blocked: string | null): boolean {
  return item !== null && blocked === null;
}

export function leadWidthOf(pinned: boolean, width: number): number | undefined {
  return pinned ? width + 1 : undefined;
}

export function decideTitleOf(
  item: ModelItem | null,
  blocked: string | null,
  use: { readonly mode: 'set' | 'insert'; readonly kind: string },
): string {
  if (item === null) return t('modelPicker.nothingSelected');
  if (blocked !== null) return blocked;
  return use.mode === 'insert'
    ? t('modelPicker.decide.insertTitle', { kind: use.kind })
    : t('modelPicker.decide.title', { name: item.label });
}

export function selectedCardRectIn(grid: HTMLElement | null): DOMRect | null {
  return grid?.querySelector(SELECTED_CARD)?.getBoundingClientRect() ?? null;
}

export function closesInfo(
  target: EventTarget,
  infoArea: HTMLElement | null,
  info: HTMLElement | null,
): boolean {
  if (!(target instanceof Element)) return false;
  const inside = (box: HTMLElement | null): boolean => box?.contains(target) === true;
  return !inside(infoArea) && !inside(info) && target.closest('[role="separator"]') === null;
}

export function previewOf(
  coveredCard: string | null,
  item: ModelItem,
  baseUrl: string,
): ModelInfoPanelProps['preview'] {
  return coveredCard === item.value ? { baseUrl } : undefined;
}
