import { cva } from 'class-variance-authority';
import { Info, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';

import { DictionaryCard } from '@/components/llm/dictionary/DictionaryCard';
import { SemanticCard } from '@/components/llm/dictionary/SemanticCard';
import { ExpressionCard } from '@/components/llm/expression/ExpressionCard';
import { PlaybookSettingsCard } from '@/components/llm/playbook/PlaybookSettingsCard';
import { CARD_BODY } from '@/components/llm/side-panel/extension-card';
import { TabPicker } from '@/components/llm/side-panel/TabPicker';
import { WorkflowToolDialog } from '@/components/shared/WorkflowToolDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { field } from '@/components/ui/field';
import { SMALL_ICON_BUTTON, smallButton } from '@/components/ui/small-button';
import { t, type MessageKey } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore, type ComfyToolTarget } from '@/store/use-settings-store';
import { useTermsStore } from '@/store/use-terms-store';
import {
  applyToolTabs,
  duplicateTargets,
  useWorkflowToolsStore,
  type LoadedWorkflowTool,
  type WorkflowToolProblem,
} from '@/store/use-workflow-tools-store';

const BUTTON = smallButton({ fade: true });

const TOOL_LIST = 'flex flex-col gap-1';

const GUIDE_FIELD = `${field({ size: 'xs' })} field-sizing-content max-h-60 min-h-16 w-full resize-y`;

const rowStatusText = cva('', {
  variants: { usable: { true: 'text-muted-foreground', false: 'text-destructive' } },
});

const PROBLEM_TEXT: Readonly<Record<WorkflowToolProblem, MessageKey>> = {
  'no-tool': 'llm.extension.problem.noTool',
  'bad-name': 'llm.extension.problem.badName',
  unreadable: 'llm.extension.problem.unreadable',
  'no-definitions': 'llm.extension.problem.noDefinitions',
  'tab-closed': 'llm.extension.problem.tabClosed',
};

export function ChatExtensionPanel(): React.ReactElement {
  return (
    <div className="flex flex-col gap-3 p-2">
      <ComfyToolsCard />
      <DictionaryCard />
      <SemanticCard />
      <ExpressionCard />
      <PlaybookSettingsCard />
    </div>
  );
}

