import { ContextMenuItem } from '@/components/ui/context-menu';
import type { WorkflowIo } from '@/hooks/comfy/use-workflow-io';
import { canOverwrite } from '@/hooks/comfy/use-workflow-save';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// ワークフローのタブの右クリックメニューに差し込む保存の項目。「閉じる」はタブ種別に依存しないので
// 外枠が足す。アクティブなタブのメニューにだけ出るので、どれもアクティブなタブに効く。
// ─────────────────────────────

/** 保存の項目の props */
export interface WorkflowTabMenuProps {
  /** 保存・エクスポートの手続き */
  readonly io: WorkflowIo;
  /** 接続中か。つないでいなければ保存は押せない */
  readonly connected: boolean;
}

/** 上書き保存・名前を付けて保存・エクスポートの項目を並べる */
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

/**
 * 上書き保存できない理由。押せるなら null（保存先がまだ無いときも押せて、名前を付けて保存になる）。
 * 押せるのは、KisaraUI が作ったファイルを今の接続先で開いたときだけ
 */
function useOverwriteBlock(): string | null {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  return useGraphStore((state) => {
    if (state.savedPath === null || canOverwrite(state, baseUrl)) return null;
    return t(state.savedOwn ? 'comfy.saveGuard.otherServerTitle' : 'comfy.saveGuard.notOwnedTitle');
  });
}
