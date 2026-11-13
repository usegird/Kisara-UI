import { Menu } from '@base-ui/react/menu';
import { ChevronDown, CircleAlert, Loader2, Repeat, SendHorizontal, Unplug } from 'lucide-react';
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

// ─────────────────────────────
// コントロールパネルの中身（実行と繰り返しの操作）。置き場所を動かす仕組みは外側（`FloatingControl`）が持つ。
// ─────────────────────────────

/** コントロールパネルの受け取り物 */
export interface ControlPanelProps {
  readonly connected: boolean;
  /** 置き場所を動かす取っ手。左端に置く */
  readonly handle?: React.ReactNode;
}

/** 実行を押せない理由。押せるなら null */
function blockedReason(hasWorkflow: boolean, connected: boolean, busy: boolean): string | null {
  if (!hasWorkflow) return t('run.control.blocked.noWorkflow');
  if (!connected) return t('run.control.blocked.notConnected');
  return busy ? t('run.control.blocked.sending') : null;
}

/**
 * 実行のボタンと ▼ の一覧（繰り返し）、失敗があればエラーのタブへ飛ぶアイコンを 1 行に並べる。
 * `POST /prompt` は GPU を消費するので、押されたときだけ呼ぶ。
 * 繰り返しの 2 回目からの送りは右の列の `useRepeatRunDriver` が持つ。
 */
export function ControlPanel({ connected, handle }: ControlPanelProps): React.ReactElement {
  const { run, busy } = useRunWorkflow();
  const hasWorkflow = useGraphStore((state) => state.workflow !== null);

  const status = useExecutionStore((state) => state.status);
  // 失敗があるときだけ、接続のアイコンの右にアイコンを出してエラーのタブへ飛べるようにする
  const errors = useRunReport().errors;
  const showReport = useSidePanelStore((state) => state.setTab);

  const running = status === 'running' || status === 'queued';

  const startRepeat = useStartRepeatRun();
  const activeTabId = useTabsStore((state) => state.activeId);
  // 繰り返しはタブごとに 1 つ。最中のタブでは選べない（別のタブなら足せる）
  const repeating = useRepeatStore((state) => state.jobs.some((job) => job.tabId === activeTabId));
  // ▼ の一覧は実行のボタン（仕切りを含む枠）の左端に揃える
  const runGroup = useRef<HTMLDivElement>(null);

  // 押せないときは**理由を明示**する（黙って無効にしない）。
  // **実行中でもキューに足せる**ので、実行中は無効にしない
  const blocked = blockedReason(hasWorkflow, connected, busy);
  // つないでいなければ「接続」にし、ワークフローが無くても押せる（押すと接続のポップアップ）
  const runBlocked = connected ? blocked : null;
  const label = runLabelOf(connected, running);

  return (
    <div className="bg-card flex items-center gap-1.5 rounded-md border p-1.5 text-2xs shadow-lg">
      {handle}

      {/* 実行のボタンの右端を仕切りで分け、▼ から繰り返し実行を選ぶ。地の色は塗らない */}
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
          // 表示が「実行」のままでも、押した時点でつながっていなければ送らずに接続のポップアップを出す
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
          {/* 幅は長い方（キュー）に揃え、切り替わっても枠が伸び縮みしないようにする */}
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
              // 下に空きがあれば下、無ければ上へ（入り切らない側は自動で反対へ回る）
              side="bottom"
              align="start"
              sideOffset={4}
            >
              <Menu.Popup
                className="bg-popover text-popover-foreground min-w-40 rounded-md border p-1
                  text-2xs shadow-md outline-none"
              >
                <Menu.Item
                  className="data-highlighted:bg-accent data-highlighted:text-accent-foreground
                    flex cursor-default items-center gap-1.5 rounded px-2 py-1 outline-none
                    select-none data-disabled:opacity-50"
                  disabled={repeating}
                  title={repeating ? t('run.control.repeatActive') : t('run.control.repeatHint')}
                  onClick={guardPress('run-repeat', () => void startRepeat(activeTabId))}
                >
                  <Repeat className="size-3.5" aria-hidden />
                  {t('run.control.repeat')}
                </Menu.Item>
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

/** 実行のボタンの文字。つないでいなければ「接続」、実行中なら「キューに足す」 */
function runLabelOf(connected: boolean, running: boolean): string {
  if (!connected) return t('comfy.connection.connect');
  return running ? t('run.control.queue') : t('run.control.run');
}
