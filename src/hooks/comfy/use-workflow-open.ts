import { useCallback } from 'react';

import { loadBuiltinWorkflow } from '@/graph/builtin-workflows';
import { emptyWorkflow } from '@/graph/normalize';
import type { WorkflowTemplate } from '@/graph/template-filter';
import { workflowDisplayName, workflowFileName } from '@/graph/workflow-name';
import { readOpenedFile, WORKFLOW_FILE_MAX_BYTES } from '@/graph/workflow-source';
import type { FileError } from '@/hooks/comfy/use-workflow-io';
import type { SaveState } from '@/hooks/comfy/use-workflow-save';
import { t } from '@/i18n';
import { downloadText } from '@/lib/download';
import { isTooLarge, wholeMegabytes } from '@/lib/file-size';
import type { SavedWorkflow } from '@/port/workflows';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { openWorkflow, serializeWorkflow } from '@/store/persist/workflow-file';
import { comfyPort } from '@/store/ports/comfy-port';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useImageTabsStore } from '@/store/use-image-tabs-store';
import { useTabsStore } from '@/store/use-tabs-store';

export interface OpenOptions {
  readonly here?: boolean | undefined;
  readonly confirmed?: boolean | undefined;
}

interface OpenSinks {
  readonly setFileError: (error: FileError | null) => void;
  readonly setSaveState: (state: SaveState) => void;
  readonly setTemplatesOpen: (open: boolean) => void;
  readonly setPendingSwitch: (workflow: SavedWorkflow | null) => void;
}

function openTabOf(path: string, baseUrl: string): string | null {
  const tabs = useTabsStore.getState();
  const found = tabs.tabs.find((tab) => {
    if (tab.kind !== 'workflow') return false;
    const snapshot = tabs.readTab(tab.id);
    return snapshot?.savedPath === path && snapshot.savedOn === baseUrl;
  });
  return found?.id ?? null;
}

function onWorkflowTab(): boolean {
  const { tabs, activeId } = useTabsStore.getState();
  return tabs.some((tab) => tab.id === activeId && tab.kind === 'workflow');
}

async function openReadFile(file: File): Promise<void> {
  const { definitions } = useDefinitionsStore.getState();
  const opened = readOpenedFile(await file.arrayBuffer(), definitions);
  const name = workflowDisplayName(file.name.replace(/\.png$/i, ''));
  if (opened.kind === 'image') {
    const id = useTabsStore.getState().openImageTab(name);
    useImageTabsStore
      .getState()
      .put(id, { url: URL.createObjectURL(file), texts: [...opened.texts] });
    return;
  }
  useTabsStore.getState().prepareOpen();
  openWorkflow(opened.source, name);
}

function exportWorkflow(): void {
  const { workflow, name } = useGraphStore.getState();
  if (!workflow) return;

  downloadText(serializeWorkflow(workflow), workflowFileName(name), 'application/json');
}

export function useWorkflowOpen(
  baseUrl: string,
  { setFileError, setSaveState, setTemplatesOpen, setPendingSwitch }: OpenSinks,
): {
  readonly openFile: (file: File | undefined) => Promise<void>;
  readonly openFromServer: (workflow: SavedWorkflow, options?: OpenOptions) => Promise<void>;
  readonly openTemplate: (template: WorkflowTemplate) => Promise<void>;
  readonly openEmpty: () => void;
  readonly exportWorkflow: () => void;
} {
  const openFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setFileError(null);
      setSaveState({ kind: 'idle' });
      if (isTooLarge(file, WORKFLOW_FILE_MAX_BYTES)) {
        const size = wholeMegabytes(WORKFLOW_FILE_MAX_BYTES);
        setFileError({ message: t('common.fileTooLarge', { name: file.name, size }) });
        return;
      }
      try {
        await openReadFile(file);
      } catch (error) {
        setFileError({ message: formatComfyFailure(error) });
      }
    },
    [setFileError, setSaveState],
  );

  const openFromServer = useCallback(
    async (saved: SavedWorkflow, options: OpenOptions = {}) => {
      setFileError(null);
      setSaveState({ kind: 'idle' });
      const open = options.here === true ? openTabOf(saved.path, baseUrl) : null;
      if (open !== null) {
        useTabsStore.getState().selectTab(open);
        return;
      }
      const here = options.here === true && onWorkflowTab();
      if (here && options.confirmed !== true && useGraphStore.getState().dirty) {
        setPendingSwitch(saved);
        return;
      }
      try {
        const workflow = await comfyPort().workflows.fetch(baseUrl, saved.path);
        if (!here) useTabsStore.getState().prepareOpen();
        openWorkflow(workflow, saved.name, {
          path: saved.path,
          baseUrl,
        });
      } catch (error) {
        setFileError({ message: formatComfyFailure(error) });
      }
    },
    [baseUrl, setFileError, setPendingSwitch, setSaveState],
  );

  const openTemplate = useCallback(
    async (template: WorkflowTemplate) => {
      setTemplatesOpen(false);
      setFileError(null);
      setSaveState({ kind: 'idle' });
      try {
        const raw = await (loadBuiltinWorkflow(template) ??
          comfyPort().workflows.fetchTemplate(baseUrl, template.name));
        useTabsStore.getState().prepareOpen();
        openWorkflow(raw, template.title);
      } catch (error) {
        setFileError({ message: formatComfyFailure(error) });
      }
    },
    [baseUrl, setFileError, setSaveState, setTemplatesOpen],
  );

  const openEmpty = useCallback((): void => {
    setFileError(null);
    setSaveState({ kind: 'idle' });
    useTabsStore.getState().prepareOpen();
    openWorkflow(emptyWorkflow(), '');
  }, [setFileError, setSaveState]);

  return { openFile, openFromServer, openTemplate, openEmpty, exportWorkflow };
}
