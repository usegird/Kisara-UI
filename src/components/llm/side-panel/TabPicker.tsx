import { Info } from 'lucide-react';
import { useState } from 'react';

import { WorkflowToolDialog } from '@/components/shared/WorkflowToolDialog';
import { DialogFrame } from '@/components/ui/dialog';
import { dialogButton } from '@/components/ui/dialog-button';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import { SMALL_ICON_BUTTON } from '@/components/ui/small-button';
import { t } from '@/i18n';
import { DIALOG_MIN } from '@/lib/dialog-rect';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import type { ComfyToolTarget } from '@/store/use-settings-store';
import { listToolTabs, type ToolTab } from '@/store/use-workflow-tools-store';

const PICKER_MIN = { width: DIALOG_MIN.width / 2, height: DIALOG_MIN.height };

const PICKER_ICON_BUTTON = `${SMALL_ICON_BUTTON} mt-1.5`;

export function TabPicker({
  baseUrl,
  selected,
  onApply,
  onClose,
}: {
  readonly baseUrl: string;
  readonly selected: readonly ComfyToolTarget[];
  readonly onApply: (shown: readonly ToolTab[], checked: ReadonlySet<string>) => void;
  readonly onClose: () => void;
}): React.ReactElement {
  const [tabs] = useState(() => listToolTabs(baseUrl));
  const [viewing, setViewing] = useState<ToolTab | null>(null);
  const definitions = useDefinitionsStore((state) => state.definitions);
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        tabs
          .filter((tab) => selected.some((target) => target.tabId === tab.tabId))
          .map((tab) => tab.tabId),
      ),
  );

  const toggle = (tabId: string, on: boolean): void => {
    const next = new Set(checked);
    if (on) next.add(tabId);
    else next.delete(tabId);
    setChecked(next);
  };

  return (
    <DialogFrame
      id="chat-workflow-tool-picker"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="narrow"
      movable
      embeddable={false}
      minSize={PICKER_MIN}
      title={t('llm.extension.picker.title')}
    >
      <div className="flex min-h-76 flex-1 flex-col gap-2 p-3">
        <ul className="flex max-h-[60vh] min-h-0 flex-col overflow-auto">
          {tabs.length === 0 ? (
            <li className={EMPTY_NOTICE_CLASS}>{t('llm.extension.picker.none')}</li>
          ) : null}
          {tabs.map((tab) => (
            <li key={tab.tabId} className="flex items-start gap-1">
              <label className="hover:bg-muted flex min-w-0 flex-1 items-start gap-2 rounded px-2 py-1">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked.has(tab.tabId)}
                  onChange={(event) => toggle(tab.tabId, event.target.checked)}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{tab.name}</span>
                  <span className="text-muted-foreground truncate text-xs">{tab.toolName}</span>
                </span>
              </label>
              <button
                type="button"
                className={PICKER_ICON_BUTTON}
                aria-label={t('llm.extension.picker.view', { name: tab.name })}
                title={t('llm.extension.picker.view', { name: tab.name })}
                onClick={() => setViewing(tab)}
              >
                <Info className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <button
            type="button"
            className={dialogButton({ tone: 'primary' })}
            onClick={() => onApply(tabs, checked)}
          >
            {t('llm.extension.picker.ok')}
          </button>
        </div>
      </div>
      {viewing === null ? null : (
        <WorkflowToolDialog
          open
          embeddable={false}
          onClose={() => setViewing(null)}
          workflow={viewing.workflow}
          definitions={definitions}
          workflowName={viewing.name}
          place={{ tabName: viewing.name, tabId: viewing.tabId, path: viewing.path }}
        />
      )}
    </DialogFrame>
  );
}