function ComfyToolsCard(): React.ReactElement {
  const enabled = useSettingsStore((state) => state.chatComfyTools);
  const skipConfirm = useSettingsStore((state) => state.chatComfyToolsSkipConfirm);
  const guide = useSettingsStore((state) => state.chatComfyToolsArgGuide);
  const targets = useSettingsStore((state) => state.chatComfyToolTargets);
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const connected = useConnectionStore((state) => state.status === 'connected');
  const entries = useWorkflowToolsStore((state) => state.entries);
  const [picking, setPicking] = useState(false);
  const [askingBypass, setAskingBypass] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const duplicates = duplicateTargets(entries, targets);
  const viewed = targets.find((target) => target.id === viewing);

  return (
    <section className="flex flex-col gap-2 rounded-md border p-2" aria-labelledby="comfy-tools">
      <label className="flex items-center gap-1.5 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => useSettingsStore.getState().setChatComfyTools(event.target.checked)}
        />
        <span id="comfy-tools">{t('llm.extension.comfy.title')}</span>
      </label>
      <div className={CARD_BODY}>
        <p className="text-muted-foreground text-2xs">{t('llm.extension.comfy.hint')}</p>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={skipConfirm}
            onChange={(event) => {
              if (event.target.checked) setAskingBypass(true);
              else useSettingsStore.getState().setChatComfyToolsSkipConfirm(false);
            }}
          />
          {t('llm.extension.comfy.skipConfirm')}
        </label>
        <ul className={TOOL_LIST}>
          {targets.length === 0 ? (
            <li className="text-muted-foreground text-xs">{t('llm.extension.comfy.empty')}</li>
          ) : null}
          {targets.map((target) => (
            <ToolRow
              key={target.id}
              target={target}
              entry={entries[target.id]}
              duplicate={duplicates.has(target.id)}
              onView={() => setViewing(target.id)}
            />
          ))}
        </ul>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={BUTTON} onClick={() => setPicking(true)}>
            {t('llm.extension.comfy.add')}
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={!connected || targets.length === 0}
            title={connected ? undefined : t('llm.place.needComfy')}
            onClick={guardPress(
              'workflow-tools-load',
              () => void useWorkflowToolsStore.getState().refresh(baseUrl),
            )}
          >
            <RefreshCw className="size-3" aria-hidden />
            {t('llm.extension.comfy.refresh')}
          </button>
        </div>
        <label className="flex flex-col gap-1 text-xs">
          {t('llm.extension.comfy.argGuide')}
          <textarea
            className={GUIDE_FIELD}
            value={guide}
            placeholder={t('llm.extension.comfy.argGuidePlaceholder')}
            onChange={(event) =>
              useSettingsStore.getState().setChatComfyToolsArgGuide(event.target.value)
            }
          />
        </label>
      </div>
      <ConfirmDialog
        open={askingBypass}
        title={t('llm.extension.comfy.bypassTitle')}
        description={t('llm.extension.comfy.bypassNotice')}
        confirmLabel={t('llm.extension.comfy.bypassConfirm')}
        onConfirm={() => {
          useTermsStore.getState().acceptBypass();
          useSettingsStore.getState().setChatComfyToolsSkipConfirm(true);
          setAskingBypass(false);
        }}
        onCancel={() => setAskingBypass(false)}
      />
      {picking ? (
        <TabPicker
          baseUrl={baseUrl}
          selected={targets}
          onApply={(shown, checked) => {
            setPicking(false);
            applyToolTabs(baseUrl, shown, checked);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
      {viewed !== undefined ? (
        <ToolDetail target={viewed} entry={entries[viewed.id]} onClose={() => setViewing(null)} />
      ) : null}
    </section>
  );
}

function rowStatus(entry: LoadedWorkflowTool | undefined, duplicate: boolean): string {
  if (entry === undefined) return t(PROBLEM_TEXT['no-definitions']);
  if (entry.kind === 'loading') return t('llm.extension.comfy.loading');
  if (entry.kind === 'problem') return t(PROBLEM_TEXT[entry.problem]);
  if (duplicate) return t('llm.extension.problem.duplicate');
  return entry.tool.name;
}

function targetLabelOf(target: ComfyToolTarget): string {
  return target.name || (target.path ?? '').replace(/\.json$/iu, '');
}

function ToolRow({
  target,
  entry,
  duplicate,
  onView,
}: {
  readonly target: ComfyToolTarget;
  readonly entry: LoadedWorkflowTool | undefined;
  readonly duplicate: boolean;
  readonly onView: () => void;
}): React.ReactElement {
  const usable = entry?.kind === 'ready' && !duplicate;
  const label = targetLabelOf(target);
  return (
    <li className="flex items-start gap-1 text-xs">
      <div className="min-w-0 flex-1">
        <p className="truncate" title={target.path ?? undefined}>
          {label}
        </p>
        <p className={rowStatusText({ usable })}>{rowStatus(entry, duplicate)}</p>
      </div>
      <button
        type="button"
        className={SMALL_ICON_BUTTON}
        disabled={entry?.kind !== 'ready'}
        aria-label={t('llm.extension.comfy.view', { name: label })}
        title={t('llm.extension.comfy.view', { name: label })}
        onClick={onView}
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        className={SMALL_ICON_BUTTON}
        aria-label={t('llm.extension.comfy.remove', { name: label })}
        onClick={() => useSettingsStore.getState().removeChatComfyToolTarget(target.id)}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}

function ToolDetail({
  target,
  entry,
  onClose,
}: {
  readonly target: ComfyToolTarget;
  readonly entry: LoadedWorkflowTool | undefined;
  readonly onClose: () => void;
}): React.ReactElement | null {
  const definitions = useDefinitionsStore((state) => state.definitions);
  if (entry?.kind !== 'ready') return null;
  return (
    <WorkflowToolDialog
      open
      embeddable={false}
      onClose={onClose}
      workflow={entry.workflow}
      definitions={definitions}
      workflowName={entry.tabName ?? targetLabelOf(target)}
      place={{
        tabName: entry.tabName,
        tabId: entry.tabName === null ? null : target.tabId,
        path: target.path,
      }}
    />
  );
}
