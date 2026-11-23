import { cva } from 'class-variance-authority';
import { useState } from 'react';

import {
  draftOf,
  EMPTY_PARAM,
  hiddenParams,
  keyOf,
  paramRows,
  problemOf,
  toolOf,
  type Draft,
  type ParamDraft,
  type ParamRow,
} from '@/components/shared/workflow-tool-draft';
import {
  OutputChoice,
  ParamFields,
  PlaceInfo,
  type WorkflowToolPlace,
} from '@/components/shared/WorkflowToolFields';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DialogFrame } from '@/components/ui/dialog';
import { dialogButton } from '@/components/ui/dialog-button';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import { field } from '@/components/ui/field';
import { cardLabels } from '@/graph/rows';
import type { NodeDefinitionMap, Workflow } from '@/graph/types';
import { outputNodes, readWorkflowTool, type WorkflowTool } from '@/graph/workflow-tool';
import { t } from '@/i18n';

export interface WorkflowToolDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workflow: Workflow;
  readonly definitions: NodeDefinitionMap;
  readonly workflowName: string;
  readonly place: WorkflowToolPlace;
  readonly onSave?: ((tool: WorkflowTool | null) => void) | undefined;
  readonly embeddable?: boolean | undefined;
  readonly closeRequested?: boolean | undefined;
  readonly onCloseCanceled?: (() => void) | undefined;
  readonly onDirtyChange?: ((dirty: boolean) => void) | undefined;
}

export function WorkflowToolDialog({
  open,
  onClose,
  workflow,
  definitions,
  workflowName,
  place,
  onSave,
  embeddable = true,
  closeRequested = false,
  onCloseCanceled,
  onDirtyChange,
}: WorkflowToolDialogProps): React.ReactElement {
  const [dirty, setDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const close = (): void => {
    setDirty(false);
    setConfirmingClose(false);
    onClose();
  };
  const reportDirty = (next: boolean): void => {
    setDirty(next);
    onDirtyChange?.(next);
  };
  const cancelClose = (): void => {
    setConfirmingClose(false);
    onCloseCanceled?.();
  };
  const onFrameOpenChange = (next: boolean): void => {
    if (next) return;
    if (dirty) setConfirmingClose(true);
    else close();
  };
  return (
    <DialogFrame
      id="workflow-tool"
      defaultMode="embedded"
      movable
      embeddable={embeddable}
      open={open}
      onOpenChange={onFrameOpenChange}
      size="md"
      title={t('comfy.tool.title')}
    >
      {open ? (
        <ToolForm
          workflow={workflow}
          definitions={definitions}
          workflowName={workflowName}
          place={place}
          onSave={onSave}
          onDirty={reportDirty}
          onDone={close}
        />
      ) : null}
      <ConfirmDialog
        open={confirmingClose || closeRequested}
        title={t('common.unsaved.title')}
        description={t('common.unsaved.close')}
        confirmLabel={t('common.ok')}
        onConfirm={close}
        onCancel={cancelClose}
      />
    </DialogFrame>
  );
}

const toolForm = cva('flex min-h-0 flex-1 flex-col gap-4.5 overflow-auto p-4 pt-3', {
  variants: {
    readOnly: {
      true: [
        '[&_:is(input,textarea,select)]:text-muted-foreground',
        '[&_fieldset_label]:text-muted-foreground',
      ],
      false: '',
    },
  },
});

function ToolForm({
  workflow,
  definitions,
  workflowName,
  place,
  onSave,
  onDirty,
  onDone,
}: {
  readonly workflow: Workflow;
  readonly definitions: NodeDefinitionMap;
  readonly workflowName: string;
  readonly place: WorkflowToolPlace;
  readonly onSave: ((tool: WorkflowTool | null) => void) | undefined;
  readonly onDirty: (dirty: boolean) => void;
  readonly onDone: () => void;
}): React.ReactElement {
  const existing = readWorkflowTool(workflow);
  const [draft, setDraftState] = useState(() => draftOf(existing));
  const readOnly = onSave === undefined;
  const rows = paramRows(workflow, definitions);
  const shownRows = readOnly
    ? rows.filter((row) => (draft.params[keyOf(row.nodeId, row.input)]?.name ?? '') !== '')
    : rows;
  const labels = cardLabels(workflow, definitions);
  const hidden = hiddenParams(workflow, existing);
  const tool = toolOf(draft, rows, hidden);
  const problem = problemOf(tool, hidden);
  const shownProblem = readOnly || draft.name.trim().length === 0 ? null : problem;
  const setDraft = (next: Draft): void => {
    setDraftState(next);
    const before = toolOf(draftOf(existing), rows, hidden);
    onDirty(JSON.stringify(toolOf(next, rows, hidden)) !== JSON.stringify(before));
  };

  const setParam = (row: ParamRow, patch: Partial<ParamDraft>): void => {
    const key = keyOf(row.nodeId, row.input);
    const current = draft.params[key] ?? EMPTY_PARAM;
    setDraft({ ...draft, params: { ...draft.params, [key]: { ...current, ...patch } } });
  };

  const onFormSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (onSave === undefined || problem !== null) return;
    onSave(tool);
    onDone();
  };
  const onResetClick = (): void => {
    onSave?.(null);
    onDone();
  };

  return (
    <form className={toolForm({ readOnly })} onSubmit={onFormSubmit}>
      <label className="flex flex-col gap-1 text-sm">
        {t('comfy.tool.name')}
        <input
          className={field({ size: 'sm', width: 'full' })}
          value={draft.name}
          readOnly={readOnly}
          placeholder={workflowName}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('comfy.tool.purpose')}
        <textarea
          className={field({ size: 'sm', width: 'full' })}
          rows={2}
          readOnly={readOnly}
          placeholder={t('comfy.tool.purposePlaceholder')}
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
      </label>
      <PlaceInfo place={place} />
      <OutputChoice
        nodes={outputNodes(workflow, definitions)}
        labels={labels}
        value={draft.outputs}
        readOnly={readOnly}
        onChange={(outputs) => setDraft({ ...draft, outputs })}
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm">{t('comfy.tool.params')}</legend>
        {shownRows.length === 0 ? (
          <p className={EMPTY_NOTICE_CLASS}>
            {t(rows.length === 0 ? 'comfy.tool.noInputs' : 'comfy.tool.noParams')}
          </p>
        ) : null}
        {shownRows.map((row) => (
          <ParamFields
            key={keyOf(row.nodeId, row.input)}
            row={row}
            value={draft.params[keyOf(row.nodeId, row.input)] ?? EMPTY_PARAM}
            readOnly={readOnly}
            onChange={(patch) => setParam(row, patch)}
          />
        ))}
      </fieldset>
      {shownProblem !== null ? (
        <p role="alert" className="text-destructive text-xs">
          {shownProblem}
        </p>
      ) : null}
      {onSave === undefined ? null : (
        <div className="flex justify-between gap-2">
          <button
            type="button"
            className={dialogButton({ tone: 'secondary' })}
            disabled={existing === null}
            onClick={onResetClick}
          >
            {t('comfy.tool.reset')}
          </button>
          <button
            type="submit"
            className={dialogButton({ tone: 'primary' })}
            disabled={problem !== null}
          >
            {t('comfy.tool.save')}
          </button>
        </div>
      )}
    </form>
  );
}
