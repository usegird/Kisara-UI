import { useCallback } from 'react';

import { loadBuiltinWorkflow } from '@/graph/builtin-workflows';
import { emptyWorkflow } from '@/graph/normalize';
import type { WorkflowTemplate } from '@/graph/template-filter';
import { workflowDisplayName, workflowFileName } from '@/graph/workflow-name';
import { readOpenedFile, WORKFLOW_FILE_MAX_BYTES } from '@/graph/workflow-source';
import type { FileError } from '@/hooks/comfy/use-workflow-io';
import type { SaveState } from '@/hooks/comfy/use-workflow-save';
import { t } from '@/i18n';
import { downloadText } from '@/lib/download';
import { isTooLarge, wholeMegabytes } from '@/lib/file-size';
import type { SavedWorkflow } from '@/port/workflows';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { openWorkflow, serializeWorkflow } from '@/store/persist/workflow-file';
import { comfyPort } from '@/store/ports/comfy-port';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useImageTabsStore } from '@/store/use-image-tabs-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// ワークフローを開く・書き出す手続き。どれもアクティブなタブに効く。ComfyUI 側は読み取りだけ。
// ─────────────────────────────

/** 保存されたワークフローの開き方 */
export interface OpenOptions {
  /**
   * 今のタブの中身を替える（ワークフローの一覧の行）。直しかけのタブなら、
   * 替えてよいかを確かめてから替える（`pendingSwitch`）。無ければ、今のタブが空のときだけそこで開き、
   * ほかは新しいタブ
   */
  readonly here?: boolean | undefined;
  /** 直しかけのタブを替えることを確かめ済み */
  readonly confirmed?: boolean | undefined;
}

/** 開く手続きが結果を返す先。どれも React の状態の更新なので変わらない */
interface OpenSinks {
  readonly setFileError: (error: FileError | null) => void;
  readonly setSaveState: (state: SaveState) => void;
  readonly setTemplatesOpen: (open: boolean) => void;
  readonly setPendingSwitch: (workflow: SavedWorkflow | null) => void;
}

/** 同じ接続先の同じファイルを開いているワークフローのタブ。無ければ null */
function openTabOf(path: string, baseUrl: string): string | null {
  const tabs = useTabsStore.getState();
  const found = tabs.tabs.find((tab) => {
    if (tab.kind !== 'workflow') return false;
    const snapshot = tabs.readTab(tab.id);
    return snapshot?.savedPath === path && snapshot.savedOn === baseUrl;
  });
  return found?.id ?? null;
}

/** 今のタブがワークフローのタブか（中身を替えられるか） */
function onWorkflowTab(): boolean {
  const { tabs, activeId } = useTabsStore.getState();
  return tabs.some((tab) => tab.id === activeId && tab.kind === 'workflow');
}

/** 読み取ったファイルをタブへ開く。ワークフローを持たない画像は画像のタブに出す */
async function openReadFile(file: File): Promise<void> {
  // 読めない形なら、タブを用意する前に断る。`prompt` だけの PNG は、今の定義で値と入力の口を
  // 分けて組み立てる
  const { definitions } = useDefinitionsStore.getState();
  const opened = readOpenedFile(await file.arrayBuffer(), definitions);
  // PNG は書き出した画像の名前（拡張子を除く）
  const name = workflowDisplayName(file.name.replace(/\.png$/i, ''));
  if (opened.kind === 'image') {
    // ワークフローを持たない画像は、画像のタブで埋め込みを見せる
    const id = useTabsStore.getState().openImageTab(name);
    useImageTabsStore
      .getState()
      .put(id, { url: URL.createObjectURL(file), texts: [...opened.texts] });
    return;
  }
  // 中身のあるタブを開いていたら、新しいタブへ開く
  useTabsStore.getState().prepareOpen();
  openWorkflow(opened.source, name);
}

