import { cva } from 'class-variance-authority';

import { DiagnosticsDialog } from '@/components/app/dialogs/DiagnosticsDialog';
import { FaultToasts } from '@/components/app/FaultToasts';
import { StorageWarningToasts } from '@/components/app/StorageWarningToasts';
import { TAB_PANEL_ID, tabElementId } from '@/components/app/tab-panel-ids';
import { TabBar } from '@/components/app/TabBar';
import { TabCountNotice } from '@/components/app/TabCountNotice';
import { WriteConflictToasts } from '@/components/app/WriteConflictToasts';
import { EmbedAnchorsContext } from '@/components/ui/embed-anchors';
import type { ShellKind } from '@/components/ui/shell-parts';
import { Toaster } from '@/components/ui/toast';
import { useDocumentTitle } from '@/hooks/shell/use-document-title';
import { useTabLabel } from '@/hooks/shell/use-tab-label';
import { WELCOME_HREF } from '@/hooks/shell/use-welcome-route';
import { useAnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// アプリの外枠。**タブ種別に依存しない**縦の並びと、アクティブなタブの種別で本体・右の列・
// タブのメニューの中身を選ぶことだけを持つ（欄の中身は種別の層が `ShellKind` で渡す）。
// ─────────────────────────────

/**
 * 外枠。右の列を右に置くときは 2 列 × 2 段の格子、下に置くときは縦に積む。
 * 会話のタブの画像ビューワーを列をまたいで重ねるので、重ねる原点にする
 */
const shell = cva('bg-background text-foreground relative h-full', {
  variants: {
    dock: {
      right: 'grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)]',
      bottom: 'flex flex-col',
    },
  },
});
/** ヘッダーと本体の列。右では外枠の 2 段を受け継ぐ。下に置くときは枠を作らない（子を外枠の縦の並びにそのまま置く） */
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

/** 本文（スキップリンクの飛び先） */
const MAIN_ID = 'app-main';

/** 外枠に差し込む種別。組み立ての根（`App`）が渡す */
export interface AppShellProps {
  /** 既定の種別。ほかの種別が持たないタブ（ワークフロー・画像）の中身を持つ */
  readonly workflow: ShellKind;
  /** 会話のタブの種別 */
  readonly chat: ShellKind;
}

/** 外枠の全体。ヘッダー・本体・右の列と、どのタブからも 1 つのダイアログ・知らせを置く */
export function AppShell({
  workflow: { useParts: useWorkflowParts, openFile: openWorkflowFile = declineFile },
  chat: { useParts: useChatParts, openFile: openChatFile = declineFile },
}: AppShellProps): React.ReactElement {
  const storedDock = useSettingsStore((state) => state.sidePanelDock);
  const embedAnchors = useAnchorRegistry();
  const workflowParts = useWorkflowParts({ anchors: embedAnchors, openOther: openChatFile });
  const chatParts = useChatParts({ anchors: embedAnchors, openOther: openWorkflowFile });
  // アクティブなタブの中身を持つ種別。どれも名乗らなければ既定の種別
  const current = chatParts.active === true ? chatParts : workflowParts;
  const other = current === chatParts ? workflowParts : chatParts;
  const dock = current.dock ?? storedDock;
  const activeId = useTabsStore((state) => state.activeId);
  useDocumentTitle(activeId);
  // 新しいタブは ▾ で種別を選んで開く
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

  // 埋め込み先を測る台帳（会話のタブの画像ビューワー）を下へ渡す
  return (
    <EmbedAnchorsContext value={embedAnchors}>
      <div className={shell({ dock })}>
        {/* 本文へ飛ぶ（WCAG 2.4.1）。キーで焦点が来たときだけ左上に出す */}
        <a
          href={`#${MAIN_ID}`}
          className="bg-background sr-only rounded px-2 py-1 text-sm focus:not-sr-only focus:fixed
          focus:top-2 focus:left-2 focus:z-[70]"
          onClick={(event) => {
            // アドレスの # を書き換えず、本文へ焦点を移す
            event.preventDefault();
            document.getElementById(MAIN_ID)?.focus();
          }}
        >
          {t('app.skipToMain')}
        </a>
        <div className={column({ dock })}>
          <header className="flex h-8 items-start gap-2 pl-4">
            {/* アクティブなタブの種別の一覧を開け閉めする */}
            <div className="pt-1">{current.navToggle}</div>
            {/* 右の余白は、間隔 8px とタブの並びの余白 8px と合わせてロゴとタブの間の幅にする */}
            <h1 className="shrink-0 pt-[5.6px] pr-[52px] font-semibold">
              <a href={WELCOME_HREF} title={t('app.welcome.open')}>
                KisaraUI
              </a>
            </h1>

            {chatParts.header}
            {workflowParts.header}

            {/* 見出しの読み方は種別の層から渡す（外殻は種別の状態を読まない） */}
            {/* タブの並びの横のスクロールバーは、ヘッダーの下（本体の上の余白）に重ねて出す。
            本体の中身より前に置き、スクロールバーを掴めるようにする */}
            <div className="relative z-10 min-w-0 flex-1">
              <TabBar
                useTabLabel={useTabLabel}
                onRename={current.onRename}
                menu={current.tabMenu}
                kinds={kinds}
              />
            </div>
          </header>

          {/* 種別の見張り。どの種別のタブを見ていても続ける */}
          {chatParts.background}
          {workflowParts.background}

          {/* 失敗と出し入れの結果は帯に積まず、画面上部の知らせ（トースト）に出す */}
          <FaultToasts />
          <WriteConflictToasts />
          <StorageWarningToasts />
          <TabCountNotice />
          {chatParts.toasts}
          {workflowParts.toasts}

          <div className={body({ dock })}>
            <main id={MAIN_ID} tabIndex={-1} className={mainArea({ dock })}>
              {/* アクティブなタブの中身。タブと読み上げで結ぶ（tabpanel） */}
              <div
                id={TAB_PANEL_ID}
                role="tabpanel"
                aria-labelledby={tabElementId(activeId)}
                // ワークフローの一覧の引き出しを、本体の左端から重ねる
                className="relative h-full"
              >
                {current.workspace}
              </div>
            </main>
            {dock === 'bottom' ? current.side : null}
          </div>
        </div>
        {/* 右に置くときは、ヘッダーの横まで伸ばして画面の最上部から置く */}
        {dock === 'right' ? current.side : null}

        {chatParts.dialogs}
        {workflowParts.dialogs}

        {/* 保存の結果などの短い知らせ。画面上部に出す */}
        <Toaster />

        {/* 診断ファイルを書き出すダイアログ。設定の欄・知らせ・タブバーの印のどこからでも同じ 1 つ */}
        <DiagnosticsDialog />

        {/* どのタブからも同じ 1 つの別窓・ダイアログ */}
        {chatParts.windows}
        {workflowParts.windows}

        {/* 外枠に重ねる物。アクティブな種別の物と、ほかの種別のタブの上に重ねる物 */}
        {current.overlay}
        {other.overlayOnOthers}
      </div>
    </EmbedAnchorsContext>
  );
}

/** ファイルを引き受けない種別の受け口 */
function declineFile(): Promise<boolean> {
  return Promise.resolve(false);
}
