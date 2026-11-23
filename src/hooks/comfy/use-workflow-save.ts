import { useCallback, useState } from 'react';

import { saveTarget, type SaveTarget } from '@/graph/workflow-name';
import { t } from '@/i18n';
import type { WorkflowSaveFailure } from '@/port/workflows';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { serializeWorkflow } from '@/store/persist/workflow-file';
import { comfyPort } from '@/store/ports/comfy-port';
import { useGraphStore } from '@/store/use-graph-store';
import { useTabsStore } from '@/store/use-tabs-store';

interface SaveDraft {
  readonly tabId: string;
  readonly baseUrl: string;
  readonly content: string;
}

export type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved'; readonly path: string }
  | { readonly kind: 'exists'; readonly path: string; readonly draft: SaveDraft }
  | { readonly kind: 'shared'; readonly target: SaveTarget; readonly draft: SaveDraft }
  | { readonly kind: 'error'; readonly message: string };

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

function draftOf(baseUrl: string): SaveDraft | null {
  const { workflow } = useGraphStore.getState();
  if (!workflow) return null;
  const content = serializeWorkflow(workflow, { created: true });
  return { tabId: useTabsStore.getState().activeId, baseUrl, content };
}

function openElsewhere(path: string, baseUrl: string, tabId: string): boolean {
  const tabs = useTabsStore.getState();
  return tabs.tabs.some((tab) => {
    if (tab.id === tabId || tab.kind !== 'workflow') return false;
    const snapshot = tabs.readTab(tab.id);
    return snapshot?.savedPath === path && snapshot.savedOn === baseUrl;
  });
}

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

  const resetSaveState = useCallback((): void => setSaveState({ kind: 'idle' }), []);

  const write = useCallback(
    async (target: SaveTarget, draft: SaveDraft): Promise<void> => {
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
    const target = saveTarget(savedPath, currentName);
    if (openElsewhere(target.path, baseUrl, draft.tabId)) {
      setSaveState({ kind: 'shared', target, draft });
      return;
    }
    await write(target, draft);
  }, [baseUrl, setSaveAsOpen, write]);

  const saveAs = useCallback(
    async (nextName: string): Promise<void> => {
      setSaveAsOpen(false);
      const graph = useGraphStore.getState();
      graph.setName(nextName);
      const draft = draftOf(baseUrl);
      if (draft === null) return;
      await write({ path: saveTarget(graph.savedPath, nextName).path, overwrite: false }, draft);
    },
    [baseUrl, setSaveAsOpen, write],
  );

  const confirmOverwrite = useCallback(async (): Promise<void> => {
    const confirmed = confirmedWriteOf(saveState);
    if (confirmed !== null) await write(confirmed.target, confirmed.draft);
  }, [saveState, write]);

  return { saveState, setSaveState, resetSaveState, save, saveAs, confirmOverwrite };
}

function confirmedWriteOf(
  state: SaveState,
): { readonly target: SaveTarget; readonly draft: SaveDraft } | null {
  if (state.kind === 'shared') return state;
  if (state.kind === 'exists') return { target: { path: state.path, overwrite: true }, ...state };
  return null;
}
