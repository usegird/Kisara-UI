import type { MessageKey } from '@/i18n';
import type { SidePanelTab } from '@/store/use-side-panel-store';

export const PANELS: readonly { readonly value: SidePanelTab; readonly label: MessageKey }[] = [
  { value: 'queue', label: 'comfy.side.queue' },
  { value: 'history', label: 'comfy.side.history' },
  { value: 'report', label: 'comfy.side.report' },
  { value: 'settings', label: 'comfy.side.settings' },
];
