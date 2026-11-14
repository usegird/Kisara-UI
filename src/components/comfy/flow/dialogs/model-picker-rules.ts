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

// ─────────────────────────────
// モデルを選ぶダイアログの決まり。選ぶカード・決定の可否と説明・押した所で閉じるもの・掴んで落とす文字を
// 値から導く（状態は持たず、ダイアログが結果を使う）。
// ─────────────────────────────

/** 選んでいるカード（押したカードの無い決定で、札を飛ばす起点） */
const SELECTED_CARD = '[data-model-card][aria-pressed="true"]';

/** 情報の列の既定の大きさ（右なら幅、下なら高さ） */
export const INFO_SIZE = { right: 320, bottom: 280 } as const;

/** 並び替えの選択肢 */
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

/**
 * 掴んで落とす文字（ブラウザの文字のドラッグ）。入れる文字は落とされた時に作る（`resolve`）。
 * 押した時点で作り始め（`prepare`）、作り終えていれば掴んだ時点の文字（`peek`）も載せる
 */
export interface ModelDragText {
  readonly prepare: (value: string) => void;
  readonly peek: (value: string) => DragTextResult | null;
  readonly resolve: (value: string) => Promise<DragTextResult>;
}

/** 掴むのは待たせない。入れる文字は落とされた時に作り、作れなければ理由を出す */
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

/** 開け閉てしたときに選ぶカード。開いたらいまの値（空なら選ばない）、閉じたらそのまま */
export function selectionOnToggle(
  open: boolean,
  value: string,
  selected: string | null,
): string | null {
  if (!open) return selected;
  return value === '' ? null : value;
}

/** 選んでいるカードの項目。選んでいない・一覧に無ければ null */
export function findModelItem(items: readonly ModelItem[], value: string | null): ModelItem | null {
  if (value === null) return null;
  return items.find((item) => item.value === value) ?? null;
}

/** 情報の語・メモの取り込み。外の欄へ入れる手続きを渡されたときだけ */
export function insertPropsOf(
  onInsert: ((text: string) => void) | undefined,
  blocked: string | null,
): ModelInfoPanelProps['insert'] {
  return onInsert === undefined ? undefined : { blocked, onInsert };
}

/** 帯に出す知らせ。断られた理由は失敗の色で出す */
export function failureNotice(notice: string | null): { text: string; failed: true } | null {
  return notice === null ? null : { text: notice, failed: true };
}

/** 下に重ねた情報の高さだけ格子の末尾を伸ばす。情報を出していない・右に置いているなら伸ばさない */
export function bottomInsetOf(item: ModelItem | null, dock: string, size: number): number {
  return item === null || dock !== 'bottom' ? 0 : size;
}

/** 決定を押せるか（選んでいて、断る理由が無い） */
export function canDecide(item: ModelItem | null, blocked: string | null): boolean {
  return item !== null && blocked === null;
}

/** ピン止めした左の列と境目の線（1px）の幅。帯の絞り込みを本体の列の左端から始める */
export function leadWidthOf(pinned: boolean, width: number): number | undefined {
  return pinned ? width + 1 : undefined;
}

/** 決定のボタンの説明。選んでいなければその旨、押せなければその理由 */
export function decideTitleOf(item: ModelItem | null, blocked: string | null): string {
  if (item === null) return t('modelPicker.nothingSelected');
  return blocked ?? t('modelPicker.decide.title', { name: item.label });
}

/**
 * 格子の中の選んでいるカードの場所（入れた位置まで札を飛ばす起点）。決めたその場で 1 回だけ読み、持たない。
 * 選んでいるカードが描かれていなければ null
 */
export function selectedCardRectIn(grid: HTMLElement | null): DOMRect | null {
  return grid?.querySelector(SELECTED_CARD)?.getBoundingClientRect() ?? null;
}

/** 押した所で情報を隠すか。格子と情報の外（列の境目を除く） */
export function closesInfo(
  target: EventTarget,
  infoArea: HTMLElement | null,
  info: HTMLElement | null,
): boolean {
  if (!(target instanceof Element)) return false;
  const inside = (box: HTMLElement | null): boolean => box?.contains(target) === true;
  return !inside(infoArea) && !inside(info) && target.closest('[role="separator"]') === null;
}
