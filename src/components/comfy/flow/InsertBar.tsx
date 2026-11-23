import { cva } from 'class-variance-authority';
import { BookSearch, Bot, Brush, SquareAsterisk, WholeWord, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import { ModelPickerDialog } from '@/components/comfy/flow/dialogs/ModelPickerDialog';
import type { WorkflowToolDialogProps } from '@/components/comfy/flow/dialogs/WorkflowToolDialog';
import { InsertCaretMarker } from '@/components/ui/insert-caret-marker';
import { lazyPart } from '@/components/ui/lazy-part';
import { LORA_FOLDER } from '@/graph/model-files';
import { isToolName, readWorkflowTool } from '@/graph/workflow-tool';
import { useInsertSources, type SourceState } from '@/hooks/flow/use-insert-sources';
import { useLoraInsert } from '@/hooks/flow/use-lora-insert';
import { useTextDropCaret } from '@/hooks/ui/use-text-drop-caret';
import { t } from '@/i18n';
import { useGraphStore } from '@/store/use-graph-store';
import { useStylesStore } from '@/store/use-styles-store';
import { useTagsStore } from '@/store/use-tags-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

const WorkflowToolDialog = lazyPart<WorkflowToolDialogProps>(
  'insertBar.tool.label',
  () =>
    import('@/components/comfy/flow/dialogs/WorkflowToolDialog').then((m) => m.WorkflowToolDialog),
  () => null,
);

const toolIcon = cva('size-4', { variants: { set: { true: 'text-success', false: '' } } });

const ICON_BUTTON = `text-muted-foreground hover:bg-muted hover:text-foreground relative rounded-md
  p-1 disabled:opacity-40 disabled:hover:bg-transparent`;

function SourceIcon({
  icon: Icon,
  source,
}: {
  readonly icon: LucideIcon;
  readonly source: SourceState;
}): React.ReactElement {
  return (
    <>
      <Icon className="size-4" aria-hidden />
      {source.kind === 'unavailable' ? (
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 h-[1.5px] w-5 -translate-x-1/2 -translate-y-1/2
            -rotate-45 bg-current"
        />
      ) : null}
    </>
  );
}

function keepCaret(event: React.MouseEvent): void {
  event.preventDefault();
}

export function InsertBar(): React.ReactElement {
  const lora = useLoraInsert();
  useTextDropCaret();
  const loraOpen = lora.open;
  const setLoraOpen = lora.setOpen;

  const sources = useInsertSources();
  const firstStyle = useStylesStore((state) => state.table.styles[0]?.name ?? null);
  const openStyleEditor = useStylesStore((state) => state.openEditor);
  const requestCloseStyle = useStylesStore((state) => state.requestCloseEditor);
  const openWildcards = useWildcardsStore((state) => state.openPanel);
  const wildcardsOpen = useWildcardsStore((state) => state.panelOpen);
  const closeWildcards = useWildcardsStore((state) => state.closePanel);
  const editingStyle = useStylesStore((state) => state.editing !== null);
  const tagPanelOpen = useTagsStore((state) => state.panelOpen);
  const openTags = useTagsStore((state) => state.openPanel);
  const requestCloseTags = useTagsStore((state) => state.requestClosePanel);
  const hasWorkflow = useGraphStore((state) => state.workflow !== null);
  const toolSet = useGraphStore((state) => {
    const tool = state.workflow === null ? null : readWorkflowTool(state.workflow);
    return tool !== null && isToolName(tool.name);
  });
  const [toolOpen, setToolOpen] = useState(false);
  const [toolDirty, setToolDirty] = useState(false);
  const [toolCloseRequested, setToolCloseRequested] = useState(false);
  const closeTool = (): void => {
    setToolOpen(false);
    setToolDirty(false);
    setToolCloseRequested(false);
  };

  const gate = (source: SourceState, action: string): { disabled: boolean; title: string } => {
    if (source.kind === 'unavailable') return { disabled: true, title: source.reason };
    if (source.kind === 'waiting') return { disabled: true, title: t('insertBar.waiting') };
    return { disabled: false, title: action };
  };
  const loraGate = gate(sources.lora, t('insertBar.lora.title'));
  const style = gate(sources.styles, t('insertBar.style.title'));
  const wildcard = gate(sources.wildcards, t('insertBar.wildcard.title'));
  const tagGate = gate(sources.tags, t('insertBar.tag.title'));

  return (
    <div className="flex flex-col items-center gap-0.5" aria-label={t('insertBar.label')}>
      <ModelPickerDialog
        folder={LORA_FOLDER}
        subtitle={t('insertBar.label')}
        trigger={
          <button
            type="button"
            className={ICON_BUTTON}
            disabled={loraGate.disabled}
            onMouseDown={keepCaret}
            onClick={() => setLoraOpen(!loraOpen)}
            aria-label={t('insertBar.lora.label')}
            aria-expanded={loraOpen}
            title={loraGate.title}
          >
            <SourceIcon icon={BookSearch} source={sources.lora} />
          </button>
        }
        value=""
        open={loraOpen}
        onOpenChange={setLoraOpen}
        options={lora.options}
        index={lora.index}
        baseUrl={lora.baseUrl}
        loading={lora.loading}
        onRefresh={lora.onRefresh}
        placeBlocked={lora.placeBlocked}
        drag={lora.drag}
        onInsertText={lora.onInsertText}
        onPlace={lora.onPlace}
        finalFocus={lora.finalFocus}
      />
      {loraOpen && lora.target !== null ? <InsertCaretMarker field={lora.target} /> : null}

      <button
        type="button"
        className={ICON_BUTTON}
        disabled={style.disabled}
        aria-label={t('insertBar.style.label')}
        aria-expanded={editingStyle}
        title={style.title}
        onMouseDown={keepCaret}
        onClick={() => {
          if (editingStyle) {
            requestCloseStyle();
            return;
          }
          openStyleEditor(firstStyle);
        }}
      >
        <SourceIcon icon={Brush} source={sources.styles} />
      </button>

      <button
        type="button"
        className={ICON_BUTTON}
        disabled={wildcard.disabled}
        aria-label={t('insertBar.wildcard.label')}
        aria-expanded={wildcardsOpen}
        title={wildcard.title}
        onMouseDown={keepCaret}
        onClick={() => {
          if (wildcardsOpen) {
            closeWildcards();
            return;
          }
          openWildcards();
        }}
      >
        <SourceIcon icon={SquareAsterisk} source={sources.wildcards} />
      </button>

      <button
        type="button"
        className={ICON_BUTTON}
        disabled={tagGate.disabled}
        aria-label={t('insertBar.tag.label')}
        aria-expanded={tagPanelOpen}
        title={tagGate.title}
        onMouseDown={keepCaret}
        onClick={() => {
          if (tagPanelOpen) {
            requestCloseTags();
            return;
          }
          openTags();
        }}
      >
        <SourceIcon icon={WholeWord} source={sources.tags} />
      </button>

      <button
        type="button"
        className={ICON_BUTTON}
        disabled={!hasWorkflow}
        aria-label={t('insertBar.tool.label')}
        aria-expanded={toolOpen}
        title={t('insertBar.tool.title')}
        onClick={() => {
          if (!toolOpen) setToolOpen(true);
          else if (toolDirty) setToolCloseRequested(true);
          else closeTool();
        }}
      >
        <Bot className={toolIcon({ set: toolSet })} aria-hidden />
      </button>
      {toolOpen ? (
        <WorkflowToolDialog
          open
          onClose={closeTool}
          closeRequested={toolCloseRequested}
          onCloseCanceled={() => setToolCloseRequested(false)}
          onDirtyChange={setToolDirty}
        />
      ) : null}
    </div>
  );
}
