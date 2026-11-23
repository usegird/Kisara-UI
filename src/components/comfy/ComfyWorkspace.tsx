import { ComfyConnectDialog } from '@/components/comfy/dialogs/ComfyConnectDialog';
import { StyleEditorOverlay } from '@/components/comfy/dialogs/StyleEditorOverlay';
import { TagPanelOverlay } from '@/components/comfy/dialogs/TagPanelOverlay';
import { WildcardOverlay } from '@/components/comfy/dialogs/WildcardOverlay';
import { FlowCanvas } from '@/components/comfy/flow/FlowCanvas';
import { ImageTabPanel } from '@/components/comfy/ImageTabPanel';
import { FloatingControl } from '@/components/comfy/queue/FloatingControl';
import { HistoryDetailOverlay } from '@/components/comfy/queue/HistoryDetailOverlay';
import { TaskDetailOverlay } from '@/components/comfy/queue/TaskDetailOverlay';
import { ViewerOverlay } from '@/components/comfy/queue/ViewerOverlay';
import { useEmbedTarget } from '@/components/ui/embed-anchors';
import { BrokenNotice, ErrorBoundary } from '@/components/ui/error-boundary';
import { FALLBACK_BUTTON_CLASS } from '@/components/ui/fallback-button';
import { t } from '@/i18n';
import { useConnectionStore } from '@/store/use-connection-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useHistoryDetailStore } from '@/store/use-history-detail-store';
import { useStylesStore } from '@/store/use-styles-store';
import { useTabsStore } from '@/store/use-tabs-store';
import { useTagsStore } from '@/store/use-tags-store';
import { useTaskDetailStore } from '@/store/use-task-detail-store';
import { useViewerStore } from '@/store/use-viewer-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

export interface ComfyWorkspaceProps {
  readonly templatesOpen: boolean;
  readonly listShown: boolean;
}

export function ComfyWorkspace({
  templatesOpen,
  listShown,
}: ComfyWorkspaceProps): React.ReactElement {
  const hasWorkflow = useGraphStore((state) => state.workflow !== null);
  const viewerOpen = useViewerStore((state) => state.mode === 'overlay');
  const detailOpen = useTaskDetailStore((state) => state.promptId !== null);
  const historyOpen = useHistoryDetailStore((state) => state.key !== null);
  const wildcardsOpen = useWildcardsStore((state) => state.panelOpen);
  const editingStyle = useStylesStore((state) => state.editing !== null);
  const tagPanelOpen = useTagsStore((state) => state.panelOpen);
  const connected = useConnectionStore((state) => state.status === 'connected');

  const activeTab = useTabsStore((state) => state.activeId);
  const imageTab = useTabsStore((state) =>
    state.tabs.some((tab) => tab.id === state.activeId && tab.kind === 'image'),
  );
  const closeTab = useTabsStore((state) => state.closeTab);
  const attachEmbed = useEmbedTarget('comfyHost');

  const dialogs = (
    <>
      {detailOpen ? (
        <ErrorBoundary label={t('comfy.workspace.taskDetail')}>
          <TaskDetailOverlay />
        </ErrorBoundary>
      ) : null}
      {historyOpen ? (
        <ErrorBoundary label={t('history.detail.title')}>
          <HistoryDetailOverlay />
        </ErrorBoundary>
      ) : null}
      {viewerOpen ? (
        <ErrorBoundary label={t('comfy.workspace.imageView')}>
          <ViewerOverlay />
        </ErrorBoundary>
      ) : null}
      {wildcardsOpen ? (
        <ErrorBoundary label={t('wildcards.title')}>
          <WildcardOverlay />
        </ErrorBoundary>
      ) : null}
      {editingStyle ? (
        <ErrorBoundary label={t('styles.edit')}>
          <StyleEditorOverlay />
        </ErrorBoundary>
      ) : null}
      {tagPanelOpen ? (
        <ErrorBoundary label={t('tags.title')}>
          <TagPanelOverlay />
        </ErrorBoundary>
      ) : null}
    </>
  );
  return (
    <div className="relative h-full">
      {imageTab ? (
        <>
          <ErrorBoundary label={t('comfy.workspace.image')} resetKey={activeTab}>
            <ImageTabPanel tabId={activeTab} />
          </ErrorBoundary>
          <div ref={attachEmbed} className="pointer-events-none absolute inset-4 z-20" />
        </>
      ) : hasWorkflow ? (
        <ErrorBoundary
          label={t('comfy.workspace.workflow')}
          resetKey={activeTab}
          fallback={(error, retry) => (
            <div className="p-4">
              <BrokenNotice
                label={t('comfy.workspace.workflow')}
                error={error}
                onRetry={retry}
                extra={
                  <button
                    type="button"
                    className={FALLBACK_BUTTON_CLASS}
                    title={t('comfy.workspace.closeTabTitle')}
                    onClick={() => closeTab(activeTab)}
                  >
                    {t('comfy.workspace.closeTab')}
                  </button>
                }
              />
            </div>
          )}
        >
          <FlowCanvas />
        </ErrorBoundary>
      ) : (
        <div ref={attachEmbed} className="pointer-events-none absolute inset-4 z-20" />
      )}
      {hasWorkflow && !imageTab ? <FloatingControl connected={connected} /> : null}
      {dialogs}
      <ComfyConnectDialog
        auto={!imageTab}
        pinned={!imageTab && !hasWorkflow}
        covered={templatesOpen}
        listShown={listShown}
      />
    </div>
  );
}
