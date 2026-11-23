import { useState } from 'react';

import type { WorkflowTemplate } from '@/graph/template-filter';
import { useWorkflowOpen, type OpenOptions } from '@/hooks/comfy/use-workflow-open';
import { useWorkflowSave, type SaveState } from '@/hooks/comfy/use-workflow-save';
import { useTabState } from '@/hooks/flow/use-tab-state';
import type { SavedWorkflow } from '@/port/workflows';
import { useSettingsStore } from '@/store/use-settings-store';

export interface FileError {
  readonly message: string;
}

export interface WorkflowIo {
  readonly openFile: (file: File | undefined) => Promise<void>;
  readonly openFromServer: (workflow: SavedWorkflow, options?: OpenOptions) => Promise<void>;
  readonly openTemplate: (template: WorkflowTemplate) => Promise<void>;
  readonly openEmpty: () => void;
  readonly exportWorkflow: () => void;
  readonly save: () => Promise<void>;
  readonly saveAs: (name: string) => Promise<void>;
  readonly confirmOverwrite: () => Promise<void>;
  readonly templatesOpen: boolean;
  readonly setTemplatesOpen: (open: boolean) => void;
  readonly saveAsOpen: boolean;
  readonly setSaveAsOpen: (open: boolean) => void;
  readonly fileError: FileError | null;
  readonly saveState: SaveState;
  readonly resetSaveState: () => void;
  readonly pendingSwitch: SavedWorkflow | null;
  readonly confirmSwitch: () => void;
  readonly cancelSwitch: () => void;
}

export function useWorkflowIo(): WorkflowIo {
  'use no memo';
  const baseUrl = useSettingsStore((state) => state.baseUrl);

  const [templatesOpen, setTemplatesOpen] = useTabState('workflowIo.templates', false);
  const [saveAsOpen, setSaveAsOpen] = useTabState('workflowIo.saveAs', false);
  const [pendingSwitch, setPendingSwitch] = useTabState<SavedWorkflow | null>(
    'workflowIo.pendingSwitch',
    null,
  );
  const [fileError, setFileError] = useState<FileError | null>(null);

  const { saveState, setSaveState, resetSaveState, save, saveAs, confirmOverwrite } =
    useWorkflowSave(baseUrl, setSaveAsOpen);
  const { openFile, openFromServer, openTemplate, openEmpty, exportWorkflow } = useWorkflowOpen(
    baseUrl,
    { setFileError, setSaveState, setTemplatesOpen, setPendingSwitch },
  );

  const confirmSwitch = (): void => {
    if (pendingSwitch === null) return;
    setPendingSwitch(null);
    void openFromServer(pendingSwitch, { here: true, confirmed: true });
  };
  const cancelSwitch = (): void => setPendingSwitch(null);

  return {
    pendingSwitch,
    confirmSwitch,
    cancelSwitch,
    openFile,
    openFromServer,
    openTemplate,
    openEmpty,
    exportWorkflow,
    save,
    saveAs,
    confirmOverwrite,
    templatesOpen,
    setTemplatesOpen,
    saveAsOpen,
    setSaveAsOpen,
    fileError,
    saveState,
    resetSaveState,
  };
}
