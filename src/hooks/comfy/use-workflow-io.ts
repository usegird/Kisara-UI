import { useState } from 'react';

import type { WorkflowTemplate } from '@/graph/template-filter';
import { useWorkflowOpen, type OpenOptions } from '@/hooks/comfy/use-workflow-open';
import { useWorkflowSave, type SaveState } from '@/hooks/comfy/use-workflow-save';
import { useTabState } from '@/hooks/flow/use-tab-state';
import type { SavedWorkflow } from '@/port/workflows';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// ワークフローの出し入れ（開く・エクスポート・ComfyUI へ保存）。どれもアクティブなタブに効く。
// ComfyUI 側は読み書きとも `userdata` 経由。書き込みは押した本人の意思でしか走らせない。
// ─────────────────────────────

/**
 * ワークフローを読めなかった理由。**失敗のたびに別のものを作る**
 * （同じ理由で続けて失敗しても、知らせ直せるように）
 */
export interface FileError {
  readonly message: string;
}

/** ワークフローの開く・書き出す・保存する手続きと、そのダイアログの開閉と結果 */
export interface WorkflowIo {
  readonly openFile: (file: File | undefined) => Promise<void>;
  readonly openFromServer: (workflow: SavedWorkflow, options?: OpenOptions) => Promise<void>;
  /**
   * 同梱のテンプレートを開く。保存先は持たない。
   */
  readonly openTemplate: (template: WorkflowTemplate) => Promise<void>;
  /**
   * ノードの無いワークフローを開く。保存先は持たない。
   */
  readonly openEmpty: () => void;
  readonly exportWorkflow: () => void;
  /**
   * 上書き保存。保存先がまだ無い・上書きできない保存先なら名前を尋ねる。
   */
  readonly save: () => Promise<void>;
  /** 名前を付けて保存。タブの名前を変えてから書く */
  readonly saveAs: (name: string) => Promise<void>;
  /** 同名があったときに、上書きを認めて書き直す */
  readonly confirmOverwrite: () => Promise<void>;
  readonly templatesOpen: boolean;
  readonly setTemplatesOpen: (open: boolean) => void;
  readonly saveAsOpen: boolean;
  readonly setSaveAsOpen: (open: boolean) => void;
  readonly fileError: FileError | null;
  readonly saveState: SaveState;
  readonly resetSaveState: () => void;
  /** 直しかけのタブを替えてよいかを確かめている間の、開こうとしたワークフロー */
  readonly pendingSwitch: SavedWorkflow | null;
  /** 確かめて替える（今のタブの直しかけは捨てる） */
  readonly confirmSwitch: () => void;
  readonly cancelSwitch: () => void;
}

/** アクティブなタブへワークフローを開く・書き出す・ComfyUI へ保存する手続きを返す */
export function useWorkflowIo(): WorkflowIo {
  // 開く手続きと保存の手続きは隣のフックにある。ここで受ける戻り値を compiler に揃えさせない
  // （揃えると、部品の分け方で描き直しの回数が変わる。手続きはどれも隣で手で固定している）
  'use no memo';
  const baseUrl = useSettingsStore((state) => state.baseUrl);

  // ダイアログは開いたタブのもの（切り替えたら隠し、戻ったら開き直す）
  const [templatesOpen, setTemplatesOpen] = useTabState('workflowIo.templates', false);
  const [saveAsOpen, setSaveAsOpen] = useTabState('workflowIo.saveAs', false);
  const [pendingSwitch, setPendingSwitch] = useTabState<SavedWorkflow | null>(
    'workflowIo.pendingSwitch',
    null,
  );
  const [fileError, setFileError] = useState<FileError | null>(null);

  const { saveState, setSaveState, resetSaveState, save, saveAs, confirmOverwrite } =
    useWorkflowSave(baseUrl, setSaveAsOpen);
  const { openFile, openFromServer, openTemplate, openEmpty, exportWorkflow } = useWorkflowOpen(
    baseUrl,
    { setFileError, setSaveState, setTemplatesOpen, setPendingSwitch },
  );

  // 直しかけのタブを替えることを認めたら、確かめた時点のタブのまま開く
  const confirmSwitch = (): void => {
    if (pendingSwitch === null) return;
    setPendingSwitch(null);
    void openFromServer(pendingSwitch, { here: true, confirmed: true });
  };
  const cancelSwitch = (): void => setPendingSwitch(null);

  return {
    pendingSwitch,
    confirmSwitch,
    cancelSwitch,
    openFile,
    openFromServer,
    openTemplate,
    openEmpty,
    exportWorkflow,
    save,
    saveAs,
    confirmOverwrite,
    templatesOpen,
    setTemplatesOpen,
    saveAsOpen,
    setSaveAsOpen,
    fileError,
    saveState,
    resetSaveState,
  };
}
