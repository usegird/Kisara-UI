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
import { WorkflowTabMenu } from '@/components/comfy/WorkflowTabMenu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { lazyPart } from '@/components/ui/lazy-part';
import { NavToggle } from '@/components/ui/nav-toggle';
import { ReturnFocus } from '@/components/ui/return-focus';
import type { ShellContext, ShellKind, ShellParts } from '@/components/ui/shell-parts';
import { useComfyConnection } from '@/hooks/comfy/use-comfy-connection';
import { useComfySocket } from '@/hooks/comfy/use-comfy-socket';
import { useWorkflowIo } from '@/hooks/comfy/use-workflow-io';
import { useTabState } from '@/hooks/flow/use-tab-state';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// ComfyUI のタブ（ワークフロー・画像）が外枠に差し込む部品。接続と進捗の WebSocket・ワークフローの出し入れは
// どのタブを見ていても続けるので、ここの欄の多くは種別によらず外枠が置く。
// ─────────────────────────────

// 一覧から選ぶダイアログは、開いたときだけ置いて中身を読む。
// 読んでいる間は何も出さない（仮の枠を出すと付け替えのぶん描き直しが増える）。
// 閉じたら開く前の焦点へ戻す（`ReturnFocus`）
const TemplatePickerDialog = lazyPart<TemplatePickerDialogProps>(
  'app.lazy.templates',
  () =>
    import('@/components/comfy/dialogs/TemplatePickerDialog').then((m) => m.TemplatePickerDialog),
  () => null,
);

/** ComfyUI の種別。会話のタブ以外（ワークフロー・画像）の中身を持つ */
export const comfyShell: ShellKind = { useParts: useComfyShellParts };

/** ComfyUI のタブの欄の中身を組む。接続・WebSocket・ワークフローの出し入れの状態をここで持つ */
function useComfyShellParts({ openOther }: ShellContext): ShellParts {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const clientId = useSettingsStore((state) => state.clientId);

  // 起動時の自動接続を二重に走らせないよう、**ここで1回だけ**呼ぶ（接続の操作はポップアップが持つ）
  const { connected } = useComfyConnection();

  // 進捗の WebSocket。接続できている間だけ張る。タブの clientId が決まるまでは張らない
  useComfySocket(baseUrl, clientId, connected && clientId.length > 0);

  const fileInput = useRef<HTMLInputElement>(null);
  const io = useWorkflowIo();
  const name = useGraphStore((state) => state.name);
  const setName = useGraphStore((state) => state.setName);
  const openFile = (): void => fileInput.current?.click();
  // ほかの種別が引き受けるファイル（キャラクターカード・会話）を先に試し、ほかはワークフローとして開く
  const openAnyFile = async (file: File | undefined): Promise<void> => {
    if (file !== undefined && (await openOther(file))) return;
    await io.openFile(file);
  };
  // ヘッダーのハンバーガーメニューで出すワークフローの一覧。開いたタブのもの
  const [workflowList, setWorkflowList] = useTabState('comfy.workflowList', false);
  // ワークフローを開いていないタブでは、つないでいる間いつも出す
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
    onRename: setName,
    workspace: (
      <>
        <ComfyWorkspace />
        {/* ハンバーガーメニューで出すワークフローの一覧 */}
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
    // 実行・キュー・スタイル・設定は**タブの外**に置く。接続先は 1 つなので、
    // ComfyUI のタブのどれを見ていても同じものが右（または下）に出る
    side: <SidePanel />,
    // 埋め込みのダイアログの嵌め先を右の列まで広げて置く。会話のタブでは、会話の画像から開いた
    // 画像のビューワーを、会話の欄の右から右の列までに重ねる
    overlay: <ComfyEmbedHost />,
    overlayOnOthers: <ViewerHost />,
    header: <WorkflowFileInput openFile={openAnyFile} fileInput={fileInput} />,
    // キューの見張りと繰り返しの送り。どの種別のタブを見ていても続ける
    background: <ComfyBackground />,
    toasts: <WorkflowIoToasts saveState={io.saveState} fileError={io.fileError} />,
    dialogs: (
      <>
        {/* 上書きは取り返しがつかないので、中央のダイアログで確かめる */}
        <ConfirmDialog
          open={io.saveState.kind === 'exists'}
          title={t('app.overwrite.title')}
          description={
            io.saveState.kind === 'exists'
              ? t('app.overwrite.description', { path: io.saveState.path })
              : ''
          }
          confirmLabel={t('app.overwrite.confirm')}
          onConfirm={() => void io.confirmOverwrite()}
          onCancel={io.resetSaveState}
        />

        {/* 一覧から選んだワークフローで直しかけのタブを替えるときに確かめる */}
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
        {/* 画像のビューワーの別窓の出し先。どのタブからでも同じ 1 つ */}
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

/** 見ているタブが、ワークフローを開いていない ComfyUI のタブか（画像のタブは含めない） */
function useEmptyWorkflowTab(): boolean {
  const hasWorkflow = useGraphStore((state) => state.workflow !== null);
  const imageTab = useTabsStore((state) =>
    state.tabs.some((tab) => tab.id === state.activeId && tab.kind === 'image'),
  );
  return !hasWorkflow && !imageTab;
}
