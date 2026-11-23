import { Menu } from '@base-ui/react/menu';
import {
  ChevronDown,
  CircleAlert,
  Loader2,
  Repeat,
  SendHorizontal,
  Square,
  Unplug,
} from 'lucide-react';
import { useRef } from 'react';

import { useStartRepeatRun } from '@/hooks/run/use-repeat-run';
import { useRunReport } from '@/hooks/run/use-run-report';
import { useRunWorkflow } from '@/hooks/run/use-run-workflow';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { useComfyConnectDialogStore } from '@/store/use-comfy-connect-dialog-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useRepeatStore } from '@/store/use-repeat-store';
import { useSidePanelStore } from '@/store/use-side-panel-store';
import { useTabsStore } from '@/store/use-tabs-store';

const MENU_ITEM_CLASS = `data-highlighted:bg-accent data-highlighted:text-accent-foreground flex
  cursor-default items-center gap-1.5 rounded px-2 py-1 outline-none select-none
  data-disabled:opacity-50`;

export interface ControlPanelProps {
  readonly connected: boolean;
  readonly handle?: React.ReactNode;
}

function blockedReason(hasWorkflow: boolean, connected: boolean, busy: boolean): string | null {
  if (!hasWorkflow) return t('run.control.blocked.noWorkflow');
  if (!connected) return t('run.control.blocked.notConnected');
  return busy ? t('run.control.blocked.sending') : null;
}

export function ControlPanel({ connected, handle }: ControlPanelProps): React.ReactElement {
  const { run, busy } = useRunWorkflow();
  const hasWorkflow = useGraphStore((state) => state.workflow !== null);

  const status = useExecutionStore((state) => state.status);
  const errors = useRunReport().errors;
  const showReport = useSidePanelStore((state) => state.setTab);

  const running = status === 'running' || status === 'queued';

  const startRepeat = useStartRepeatRun();
  const activeTabId = useTabsStore((state) => state.activeId);
  const repeating = useRepeatStore((state) => state.jobs.some((job) => job.tabId === activeTabId));
  const stopRepeat = useRepeatStore((state) => state.stop);
  const runGroup = useRef<HTMLDivElement>(null);

  const blocked = blockedReason(hasWorkflow, connected, busy);
  const runBlocked = connected ? blocked : null;
  const label = runLabelOf(connected, running);

  return (
    <div className="bg-card flex items-center gap-1.5 rounded-md border p-1.5 text-2xs shadow-lg">
      {handle}

      <div
        ref={runGroup}
        className="flex items-stretch rounded-md has-[button:disabled]:opacity-50"
      >
        <button
          type="button"
          className="hover:bg-accent inline-flex items-center justify-center gap-1.5 whitespace-nowrap
            rounded-l-md py-1 pr-1.5 pl-2"
          disabled={runBlocked !== null}
          title={
            connected
              ? (blocked ?? (running ? t('run.control.enqueueHint') : t('run.control.runHint')))
              : t('comfy.bar.openConnectTitle')
          }
          onClick={guardPress('run', () => {
            if (useConnectionStore.getState().status === 'connected') void run();
            else useComfyConnectDialogStore.getState().open();
          })}
        >
          {busy ? (
            <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
          ) : connected ? (
            <SendHorizontal className="size-3.5" aria-hidden />
          ) : (
            <Unplug className="text-destructive size-3.5" aria-hidden />
          )}
          <span className="grid">
            <span className="invisible col-start-1 row-start-1" aria-hidden>
              {t('run.control.queue')}
            </span>
            <span className="col-start-1 row-start-1">{label}</span>
          </span>
        </button>

        <Menu.Root>
          <Menu.Trigger
            className="border-border hover:bg-accent inline-flex items-center rounded-r-md
              border-l px-[5px]"
            disabled={blocked !== null}
            aria-label={t('run.control.chooseMethod')}
            title={blocked ?? t('run.control.chooseMethodHint')}
          >
            <ChevronDown className="size-3.5" aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              className="z-50 outline-none"
              anchor={runGroup}
              side="bottom"
              align="start"
              sideOffset={4}
            >
              <Menu.Popup
                className="bg-popover text-popover-foreground min-w-40 rounded-md border p-1
                  text-2xs shadow-md outline-none"
              >
                {repeating ? (
                  <Menu.Item
                    className={MENU_ITEM_CLASS}
                    title={t('queue.repeat.stopHint')}
                    onClick={() => stopRepeat(activeTabId)}
                  >
                    <Square className="size-3.5" aria-hidden />
                    {t('run.control.repeatStop')}
                  </Menu.Item>
                ) : (
                  <Menu.Item
                    className={MENU_ITEM_CLASS}
                    title={t('run.control.repeatHint')}
                    onClick={guardPress('run-repeat', () => startRepeat(activeTabId))}
                  >
                    <Repeat className="size-3.5" aria-hidden />
                    {t('run.control.repeat')}
                  </Menu.Item>
                )}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {errors === 0 ? null : (
        <button
          type="button"
          className="text-destructive hover:bg-destructive/10 inline-flex shrink-0 items-center
            rounded-md p-1"
          aria-label={t('run.control.errors', { count: errors })}
          title={t('run.control.errorsHint')}
          onClick={() => showReport('report')}
        >
          <CircleAlert className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

function runLabelOf(connected: boolean, running: boolean): string {
  if (!connected) return t('comfy.connection.connect');
  return running ? t('run.control.queue') : t('run.control.run');
}
