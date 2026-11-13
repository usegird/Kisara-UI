import { useCallback, useState } from 'react';

import { saveTarget, type SaveTarget } from '@/graph/workflow-name';
import { t } from '@/i18n';
import type { WorkflowSaveFailure } from '@/port/workflows';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { serializeWorkflow } from '@/store/persist/workflow-file';
import { comfyPort } from '@/store/ports/comfy-port';
import { useGraphStore } from '@/store/use-graph-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// ComfyUI の `workflows/` への保存。書き込みは押した本人の意思でしか走らせない。
// ─────────────────────────────

/** 書く 1 回分。中身と、どのタブ・どの接続先のものかを押した時点で控える */
interface SaveDraft {
  readonly tabId: string;
  readonly baseUrl: string;
  readonly content: string;
}

/**
 * ComfyUI への保存の状態。KisaraUI が作った同名があったときは上書きの可否を呼び出し側で尋ねる。
 * 確かめる間に書く中身は、同名で止まった時点の控え（`draft`）。タブが変わっても変わらない
 */
export type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved'; readonly path: string }
  | { readonly kind: 'exists'; readonly path: string; readonly draft: SaveDraft }
  | { readonly kind: 'error'; readonly message: string };

/**
 * 上書き保存できる保存先か。今の接続先のもので、KisaraUI が作ったファイルだけ。
 * 保存先が無いときは false（名前を付けて保存になる）
 */
export function canOverwrite(
  saved: {
    readonly savedPath: string | null;
    readonly savedOn: string | null;
    readonly savedOwn: boolean;
  },
  baseUrl: string,
): boolean {
  return saved.savedPath !== null && saved.savedOwn && saved.savedOn === baseUrl;
}

function failureMessage(failure: WorkflowSaveFailure | null, path: string, error: unknown): string {
  if (failure === 'exists-foreign') return t('comfy.saveGuard.existsForeign', { path });
  if (failure === 'not-owned') return t('comfy.saveGuard.notOwned', { path });
  return formatComfyFailure(error);
}

/** 押した時点のアクティブなタブの中身を控える（作った印を付ける）。ワークフローが無ければ null */
function draftOf(baseUrl: string): SaveDraft | null {
  const { workflow } = useGraphStore.getState();
  if (!workflow) return null;
  const content = serializeWorkflow(workflow, { created: true });
  return { tabId: useTabsStore.getState().activeId, baseUrl, content };
}

/**
 * ComfyUI へ保存する手続きとその状態を返す。
 * @param baseUrl - 今の接続先
 * @param setSaveAsOpen - 名前を尋ねるダイアログの開閉
 */
export function useWorkflowSave(
  baseUrl: string,
  setSaveAsOpen: (open: boolean) => void,
): {
  readonly saveState: SaveState;
  readonly setSaveState: (state: SaveState) => void;
  readonly resetSaveState: () => void;
  readonly save: () => Promise<void>;
  readonly saveAs: (name: string) => Promise<void>;
  readonly confirmOverwrite: () => Promise<void>;
} {
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });

  // compiler はこのフックを飛ばす（try の中の条件式や ?. を扱えない）。手続きはファイルの受け口などの
  // effect の依存になるので、手で固定する
  const resetSaveState = useCallback((): void => setSaveState({ kind: 'idle' }), []);

  /**
   * ComfyUI の `workflows/` に書き込む。**確かめてよいと決まっていなければ上書きしない**
   * （同名なら 409 → KisaraUI が作ったものなら確認、そうでなければ別の名前を求める）。
   * 上書きする先は通信の層が書く直前に読み、KisaraUI が作ったものでなければ書かない
   */
  const write = useCallback(
    async (target: SaveTarget, draft: SaveDraft): Promise<void> => {
      // 控えた後に接続先が変わったら、別の ComfyUI へは書かない
      if (draft.baseUrl !== baseUrl) {
        setSaveState({ kind: 'error', message: t('comfy.saveGuard.connectionChanged') });
        return;
      }
      const sameTab = (): boolean => useTabsStore.getState().activeId === draft.tabId;
      setSaveState({ kind: 'saving' });
      try {
        await comfyPort().workflows.save(baseUrl, target.path, draft.content, {
          overwrite: target.overwrite,
        });
        // 書いている間に別のタブへ移っていたら、そのタブの印は触らない。書いている間に直した分
        // （と、同名で止まった後に直した分）は書いていないので、未保存の印を残す
        if (sameTab()) {
          const { workflow } = useGraphStore.getState();
          const unchanged =
            workflow !== null && serializeWorkflow(workflow, { created: true }) === draft.content;
          useGraphStore.getState().markSaved(target.path, baseUrl, unchanged);
        }
        setSaveState({ kind: 'saved', path: target.path });
      } catch (error) {
        const failure = comfyPort().workflows.saveFailure(error);
        if (failure === 'exists') {
          setSaveState({ kind: 'exists', path: target.path, draft });
          return;
        }
        if (failure === 'not-owned' && sameTab()) useGraphStore.getState().disownSaved();
        setSaveState({ kind: 'error', message: failureMessage(failure, target.path, error) });
        // KisaraUI が作っていないファイルには書かないので、別の名前を求める
        if (failure !== null && sameTab()) setSaveAsOpen(true);
      }
    },
    [baseUrl, setSaveAsOpen],
  );

  const save = useCallback(async (): Promise<void> => {
    const { savedPath, name: currentName } = useGraphStore.getState();
    const draft = draftOf(baseUrl);
    if (draft === null) return;

    if (savedPath === null || !canOverwrite(useGraphStore.getState(), baseUrl)) {
      setSaveAsOpen(true);
      return;
    }
    await write(saveTarget(savedPath, currentName), draft);
  }, [baseUrl, setSaveAsOpen, write]);

  const saveAs = useCallback(
    async (nextName: string): Promise<void> => {
      setSaveAsOpen(false);
      const graph = useGraphStore.getState();
      graph.setName(nextName);
      const draft = draftOf(baseUrl);
      if (draft === null) return;
      // 別名なので、同じ行き先になっても一度は確かめる
      await write({ path: saveTarget(graph.savedPath, nextName).path, overwrite: false }, draft);
    },
    [baseUrl, setSaveAsOpen, write],
  );

  // 確かめた中身（同名で止まった時点の控え）を書く。今のタブの中身ではない
  const confirmOverwrite = useCallback(async (): Promise<void> => {
    if (saveState.kind !== 'exists') return;
    await write({ path: saveState.path, overwrite: true }, saveState.draft);
  }, [saveState, write]);

  return { saveState, setSaveState, resetSaveState, save, saveAs, confirmOverwrite };
}
