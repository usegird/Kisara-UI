import { WorkflowToolDialog as ToolDialog } from '@/components/shared/WorkflowToolDialog';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useTabsStore } from '@/store/use-tabs-store';

export interface WorkflowToolDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly closeRequested?: boolean | undefined;
  readonly onCloseCanceled?: (() => void) | undefined;
  readonly onDirtyChange?: ((dirty: boolean) => void) | undefined;
}

export function WorkflowToolDialog({
  open,
  onClose,
  closeRequested,
  onCloseCanceled,
  onDirtyChange,
}: WorkflowToolDialogProps): React.ReactElement | null {
  const workflow = useGraphStore((state) => state.workflow);
  const name = useGraphStore((state) => state.name);
  const savedPath = useGraphStore((state) => state.savedPath);
  const definitions = useDefinitionsStore((state) => state.definitions);
  const tabId = useTabsStore((state) => state.activeId);
  if (workflow === null) return null;
  return (
    <ToolDialog
      open={open}
      onClose={onClose}
      closeRequested={closeRequested}
      onCloseCanceled={onCloseCanceled}
      onDirtyChange={onDirtyChange}
      workflow={workflow}
      definitions={definitions}
      workflowName={name}
      place={{ tabName: name, tabId, path: savedPath }}
      onSave={(tool) => useGraphStore.getState().setWorkflowTool(tool)}
    />
  );
}
