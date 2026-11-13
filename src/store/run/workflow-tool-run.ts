import { runsWithoutConfirm } from '@/chat/tool-approval';
import { parseToolArguments } from '@/chat/tool-arguments';
import type { ToolCallRecord } from '@/chat/types';
import { overlayArgumentValues, type ArgumentValues } from '@/graph/workflow-tool';
import { t } from '@/i18n';
import type { LlmFailure } from '@/port/llm-port';
import { openWorkflow } from '@/store/persist/workflow-file';
import { comfyPort } from '@/store/ports/comfy-port';
import { submitRun, tabRunSource } from '@/store/run/run-submit';
import { placeArgumentImages } from '@/store/run/workflow-tool-images';
import { startToolRunWatch, watching } from '@/store/run/workflow-tool-watch';
import { receiveFreshToolCalls, useChatStore, type ToolCallAttempt } from '@/store/use-chat-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore, type ComfyToolTarget } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';
import {
  chatWorkflowTools,
  followTab,
  resolveTargetTab,
  type ActiveWorkflowTool,
} from '@/store/use-workflow-tools-store';

// ─────────────────────────────
// 会話から呼んだワークフローの実行（承諾の関門）。`POST /prompt` は GPU を消費するので、実行の入口は
// 人が押す 3 つの関数と、受け取った呼び出しの受け手の 2 種だけにし、実行の関数（`execute`）は外に出さない。
// 完了の見張りは workflow-tool-watch.ts。
// ─────────────────────────────

/** どの会話の・どの発言の・どの呼び出しか */
interface CallTarget {
  readonly chatId: string;
  readonly messageId: string;
  readonly callId: string;
}

/** 確かめた呼び出しの、呼ぶワークフローと引数の値 */
interface CheckedCall {
  readonly found: ActiveWorkflowTool;
  readonly values: ArgumentValues;
}

/** 実行を始めた呼び出し（二重に押しても 1 回だけ投げる） */
const starting = new Set<string>();

function findCall(chatId: string, messageId: string, callId: string): ToolCallRecord | null {
  const message = useChatStore.getState().chats[chatId]?.messages.find((m) => m.id === messageId);
  for (const candidate of message?.candidates ?? []) {
    const call = candidate.toolCalls?.find((item) => item.id === callId);
    if (call !== undefined) return call;
  }
  return null;
}

/**
 * 実行するタブ。選んだタブを優先し、無ければ保存先のパスを開いているタブ。どちらも無ければ
 * ファイルから新しいタブに開き、元のタブへ戻る。見つけた・開いたタブへ指す先を付け替える
 */
async function tabFor(target: ComfyToolTarget, baseUrl: string): Promise<string | null> {
  const open = resolveTargetTab(target, baseUrl);
  if (open !== null) {
    followTab(target, open, baseUrl);
    return open;
  }
  const path = target.path;
  if (path === null) return null;
  const raw = await comfyPort().workflows.fetch(baseUrl, path);
  const name = fileName(path);
  const tabs = useTabsStore.getState();
  const back = tabs.activeId;
  const tabId = tabs.addTab();
  try {
    openWorkflow(raw, name, { path, baseUrl });
  } catch {
    useTabsStore.getState().closeTab(tabId);
    useTabsStore.getState().selectTab(back);
    return null;
  }
  useTabsStore.getState().selectTab(back);
  followTab(target, tabId, baseUrl);
  return tabId;
}

/** ファイルの名前（拡張子を除いた最後の部分）。タブの名前に使う */
function fileName(path: string): string {
  return (path.split('/').at(-1) ?? path).replace(/\.json$/iu, '');
}

/** 呼び出しを実行する。承諾の関門を通った 2 つの入口からだけ呼ぶ（外に出さない） */
async function execute(chatId: string, messageId: string, callId: string): Promise<void> {
  const key = `${chatId}/${messageId}/${callId}`;
  const call = findCall(chatId, messageId, callId);
  if (call?.state.kind !== 'waiting' || starting.has(key)) return;
  const target: CallTarget = { chatId, messageId, callId };

  const checked = checkArguments(target, call);
  if (checked === null) return;

  const { baseUrl, clientId } = useSettingsStore.getState();
  if (baseUrl.length === 0 || clientId.length === 0) {
    failCall(target, t('llm.tool.notConnected'));
    return;
  }

  starting.add(key);
  try {
    await submitCall(target, checked, baseUrl);
  } finally {
    starting.delete(key);
  }
}

/** 呼び出しのワークフローと引数を確かめる。合わなければ合わないと記して null */
function checkArguments(target: CallTarget, call: ToolCallRecord): CheckedCall | null {
  const { chatId, messageId, callId } = target;
  const chat = useChatStore.getState().chats[chatId];
  const found = chatWorkflowTools(chat).find((item) => item.tool.name === call.name);
  const parsed = found === undefined ? null : parseToolArguments(found.args, call.arguments);
  if (found !== undefined && parsed?.ok === true) return { found, values: parsed.values };
  useChatStore.getState().setToolCall(chatId, messageId, callId, {
    kind: 'invalid',
    problem: parsed !== null && !parsed.ok ? parsed.problem : { code: 'unknown-tool' },
  });
  return null;
}

