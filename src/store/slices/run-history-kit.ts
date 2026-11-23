import type { StoreApi } from 'zustand';

import { CHECKPOINT_FOLDER, DIFFUSION_MODEL_FOLDER, LORA_FOLDER } from '@/graph/model-files';
import { t } from '@/i18n';
import type { HistoryRunSource, RunHistoryFile } from '@/port/run-history';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { addRuns, EMPTY_RUN_HISTORY } from '@/queue/run-history';
import type { ModelKindNames } from '@/queue/task-detail';
import { comfyPort } from '@/store/ports/comfy-port';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useModelFilesStore } from '@/store/use-model-files-store';
import type { RunHistoryState } from '@/store/use-run-history-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { ownSessions, useTabsStore } from '@/store/use-tabs-store';
import { useTaskLogStore } from '@/store/use-task-log-store';

const SENT_WORKFLOW_LIMIT = 200;

const RUN_HISTORY_EXTENSION = '.json';

type RunHistorySet = StoreApi<RunHistoryState>['setState'];

interface RunHistoryLoading {
  generation: number;
  readonly requested: Set<string>;
  readonly sent: Map<string, unknown>;
  readonly owned: Map<string, RunHistoryFile>;
}

export const runHistoryLoading: RunHistoryLoading = {
  generation: 0,
  requested: new Set(),
  sent: new Map(),
  owned: new Map(),
};

let writing: Promise<void> = Promise.resolve();

export function rememberSentWorkflow(promptId: string, workflow: unknown): void {
  const { sent } = runHistoryLoading;
  sent.set(promptId, workflow);
  trim(sent, SENT_WORKFLOW_LIMIT);
}

export function rememberName(
  store: { readonly set: RunHistorySet; readonly get: () => RunHistoryState },
  session: string,
  name: string,
): void {
  const names = store.get().sessionNames;
  if ((names.get(session) ?? '') === name) return;
  const next = new Map(names);
  if (name.length === 0) next.delete(session);
  else next.set(session, name);
  store.set({ sessionNames: next });
}

export async function ownFile(baseUrl: string, session: string): Promise<RunHistoryFile> {
  const { owned } = runHistoryLoading;
  const key = ownedKey(baseUrl, session);
  const kept = owned.get(key);
  if (kept !== undefined) return kept;
  const read = await comfyPort().runHistory.fetch(baseUrl, runHistoryFileName(session));
  if (read.kind === 'unreadable') throw new Error(t('api.runHistory.unexpected'));
  const file = read.kind === 'file' ? read.file : EMPTY_RUN_HISTORY;
  owned.set(key, file);
  return file;
}

export async function saveOwn(
  baseUrl: string,
  session: string,
  file: RunHistoryFile,
): Promise<void> {
  await comfyPort().runHistory.save(baseUrl, runHistoryFileName(session), file);
  runHistoryLoading.owned.set(ownedKey(baseUrl, session), file);
}

export function forgetOwn(baseUrl: string, session: string): void {
  runHistoryLoading.owned.delete(ownedKey(baseUrl, session));
}

export function keptOwn(baseUrl: string, session: string): RunHistoryFile | undefined {
  return runHistoryLoading.owned.get(ownedKey(baseUrl, session));
}

export function queueWrite(set: RunHistorySet, task: () => Promise<void>): Promise<void> {
  writing = writing.then(async () => {
    try {
      await task();
    } catch (error) {
      runHistoryLoading.owned.clear();
      set({ error: formatComfyFailure(error) });
    }
  });
  return writing;
}

export async function writeRuns(baseUrl: string, raw: unknown): Promise<void> {
  const { sent } = runHistoryLoading;
  const definitions = useDefinitionsStore.getState().definitions;
  for (const [session, sources] of ownSourcesOf(raw)) {
    const file = await ownFile(baseUrl, session);
    const next = addRuns({
      file,
      sources,
      definitions,
      kinds: modelKindNames(),
      names: sentNames(),
      limit: useSettingsStore.getState().runHistoryLimit,
    });
    if (next !== file) await saveOwn(baseUrl, session, next);
    for (const source of sources) sent.delete(source.promptId);
  }
}

function ownSourcesOf(raw: unknown): Map<string, HistoryRunSource[]> {
  const own = ownSessions(useTabsStore.getState());
  const bySession = new Map<string, HistoryRunSource[]>();
  for (const source of comfyPort().runHistory.sourcesOf(raw)) {
    if (source.session === null || !own.includes(source.session)) continue;
    const kept = runHistoryLoading.sent.get(source.promptId);
    const item = kept === undefined ? source : { ...source, workflow: kept, sent: true };
    bySession.set(source.session, [...(bySession.get(source.session) ?? []), item]);
  }
  return bySession;
}

function modelKindNames(): ModelKindNames {
  const folders = useModelFilesStore.getState().folders;
  const names = (folder: string): Iterable<string> => folders.get(folder)?.index.keys() ?? [];
  return {
    loraNames: new Set(names(LORA_FOLDER)),
    modelNames: new Set([...names(CHECKPOINT_FOLDER), ...names(DIFFUSION_MODEL_FOLDER)]),
  };
}

function sentNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const entry of useTaskLogStore.getState().entries) {
    if (entry.name !== null) names.set(entry.promptId, entry.name);
  }
  return names;
}

function trim(items: Map<string, unknown>, limit: number): void {
  for (const key of items.keys()) {
    if (items.size <= limit) break;
    items.delete(key);
  }
}

function ownedKey(baseUrl: string, session: string): string {
  return `${baseUrl}#${session}`;
}

function runHistoryFileName(session: string): string {
  return `${session}${RUN_HISTORY_EXTENSION}`;
}

export function sessionOfFileName(name: string): string {
  return name.endsWith(RUN_HISTORY_EXTENSION) ? name.slice(0, -RUN_HISTORY_EXTENSION.length) : name;
}
