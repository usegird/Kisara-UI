import { Menu } from '@base-ui/react/menu';
import { Play, RotateCw, WandSparkles, Workflow } from 'lucide-react';
import { useState } from 'react';

import type { ToolCallRecord, ToolCallRun } from '@/chat/types';
import {
  argumentsToRun,
  detailRun,
  generateTitleOf,
  isPending,
  NO_EDITS,
  reasonOf,
  shownRunOf,
  type ArgumentEdits,
  type ShownRun,
  type ShownRuns,
} from '@/components/llm/message/tool-call-runs';
import {
  disclosure,
  rerunButton,
  rerunIcon,
  stateLine,
} from '@/components/llm/message/tool-call-style';
import { ArgumentList, Generation } from '@/components/llm/message/ToolCallDetails';
import { ToolCallStateText } from '@/components/llm/message/ToolCallStatus';
import { dialogButton } from '@/components/ui/dialog-button';
import { MENU_ITEM_CLASS } from '@/components/ui/menu-item';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import {
  approveToolCall,
  declineToolCall,
  generateToolCall,
  rerunToolCall,
  type GenerateFailure,
} from '@/store/run/workflow-tool-run';
import { useConnectionStore } from '@/store/use-connection-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { activeWorkflowTools, useWorkflowToolsStore } from '@/store/use-workflow-tools-store';

export interface ToolCallListProps {
  readonly chatId: string;
  readonly messageId: string;
  readonly calls: readonly ToolCallRecord[];
  readonly shown: ShownRuns;
  readonly edits: ArgumentEdits;
  readonly onEdit: (callId: string, name: string, value: string) => void;
  readonly onRerun: (callId: string, shown: ShownRun) => void;
}

export function ToolCallList({
  chatId,
  messageId,
  calls,
  shown,
  edits,
  onEdit,
  onRerun,
}: ToolCallListProps): React.ReactElement {
  return (
    <div className="flex w-full flex-col gap-2">
      {calls.map((call) => {
        const onCallEdit = (name: string, value: string): void => onEdit(call.id, name, value);
        const toRun = (): string => argumentsToRun(call, shown, edits);
        const onCallRerun = (): void => onRerun(call.id, shownRunOf(call, shown));
        return (
          <ToolCallCard
            key={call.id}
            chatId={chatId}
            messageId={messageId}
            call={call}
            run={detailRun(call, shown)}
            edits={edits.get(call.id) ?? NO_EDITS}
            onEdit={onCallEdit}
            toRun={toRun}
            onRerun={onCallRerun}
          />
        );
      })}
    </div>
  );
}