// 書き出すのは押した時点のワークフロー。購読はしない（外殻ごと、編集のたびに描き直しになる）
function exportWorkflow(): void {
  const { workflow, name } = useGraphStore.getState();
  if (!workflow) return;

  downloadText(serializeWorkflow(workflow), workflowFileName(name), 'application/json');
}

/** ワークフローを開く・書き出す手続きを返す。結果は受け取った状態の更新へ渡す */
export function useWorkflowOpen(
  baseUrl: string,
  { setFileError, setSaveState, setTemplatesOpen, setPendingSwitch }: OpenSinks,
): {
  readonly openFile: (file: File | undefined) => Promise<void>;
  readonly openFromServer: (workflow: SavedWorkflow, options?: OpenOptions) => Promise<void>;
  readonly openTemplate: (template: WorkflowTemplate) => Promise<void>;
  readonly openEmpty: () => void;
  readonly exportWorkflow: () => void;
} {
  // 手続きはファイルの受け口などの effect の依存になるので、手で固定する
  const openFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setFileError(null);
      setSaveState({ kind: 'idle' });
      // 丸ごと読む前に大きさを見る（巨大なファイルで画面を止めない）
      if (isTooLarge(file, WORKFLOW_FILE_MAX_BYTES)) {
        const size = wholeMegabytes(WORKFLOW_FILE_MAX_BYTES);
        setFileError({ message: t('common.fileTooLarge', { name: file.name, size }) });
        return;
      }
      try {
        await openReadFile(file);
      } catch (error) {
        setFileError({ message: formatComfyFailure(error) });
      }
    },
    [setFileError, setSaveState],
  );

  // ComfyUI に保存されているワークフローを開く（読み取りだけ）。
  // 同じ接続先の同じファイルをタブで開いていれば、そのタブへ移る
  const openFromServer = useCallback(
    async (saved: SavedWorkflow, options: OpenOptions = {}) => {
      setFileError(null);
      setSaveState({ kind: 'idle' });
      const open = openTabOf(saved.path, baseUrl);
      if (open !== null) {
        useTabsStore.getState().selectTab(open);
        return;
      }
      const here = options.here === true && onWorkflowTab();
      // 直しかけのタブを替えるときは、先に確かめる（取りに行く前に）
      if (here && options.confirmed !== true && useGraphStore.getState().dirty) {
        setPendingSwitch(saved);
        return;
      }
      try {
        const workflow = await comfyPort().workflows.fetch(baseUrl, saved.path);
        if (!here) useTabsStore.getState().prepareOpen();
        openWorkflow(workflow, saved.name, {
          path: saved.path,
          baseUrl,
        });
      } catch (error) {
        setFileError({ message: formatComfyFailure(error) });
      }
    },
    [baseUrl, setFileError, setPendingSwitch, setSaveState],
  );

  // 同梱のテンプレートを開く。名前は題名、**保存先は持たない**（接続先の保存物ではない）
  const openTemplate = useCallback(
    async (template: WorkflowTemplate) => {
      setTemplatesOpen(false);
      setFileError(null);
      setSaveState({ kind: 'idle' });
      try {
        // 標準のワークフローは同梱のものを開く（取りに行かない）
        const raw = await (loadBuiltinWorkflow(template) ??
          comfyPort().workflows.fetchTemplate(baseUrl, template.name));
        useTabsStore.getState().prepareOpen();
        openWorkflow(raw, template.title);
      } catch (error) {
        setFileError({ message: formatComfyFailure(error) });
      }
    },
    [baseUrl, setFileError, setSaveState, setTemplatesOpen],
  );

  const openEmpty = useCallback((): void => {
    setFileError(null);
    setSaveState({ kind: 'idle' });
    useTabsStore.getState().prepareOpen();
    openWorkflow(emptyWorkflow(), '');
  }, [setFileError, setSaveState]);

  return { openFile, openFromServer, openTemplate, openEmpty, exportWorkflow };
}