/** タブを決めて投入し、完了の見張りに載せる。途中で失敗したら失敗と記す */
async function submitCall(
  target: CallTarget,
  { found, values }: CheckedCall,
  baseUrl: string,
): Promise<void> {
  const { chatId, messageId, callId } = target;
  const tabId = await tabFor(found.target, baseUrl).catch(() => null);
  const source = tabId === null ? null : tabRunSource(tabId);
  if (source === null) {
    failCall(target, t('llm.tool.openFailed'));
    return;
  }
  // 画像の引数は、参照名の画像を置いた値に差し替える
  const placed = await placeArgumentImages(chatId, baseUrl, found.args, values);
  if (!placed.ok) {
    failCall(target, placed.message);
    return;
  }
  // LLM の引数はタブのアプリ入力の値に重ねて、実行のときだけ使う（タブの値は変えない）
  const promptId = await submitRun({
    ...source,
    appValues: overlayArgumentValues(
      source.workflow,
      useDefinitionsStore.getState().definitions,
      source.appValues,
      { args: found.args, values: placed.values },
    ),
  });
  if (promptId === null) {
    failCall(target, t('llm.tool.submitFailed'));
    return;
  }
  const outputs = found.tool.outputs;
  watching.set(promptId, { chatId, messageId, callId, outputs, files: [] });
  useChatStore.getState().setToolCall(chatId, messageId, callId, {
    kind: 'queued',
    promptId,
    ...(outputs.length === 0 ? {} : { outputs }),
  });
}

function failCall({ chatId, messageId, callId }: CallTarget, message: string): void {
  useChatStore.getState().setToolCall(chatId, messageId, callId, { kind: 'failed', message });
}

// 人が押す入口（呼び出しのカードの「承諾」・実行し直し・メッセージの「ワークフローを実行」）。
// 読める場所は lint で縛る

/**
 * 呼び出しを承諾して実行する（カードの「承諾」。人が押したときだけ呼ぶ）
 */
export function approveToolCall(chatId: string, messageId: string, callId: string): Promise<void> {
  return execute(chatId, messageId, callId);
}

/**
 * 呼び出しを `args` の引数で実行し直す（カードの「ワークフローを実行」。人が押したときだけ
 * 呼ぶ）。受け取り中・実行中は何もしない。前の実行は残し、合わない引数は合わない実行として残す。
 * 承諾を待つ呼び出しは、引数を差し替えて承諾する
 */
export function rerunToolCall(
  chatId: string,
  messageId: string,
  callId: string,
  args: string,
): Promise<void> {
  const kind = findCall(chatId, messageId, callId)?.state.kind;
  if (kind === undefined || kind === 'receiving' || kind === 'queued') return Promise.resolve();
  useChatStore.getState().restartToolCall(chatId, messageId, callId, args);
  return execute(chatId, messageId, callId);
}

/** 呼び出しを作らせられなかった理由と、LLM が応えていればその 1 回の記録 */
export interface GenerateFailure {
  readonly failure: LlmFailure;
  readonly attempt?: ToolCallAttempt | undefined;
}

/**
 * 選んだワークフローの呼び出しを LLM に作らせて実行する（メッセージの「ワークフローを実行」。
 * 人が押したときだけ呼ぶ。押したことを承諾とみなす）。作らせられなければ理由を返す
 */
export async function generateToolCall(
  chatId: string,
  messageId: string,
  name: string,
): Promise<GenerateFailure | null> {
  const result = await useChatStore.getState().requestToolCall(chatId, messageId, name);
  if (!result.ok) return { failure: result.failure, attempt: result.attempt };
  for (const callId of result.callIds) void execute(chatId, messageId, callId);
  return null;
}

/**
 * この画面で受け取り、確認を待つ呼び出しの受け手（もう 1 つの入口。確認を省くかは
 * `runsWithoutConfirm` だけが決める）。確認を省いてよいものだけ実行し、
 * ほかは確認を待たせたままにする。**1 回の返事で確認を省くのは先頭から上限の数まで**で、
 * 残りは承諾を待つ（防御機構の値）
 */
function receiveFreshCalls(
  chatId: string,
  messageId: string,
  calls: readonly ToolCallRecord[],
): void {
  const { chatComfyToolsSkipConfirm: skipConfirm, safeguards } = useSettingsStore.getState();
  const connected = useConnectionStore.getState().status === 'connected';
  if (!runsWithoutConfirm({ kind: 'workflow', skipConfirm, fresh: true, connected })) return;
  calls
    .filter((call) => call.state.kind === 'waiting')
    .slice(0, safeguards.toolAutoRunMax)
    .forEach((call) => void execute(chatId, messageId, call.id));
}

receiveFreshToolCalls(receiveFreshCalls);
// 読まれたときに通知を受け取り始める（会話のタブを開くまで読まない）
startToolRunWatch();

/**
 * 呼び出しを断る（カードの「断る」）
 */
export function declineToolCall(chatId: string, messageId: string, callId: string): void {
  if (findCall(chatId, messageId, callId)?.state.kind !== 'waiting') return;
  useChatStore.getState().setToolCall(chatId, messageId, callId, { kind: 'declined' });
}
