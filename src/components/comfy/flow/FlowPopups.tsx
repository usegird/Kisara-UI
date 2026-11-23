import { ConnectSlotDialog } from '@/components/comfy/flow/dialogs/ConnectSlotDialog';
import type { NodeSearchDialogProps } from '@/components/comfy/flow/dialogs/NodeSearchDialog';
import type { NodeSettingsDialogProps } from '@/components/comfy/flow/dialogs/NodeSettingsDialog';
import {
  initialFilters,
  referenceTarget,
  searchKey,
  searchTitle,
} from '@/components/comfy/flow/node-search-mode';
import { BrokenNotice, ErrorBoundary } from '@/components/ui/error-boundary';
import { FALLBACK_BUTTON_CLASS } from '@/components/ui/fallback-button';
import { lazyPart } from '@/components/ui/lazy-part';
import { ReturnFocus } from '@/components/ui/return-focus';
import type { NodeSettingsPatch } from '@/graph/node-settings';
import type { NodeView } from '@/graph/rows';
import type { NodeDefinitionMap, NodeId, WorkflowNode } from '@/graph/types';
import type { CardMotion } from '@/hooks/flow/use-flow-motion';
import type { NodeEditing } from '@/hooks/flow/use-node-editing';
import { t } from '@/i18n';
import { useDefinitionsStore } from '@/store/use-definitions-store';

const NodeSearchDialog = lazyPart<NodeSearchDialogProps>(
  'flow.canvas.nodeSearch',
  () => import('@/components/comfy/flow/dialogs/NodeSearchDialog').then((m) => m.NodeSearchDialog),
  () => null,
);

const NodeSettingsDialog = lazyPart<NodeSettingsDialogProps>(
  'flow.canvas.nodeSettings',
  () =>
    import('@/components/comfy/flow/dialogs/NodeSettingsDialog').then((m) => m.NodeSettingsDialog),
  () => null,
);

function PopupFault({
  label,
  error,
  onRetry,
  onClose,
}: {
  readonly label: string;
  readonly error: Error;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}): React.ReactElement {
  return (
    <div className="bg-card fixed inset-x-0 top-24 z-50 mx-auto w-96 max-w-[90vw] rounded shadow-lg">
      <BrokenNotice
        label={label}
        error={error}
        onRetry={onRetry}
        extra={
          <button type="button" className={FALLBACK_BUTTON_CLASS} onClick={onClose}>
            {t('common.close')}
          </button>
        }
      />
    </div>
  );
}

export function FlowPopups({
  editing,
  settingsNode,
  views,
  allViews,
  definitions,
  onSettingsChange,
  track,
}: {
  readonly editing: NodeEditing;
  readonly settingsNode: WorkflowNode | null;
  readonly views: readonly NodeView[];
  readonly allViews: readonly NodeView[];
  readonly definitions: NodeDefinitionMap;
  readonly onSettingsChange: (id: NodeId, patch: NodeSettingsPatch) => void;
  readonly track: CardMotion['track'];
}): React.ReactElement {
  const frequency = useDefinitionsStore((state) => state.frequency);
  const { search, setSearch, setSettingsFor } = editing;
  const onSettingsClose = (): void => setSettingsFor(null);
  const onSettingsPatch = (patch: NodeSettingsPatch): void => {
    if (settingsNode) onSettingsChange(settingsNode.id, patch);
  };
  const onSearchClose = (): void => setSearch(null);
  const onPickDefinition = (definition: Parameters<NodeEditing['pickDefinition']>[0]): void =>
    track(() => editing.pickDefinition(definition));
  const onResolveConnect = (slot: Parameters<NodeEditing['resolveConnect']>[0]): void =>
    track(() => editing.resolveConnect(slot));

  return (
    <>
      {settingsNode ? (
        <ErrorBoundary
          label={t('flow.canvas.nodeSettings')}
          resetKey={settingsNode}
          fallback={(error, retry) => (
            <PopupFault
              label={t('flow.canvas.nodeSettings')}
              error={error}
              onRetry={retry}
              onClose={onSettingsClose}
            />
          )}
        >
          <NodeSettingsDialog
            node={settingsNode}
            displayName={views.find((view) => view.id === settingsNode.id)?.displayName ?? ''}
            onChange={onSettingsPatch}
            onClose={onSettingsClose}
          />
        </ErrorBoundary>
      ) : null}

      {search === null ? null : (
        <ReturnFocus>
          <ErrorBoundary
            label={t('flow.canvas.nodeSearch')}
            resetKey={searchKey(search)}
            fallback={(error, retry) => (
              <PopupFault
                label={t('flow.canvas.nodeSearch')}
                error={error}
                onRetry={retry}
                onClose={onSearchClose}
              />
            )}
          >
            <NodeSearchDialog
              key={searchKey(search)}
              open
              definitions={definitions}
              frequency={frequency}
              title={searchTitle(search)}
              initialFilters={initialFilters(search)}
              onSelect={onPickDefinition}
              onClose={onSearchClose}
              reference={referenceTarget(search)}
              views={allViews}
              onPickReference={editing.pickReference}
            />
          </ErrorBoundary>
        </ReturnFocus>
      )}
      <ConnectSlotDialog choice={editing.connectChoice} onResolve={onResolveConnect} />
    </>
  );
}