function ToolCallCard({
  chatId,
  messageId,
  call,
  run,
  edits,
  onEdit,
  toRun,
  onRerun,
}: {
  readonly chatId: string;
  readonly messageId: string;
  readonly call: ToolCallRecord;
  readonly run: ToolCallRun;
  readonly edits: ReadonlyMap<string, string>;
  readonly onEdit: (name: string, value: string) => void;
  readonly toRun: () => string;
  readonly onRerun: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const { state } = run;
  const failed = state.kind === 'invalid' || state.kind === 'failed';
  const reason = reasonOf(state);
  const detailsId = `tool-call-${messageId}-${call.id}`;
  const onToggleClick = (): void => setOpen(!open);

  return (
    <section
      className="flex w-full flex-col gap-2 text-xs"
      aria-label={t('llm.tool.card', { name: call.name })}
    >
      <div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={stateLine({ failed })}
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={onToggleClick}
          >
            <Play className={disclosure({ open })} aria-hidden />
            <Workflow className="size-3.5 shrink-0" aria-hidden />
            <ToolCallStateText state={state} name={call.name} />
          </button>
          <RerunButton
            chatId={chatId}
            messageId={messageId}
            call={call}
            toRun={toRun}
            onRerun={onRerun}
          />
        </div>
        {open ? (
          <div id={detailsId} className="mt-1 flex flex-col gap-1 border-l-2 pl-2">
            {call.generation === undefined ? null : (
              <Generation chatId={chatId} callId={call.id} generation={call.generation} />
            )}
            {reason === null ? null : <p className={stateLine({ failed })}>{reason}</p>}
            <ArgumentList raw={run.arguments} edits={edits} onEdit={onEdit} />
          </div>
        ) : null}
      </div>
      {call.state.kind === 'waiting' ? (
        <Confirm chatId={chatId} messageId={messageId} callId={call.id} />
      ) : null}
    </section>
  );
}

function RerunButton({
  chatId,
  messageId,
  call,
  toRun,
  onRerun,
}: {
  readonly chatId: string;
  readonly messageId: string;
  readonly call: ToolCallRecord;
  readonly toRun: () => string;
  readonly onRerun: () => void;
}): React.ReactElement {
  const connected = useConnectionStore((state) => state.status === 'connected');
  const busy = isPending(call.state);
  const label = busy ? t('llm.tool.running') : t('llm.tool.runAgain');
  const onRerunClick = guardPress(`tool-rerun:${chatId}/${messageId}/${call.id}`, () => {
    void rerunToolCall(chatId, messageId, call.id, toRun());
    onRerun();
  });
  return (
    <button
      type="button"
      className={rerunButton({ busy })}
      disabled={!connected || busy}
      aria-label={label}
      title={connected || busy ? label : t('llm.tool.notConnected')}
      onClick={onRerunClick}
    >
      <RotateCw className={rerunIcon({ busy })} aria-hidden />
    </button>
  );
}

function Confirm({
  chatId,
  messageId,
  callId,
}: {
  readonly chatId: string;
  readonly messageId: string;
  readonly callId: string;
}): React.ReactElement {
  const connected = useConnectionStore((state) => state.status === 'connected');
  const onRunClick = (): void => void approveToolCall(chatId, messageId, callId);
  const onDeclineClick = (): void => declineToolCall(chatId, messageId, callId);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={dialogButton({ tone: 'primary' })}
        disabled={!connected}
        title={connected ? undefined : t('llm.tool.notConnected')}
        onClick={onRunClick}
      >
        {t('llm.tool.run')}
      </button>
      <button
        type="button"
        className={dialogButton({ tone: 'secondary' })}
        onClick={onDeclineClick}
      >
        {t('llm.tool.decline')}
      </button>
    </div>
  );
}

export interface WorkflowRunMenuProps {
  readonly chatId: string;
  readonly messageId: string;
  readonly className: string;
  readonly disabled: boolean;
  readonly onStart: (name: string) => void;
  readonly onEnd: (failure: GenerateFailure | null) => void;
}

export function WorkflowRunMenu({
  chatId,
  messageId,
  className,
  disabled,
  onStart,
  onEnd,
}: WorkflowRunMenuProps): React.ReactElement {
  const connected = useConnectionStore((state) => state.status === 'connected');
  const toolsOn = useSettingsStore((state) => state.chatComfyTools);
  const targets = useSettingsStore((state) => state.chatComfyToolTargets);
  const entries = useWorkflowToolsStore((state) => state.entries);
  const names = toolsOn ? activeWorkflowTools(entries, targets).map((item) => item.tool.name) : [];
  const label = t('llm.tool.generate');
  const title = generateTitleOf(connected, names.length, label);
  const run = (name: string): void => {
    onStart(name);
    void generateToolCall(chatId, messageId, name).then(onEnd);
  };
  return (
    <Menu.Root>
      <Menu.Trigger
        className={className}
        disabled={disabled || !connected || names.length === 0}
        aria-label={label}
        title={title}
      >
        <WandSparkles className="size-3.5" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50 outline-none" side="bottom" align="end" sideOffset={4}>
          <Menu.Popup className="bg-popover text-popover-foreground rounded-md border p-1 text-xs shadow-md">
            {names.map((name) => {
              const onItemClick = guardPress(`tool-generate:${chatId}/${messageId}`, () =>
                run(name),
              );
              return (
                <Menu.Item key={name} className={MENU_ITEM_CLASS} onClick={onItemClick}>
                  {name}
                </Menu.Item>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
