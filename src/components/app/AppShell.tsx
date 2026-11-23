import { cva } from 'class-variance-authority';

import { DiagnosticsDialog } from '@/components/app/dialogs/DiagnosticsDialog';
import { FaultToasts } from '@/components/app/FaultToasts';
import { StorageWarningToasts } from '@/components/app/StorageWarningToasts';
import { TAB_PANEL_ID, tabElementId } from '@/components/app/tab-panel-ids';
import { TabBar } from '@/components/app/TabBar';
import { TabCountNotice } from '@/components/app/TabCountNotice';
import { welcomeHref } from '@/components/app/welcome-link';
import { WriteConflictToasts } from '@/components/app/WriteConflictToasts';
import { EmbedAnchorsContext } from '@/components/ui/embed-anchors';
import type { ShellKind } from '@/components/ui/shell-parts';
import { Toaster } from '@/components/ui/toast';
import { useDocumentTitle } from '@/hooks/shell/use-document-title';
import { useTabLabel } from '@/hooks/shell/use-tab-label';
import { useAnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

const shell = cva('bg-background text-foreground relative h-full', {
  variants: {
    dock: {
      right: 'grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)]',
      bottom: 'flex flex-col',
    },
  },
});
const column = cva('', {
  variants: {
    dock: {
      right: 'row-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-subgrid',
      bottom: 'contents',
    },
  },
});
const body = cva('flex min-h-0 flex-1', {
  variants: { dock: { right: 'flex-row', bottom: 'flex-col' } },
});
const mainArea = cva('flex-1 overflow-auto', {
  variants: { dock: { right: 'min-w-0', bottom: 'min-h-0' } },
});

const MAIN_ID = 'app-main';

export interface AppShellProps {
  readonly workflow: ShellKind;
  readonly chat: ShellKind;
}

export function AppShell({
  workflow: { useParts: useWorkflowParts, openFile: openWorkflowFile = declineFile },
  chat: { useParts: useChatParts, openFile: openChatFile = declineFile },
}: AppShellProps): React.ReactElement {
  const storedDock = useSettingsStore((state) => state.sidePanelDock);
  const embedAnchors = useAnchorRegistry();
  const workflowParts = useWorkflowParts({ anchors: embedAnchors, openOther: openChatFile });
  const chatParts = useChatParts({ anchors: embedAnchors, openOther: openWorkflowFile });
  const current = chatParts.active === true ? chatParts : workflowParts;
  const other = current === chatParts ? workflowParts : chatParts;
  const dock = current.dock ?? storedDock;
  const activeId = useTabsStore((state) => state.activeId);
  useDocumentTitle(activeId);
  const kinds = [
    {
      key: 'chat',
      label: t('app.tabs.kind.chat'),
      onAdd: () => void useTabsStore.getState().addChatTab(),
    },
    {
      key: 'workflow',
      label: t('app.tabs.kind.workflow'),
      onAdd: () => void useTabsStore.getState().addTab(),
    },
  ];

  return (
    <EmbedAnchorsContext value={embedAnchors}>
      <div className={shell({ dock })}>
        <a
          href={`#${MAIN_ID}`}
          className="bg-background sr-only rounded px-2 py-1 text-sm focus:not-sr-only focus:fixed
          focus:top-2 focus:left-2 focus:z-[70]"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById(MAIN_ID)?.focus();
          }}
        >
          {t('app.skipToMain')}
        </a>
        <div className={column({ dock })}>
          <header className="flex h-8 items-start gap-2 pl-3">
            <div className="pt-1">{current.navToggle}</div>
            <h1 className="shrink-0 pt-[5.6px] pr-[56px] font-semibold">
              <a href={welcomeHref()} title={t('app.welcome.open')}>
                KisaraUI
              </a>
            </h1>

            {chatParts.header}
            {workflowParts.header}

            <div className="relative z-10 min-w-0 flex-1">
              <TabBar
                useTabLabel={useTabLabel}
                onRename={current.onRename}
                menu={current.tabMenu}
                moveMenu={current.tabMoveMenu}
                kinds={kinds}
              />
            </div>
          </header>

          {chatParts.background}
          {workflowParts.background}

          <FaultToasts />
          <WriteConflictToasts />
          <StorageWarningToasts />
          <TabCountNotice />
          {chatParts.toasts}
          {workflowParts.toasts}

          <div className={body({ dock })}>
            <main id={MAIN_ID} tabIndex={-1} className={mainArea({ dock })}>
              <div
                id={TAB_PANEL_ID}
                role="tabpanel"
                aria-labelledby={tabElementId(activeId)}
                className="relative h-full"
              >
                {current.workspace}
              </div>
            </main>
            {dock === 'bottom' ? current.side : null}
          </div>
        </div>
        {dock === 'right' ? current.side : null}

        {chatParts.dialogs}
        {workflowParts.dialogs}

        <Toaster />

        <DiagnosticsDialog />

        {chatParts.windows}
        {workflowParts.windows}

        {current.overlay}
        {other.overlayOnOthers}
      </div>
    </EmbedAnchorsContext>
  );
}

function declineFile(): Promise<boolean> {
  return Promise.resolve(false);
}
