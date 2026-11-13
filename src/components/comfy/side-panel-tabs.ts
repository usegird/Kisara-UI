import type { MessageKey } from '@/i18n';
import type { SidePanelTab } from '@/store/use-side-panel-store';

// ─────────────────────────────
// 右の列のタブの並び。列のタブと、縮めた行のアイコンで同じ順にする。
// ─────────────────────────────

/** 右の列のタブの値と見出しの文言の鍵。この順に並べる */
export const PANELS: readonly { readonly value: SidePanelTab; readonly label: MessageKey }[] = [
  { value: 'queue', label: 'comfy.side.queue' },
  { value: 'history', label: 'comfy.side.history' },
  { value: 'report', label: 'comfy.side.report' },
  { value: 'settings', label: 'comfy.side.settings' },
];
