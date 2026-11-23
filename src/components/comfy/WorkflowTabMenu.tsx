import { ContextMenuItem } from '@/components/ui/context-menu';
import type { WorkflowIo } from '@/hooks/comfy/use-workflow-io';
import { canOverwrite } from '@/hooks/comfy/use-workflow-save';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

export interface WorkflowTabMenuProps {
  readonly io: WorkflowIo;
  readonly connected: boolean;
}

export function DuplicateTabMenuItem(): React.ReactElement {
  const hasWorkflow = useGraphStore((state) => state.workflow !== null);
  const onDuplicateClick = (): void => {
    const { activeId, duplicateTab } = useTabsStore.getState();
    duplicateTab(activeId);
  };
  return (
    <ContextMenuItem disabled={!hasWorkflow} onClick={onDuplicateClick}>
      {t('comfy.tabMenu.duplicate')}
    </ContextMenuItem>
  );
}

export function WorkflowTabMenu({ io, connected }: WorkflowTabMenuProps): React.ReactElement {
  const hasWorkflow = useGraphStore((state) => state.workflow !== null);
  const canSave = hasWorkflow && connected && io.saveState.kind !== 'saving';
  const saveTitle = connected ? undefined : t('comfy.connection.needsConnection');
  const overwriteBlock = useOverwriteBlock();

  return (
    <>
      <ContextMenuItem
        disabled={!canSave || overwriteBlock !== null}
        title={overwriteBlock ?? saveTitle}
        onClick={guardPress('workflow-save', () => void io.save())}
      >
        {t('comfy.tabMenu.save')}
      </ContextMenuItem>
      <ContextMenuItem disabled={!canSave} title={saveTitle} onClick={() => io.setSaveAsOpen(true)}>
        {t('comfy.tabMenu.saveAs')}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!hasWorkflow}
        title={t('comfy.tabMenu.exportTitle')}
        onClick={io.exportWorkflow}
      >
        {t('comfy.tabMenu.export')}
      </ContextMenuItem>
    </>
  );
}

function useOverwriteBlock(): string | null {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  return useGraphStore((state) => {
    if (state.savedPath === null || canOverwrite(state, baseUrl)) return null;
    return t(state.savedOwn ? 'comfy.saveGuard.otherServerTitle' : 'comfy.saveGuard.notOwnedTitle');
  });
}
