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

// ─────────────────────────────
// LLM からの呼び出し設定。ワークフローの `extra.kisara.tool` を見せる・直す。両方の種別の層から
// 開くので種別の層の外に置き、データと書き込みは呼び出し側が渡す。打ちかけの値はダイアログの中だけで持つ。
// ─────────────────────────────

/** 呼び出し設定のダイアログの props */
export interface WorkflowToolDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workflow: Workflow;
  readonly definitions: NodeDefinitionMap;
  /** タブのワークフローの名前（機能名の欄の placeholder） */
  readonly workflowName: string;
  readonly place: WorkflowToolPlace;
  /** 渡せば直せる。無ければ読み取り専用 */
  readonly onSave?: ((tool: WorkflowTool | null) => void) | undefined;
  /** 埋め込みを持つか（既定は持つ）。嵌める列の無い会話のタブから開くときは false */
  readonly embeddable?: boolean | undefined;
  /**
   * 外から閉じる確認を求められたか（直しかけがあるまま、開いたアイコンを押し直した）。
   * 直しかけが無いときは、呼び出し側がそのまま閉じる（`onDirtyChange` で知る）
   */
  readonly closeRequested?: boolean | undefined;
  /** 確かめて閉じるのをやめた（`closeRequested` を下ろす） */
  readonly onCloseCanceled?: (() => void) | undefined;
  /** 直しかけがあるかが変わった */
  readonly onDirtyChange?: ((dirty: boolean) => void) | undefined;
}

/**
 * 呼び出し設定のダイアログ。無効（ミュート・バイパス）か線の無いノードの欄は出さないが、既に設定して
 * あれば保存しても残す（送らないだけ）。直しかけがあるまま閉じるときは確かめ、保存・リセットでは確かめない
 */
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
  // 直しかけがあるか（中身が知らせる）と、閉じる前の確認を出しているか
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
  // 直しかけがあれば、閉じる前に確かめる
  const onFrameOpenChange = (next: boolean): void => {
    if (next) return;
    if (dirty) setConfirmingClose(true);
    else close();
  };
  return (
    <DialogFrame
      id="workflow-tool"
      // 差し込みのアイコンの画面と同じく、列の上に埋め込んで出す。
      // 埋め込む先の無い会話のタブでは自由移動で出る
      defaultMode="embedded"
      movable
      embeddable={embeddable}
      open={open}
      onOpenChange={onFrameOpenChange}
      size="md"
      title={t('comfy.tool.title')}
    >
      {/* 開くたびにワークフローの今の定義から始めるので、中身は開いている間だけ置く */}
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

/**
 * 本体。段と段の間はほかのダイアログ（gap-3）の 1.5 倍。入り切らなければ本体だけを送る。
 * 読み取り専用では、欄の値と選んだ出力ノードの名前を薄い色で出す
 */
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
  /** 直しかけがあるかを知らせる（打つたびに。閉じる前の確認に使う） */
  readonly onDirty: (dirty: boolean) => void;
  readonly onDone: () => void;
}): React.ReactElement {
  const existing = readWorkflowTool(workflow);
  const [draft, setDraftState] = useState(() => draftOf(existing));
  const readOnly = onSave === undefined;
  // 読み取り専用では、引数名を設定していない欄を出さない
  const rows = paramRows(workflow, definitions);
  const shownRows = readOnly
    ? rows.filter((row) => (draft.params[keyOf(row.nodeId, row.input)]?.name ?? '') !== '')
    : rows;
  const labels = cardLabels(workflow, definitions);
  const hidden = hiddenParams(workflow, existing);
  const tool = toolOf(draft, rows, hidden);
  const problem = problemOf(tool, hidden);
  // 名前を打つ前から理由を出さない（保存は押せないまま）
  const shownProblem = readOnly || draft.name.trim().length === 0 ? null : problem;
  // 直しかけは、書く定義が開いたときの定義と変わったか（読み取り専用では打てない）
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
      {/* どのタブ・どのファイルの設定かは、説明の次に出す */}
      <PlaceInfo place={place} />
      <OutputChoice
        nodes={outputNodes(workflow, definitions)}
        labels={labels}
        value={draft.outputs}
        readOnly={readOnly}
        onChange={(outputs) => setDraft({ ...draft, outputs })}
      />
      <fieldset className="flex flex-col gap-3">
        {/* 見出しの下も引数どうしの間（gap-3）と同じだけ空ける */}
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
