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

// ─────────────────────────────
// 実行の記録のストアの slice が共有する、読み込みの手掛かりと、セッションの記録を手元に用意する・
// 書く（1 本ずつ）手続き。ストアは 1 つなので、手掛かりはここに持つ。
// ─────────────────────────────

/** 覚えておく送った Workflow JSON の上限（大きいので、記録できないまま溜め続けない） */
const SENT_WORKFLOW_LIMIT = 200;

/** 記録のファイル名の後ろ */
const RUN_HISTORY_EXTENSION = '.json';

/** 実行の記録のストアの set */
type RunHistorySet = StoreApi<RunHistoryState>['setState'];

/** 読み込みと書き込みの手掛かり（状態に置かない。描画には要らない） */
interface RunHistoryLoading {
  /** 読み込みの世代（接続先を変えたあとに古い結果を書き込まない） */
  generation: number;
  /** 中身を読んだ・読んでいるファイル名（重ねて読まない。読み直しで忘れる） */
  readonly requested: Set<string>;
  /** prompt id → このタブから送った Workflow JSON。書けたら手放す */
  readonly sent: Map<string, unknown>;
  /**
   * 手元に持つ、このブラウザのタブのセッションの記録（接続先とセッション → 中身）。
   * 書くたびに読み直さない（書き手はセッションを持つブラウザのタブだけ）
   */
  readonly owned: Map<string, RunHistoryFile>;
}

/** 読み込みと書き込みの手掛かり */
export const runHistoryLoading: RunHistoryLoading = {
  generation: 0,
  requested: new Set(),
  sent: new Map(),
  owned: new Map(),
};

/** 書き込みは 1 本ずつ（同じファイルを重ねて書かない） */
let writing: Promise<void> = Promise.resolve();

/** このタブから送った実行を覚える。上限を超えたら古いものから手放す */
export function rememberSentWorkflow(promptId: string, workflow: unknown): void {
  const { sent } = runHistoryLoading;
  sent.set(promptId, workflow);
  trim(sent, SENT_WORKFLOW_LIMIT);
}

/** セッションの名前を控える。変わらなければ置き換えない（購読している部品を描き直さない） */
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

/** セッションの記録を手元に用意する（最初に 1 回だけ読む） */
export async function ownFile(baseUrl: string, session: string): Promise<RunHistoryFile> {
  const { owned } = runHistoryLoading;
  const key = ownedKey(baseUrl, session);
  const kept = owned.get(key);
  if (kept !== undefined) return kept;
  const read = await comfyPort().runHistory.fetch(baseUrl, runHistoryFileName(session));
  // 形の違うファイルには書かない（上書きして消さない）
  if (read.kind === 'unreadable') throw new Error(t('api.runHistory.unexpected'));
  const file = read.kind === 'file' ? read.file : EMPTY_RUN_HISTORY;
  owned.set(key, file);
  return file;
}

/** セッションの記録を書き、手元の分も替える */
export async function saveOwn(
  baseUrl: string,
  session: string,
  file: RunHistoryFile,
): Promise<void> {
  await comfyPort().runHistory.save(baseUrl, runHistoryFileName(session), file);
  runHistoryLoading.owned.set(ownedKey(baseUrl, session), file);
}

/** 書き込みは 1 本ずつ。失敗したら次は読み直してから書く */
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

/**
 * `/history` の応答から、このブラウザのタブのセッションで送った実行だけを、セッションごとの
 * ファイルに書く（ほかの画面の分を混ぜない）。送った Workflow JSON が手元にあればそれで書く
 * （`/history` のものは書き換わりうる）
 */
export async function writeRuns(baseUrl: string, raw: unknown): Promise<void> {
  const { sent } = runHistoryLoading;
  const definitions = useDefinitionsStore.getState().definitions;
  for (const [session, sources] of ownSourcesOf(raw)) {
    // セッションで最初に書く前に 1 回だけ読む（読み込み直したタブは前の続きから足す）
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
    // 書けたら手放す（書けなければ投げて、次の取り直しでもう一度書く）
    for (const source of sources) sent.delete(source.promptId);
  }
}

/** このブラウザのタブのセッションで送った実行を、セッションごとに分ける */
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

/**
 * モデルの区分を決める一覧（書くときに区分を決める）。取れていなければ空
 */
function modelKindNames(): ModelKindNames {
  const folders = useModelFilesStore.getState().folders;
  const names = (folder: string): Iterable<string> => folders.get(folder)?.index.keys() ?? [];
  return {
    loraNames: new Set(names(LORA_FOLDER)),
    modelNames: new Set([...names(CHECKPOINT_FOLDER), ...names(DIFFUSION_MODEL_FOLDER)]),
  };
}

/** この画面から送った実行のワークフロー名 */
function sentNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const entry of useTaskLogStore.getState().entries) {
    if (entry.name !== null) names.set(entry.promptId, entry.name);
  }
  return names;
}

/** 入れた順に並ぶ集まりを、古いものから手放して上限に収める */
function trim(items: Map<string, unknown>, limit: number): void {
  for (const key of items.keys()) {
    if (items.size <= limit) break;
    items.delete(key);
  }
}

function ownedKey(baseUrl: string, session: string): string {
  return `${baseUrl}#${session}`;
}

/**
 * セッションの記録のファイル名
 */
function runHistoryFileName(session: string): string {
  return `${session}${RUN_HISTORY_EXTENSION}`;
}
