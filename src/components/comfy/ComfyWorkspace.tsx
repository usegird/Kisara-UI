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

// ─────────────────────────────
// ComfyUI タブの中身。ワークフローの画面・画像のタブを出し分け（開いていないタブの本体は空）、焦点を閉じ込めない
// ダイアログ（詳細・ビューワー・スタイル・ワイルドカード・タグ辞書）と接続のポップアップをここに置く。
// ─────────────────────────────

/**
 * ComfyUI タブの中身を描く。ダイアログの重なりの順は開いた順で、ここでは決めない。
 */
export function ComfyWorkspace(): React.ReactElement {
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
  // 埋め込みの元の嵌め先。外枠がこれを右の列まで広げて嵌め先を置く
  const attachEmbed = useEmbedTarget('comfyHost');

  // ダイアログが描けなくてもワークフローは使える（それぞれ受け止める）
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
        // ワークフローの画面。描けなければ、もう一度描くかこのタブを閉じる。
        // タブを切り替えたら作り直す
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
        // ワークフローが無いときは、空の本体を埋め込みの嵌め先にする
        <div ref={attachEmbed} className="pointer-events-none absolute inset-4 z-20" />
      )}
      {/* ワークフローを表示しているときだけ出す（開いていないタブ・画像のタブには出さない） */}
      {hasWorkflow && !imageTab ? <FloatingControl connected={connected} /> : null}
      {dialogs}
      <ComfyConnectDialog auto={!imageTab} pinned={!imageTab && !hasWorkflow} />
    </div>
  );
}
