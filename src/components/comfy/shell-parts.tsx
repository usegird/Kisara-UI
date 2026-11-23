import { useRef } from 'react';

import { ComfyBackground } from '@/components/comfy/ComfyBackground';
import { ComfyEmbedHost } from '@/components/comfy/ComfyEmbedHost';
import { ComfyWorkspace } from '@/components/comfy/ComfyWorkspace';
import { SaveAsDialog } from '@/components/comfy/dialogs/SaveAsDialog';
import type { TemplatePickerDialogProps } from '@/components/comfy/dialogs/TemplatePickerDialog';
import { ViewerHost } from '@/components/comfy/queue/ViewerHost';
import { ViewerWindowHost } from '@/components/comfy/queue/ViewerWindowHost';
import { SidePanel } from '@/components/comfy/SidePanel';
import { WorkflowFileInput } from '@/components/comfy/WorkflowFileInput';
import { WorkflowIoToasts } from '@/components/comfy/WorkflowIoToasts';
import { WorkflowListDrawer } from '@/components/comfy/WorkflowListDrawer';
import { DuplicateTabMenuItem, WorkflowTabMenu } from '@/components/comfy/WorkflowTabMenu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { lazyPart } from '@/components/ui/lazy-part';
import { NavToggle } from '@/components/ui/nav-toggle';
import { ReturnFocus } from '@/components/ui/return-focus';
import type { ShellContext, ShellKind, ShellParts } from '@/components/ui/shell-parts';
import { useComfyConnection } from '@/hooks/comfy/use-comfy-connection';
import { useComfySocket } from '@/hooks/comfy/use-comfy-socket';
import { useWorkflowIo } from '@/hooks/comfy/use-workflow-io';
import type { SaveState } from '@/hooks/comfy/use-workflow-save';
import { useTabState } from '@/hooks/flow/use-tab-state';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

const TemplatePickerDialog = lazyPart<TemplatePickerDialogProps>(
  'app.lazy.templates',
  () =>
    import('@/components/comfy/dialogs/TemplatePickerDialog').then((m) => m.TemplatePickerDialog),
  () => null,
);

export const comfyShell: ShellKind = { useParts: useComfyShellParts };

function useComfyShellParts({ openOther }: ShellContext): ShellParts {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const clientId = useSettingsStore((state) => state.clientId);

  const { connected } = useComfyConnection();

  useComfySocket(baseUrl, clientId, connected && clientId.length > 0);

  const fileInput = useRef<HTMLInputElement>(null);
  const io = useWorkflowIo();
  const name = useGraphStore((state) => state.name);
  const setName = useGraphStore((state) => state.setName);
  const openFile = (): void => fileInput.current?.click();
  const openAnyFile = async (file: File | undefined): Promise<void> => {
    if (file !== undefined && (await openOther(file))) return;
    await io.openFile(file);
  };
  const [workflowList, setWorkflowList] = useTabState('comfy.workflowList', false);
  const listPinned = useEmptyWorkflowTab() && connected;
  const listShown = workflowList || listPinned;

  return {
    navToggle: (
      <NavToggle
        label={t('comfy.list.label')}
        expanded={listShown}
        onToggle={() => {
          if (!listPinned) setWorkflowList(!workflowList);
        }}
      />
    ),
    tabMenu: <WorkflowTabMenu io={io} connected={connected} />,
    tabMoveMenu: <DuplicateTabMenuItem />,
    onRename: setName,
    workspace: (
      <>
        <ComfyWorkspace templatesOpen={io.templatesOpen} />
        {listShown ? (
          <WorkflowListDrawer
            baseUrl={baseUrl}
            pinned={listPinned}
            onClose={() => setWorkflowList(false)}
            onOpenEmpty={io.openEmpty}
            onOpenFile={openFile}
            onOpenTemplate={() => io.setTemplatesOpen(true)}
            onOpenSaved={(workflow, here) => void io.openFromServer(workflow, { here })}
          />
        ) : null}
      </>
    ),
    side: <SidePanel />,
    overlay: <ComfyEmbedHost />,
    overlayOnOthers: <ViewerHost />,
    header: <WorkflowFileInput openFile={openAnyFile} fileInput={fileInput} />,
    background: <ComfyBackground />,
    toasts: <WorkflowIoToasts saveState={io.saveState} fileError={io.fileError} />,
    dialogs: (
      <>
        <ConfirmDialog
          open={io.saveState.kind === 'exists' || io.saveState.kind === 'shared'}
          title={t('app.overwrite.title')}
          description={overwriteDescriptionOf(io.saveState)}
          confirmLabel={t('app.overwrite.confirm')}
          onConfirm={() => void io.confirmOverwrite()}
          onCancel={io.resetSaveState}
        />

        <ConfirmDialog
          open={io.pendingSwitch !== null}
          title={t('common.unsaved.title')}
          description={t('common.unsaved.switch')}
          confirmLabel={t('common.ok')}
          onConfirm={guardPress('workflow-open-server', io.confirmSwitch)}
          onCancel={io.cancelSwitch}
        />

        <SaveAsDialog
          open={io.saveAsOpen}
          initialName={name}
          onSave={guardPress('workflow-save-as', (next: string) => void io.saveAs(next))}
          onCancel={() => io.setSaveAsOpen(false)}
        />
      </>
    ),
    windows: (
      <>
        <ViewerWindowHost />

        {io.templatesOpen ? (
          <ReturnFocus>
            <TemplatePickerDialog
              open
              baseUrl={baseUrl}
              onSelect={(template) => void io.openTemplate(template)}
              onClose={() => io.setTemplatesOpen(false)}
            />
          </ReturnFocus>
        ) : null}
      </>
    ),
  };
}

function useEmptyWorkflowTab(): boolean {
  const hasWorkflow = useGraphStore((state) => state.workflow !== null);
  const imageTab = useTabsStore((state) =>
    state.tabs.some((tab) => tab.id === state.activeId && tab.kind === 'image'),
  );
  return !hasWorkflow && !imageTab;
}

function overwriteDescriptionOf(state: SaveState): string {
  if (state.kind === 'exists') return t('app.overwrite.description', { path: state.path });
  if (state.kind === 'shared') return t('app.overwrite.shared');
  return '';
}
