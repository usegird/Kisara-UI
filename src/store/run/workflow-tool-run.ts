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

interface CallTarget {
  readonly chatId: string;
  readonly messageId: string;
  readonly callId: string;
}

interface CheckedCall {
  readonly found: ActiveWorkflowTool;
  readonly values: ArgumentValues;
}

const starting = new Set<string>();

function findCall(chatId: string, messageId: string, callId: string): ToolCallRecord | null {
  const message = useChatStore.getState().chats[chatId]?.messages.find((m) => m.id === messageId);
  for (const candidate of message?.candidates ?? []) {
    const call = candidate.toolCalls?.find((item) => item.id === callId);
    if (call !== undefined) return call;
  }
  return null;
}

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

function fileName(path: string): string {
  return (path.split('/').at(-1) ?? path).replace(/\.json$/iu, '');
}

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
  const placed = await placeArgumentImages(chatId, baseUrl, found.args, values);
  if (!placed.ok) {
    failCall(target, placed.message);
    return;
  }
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

export function approveToolCall(chatId: string, messageId: string, callId: string): Promise<void> {
  return execute(chatId, messageId, callId);
}

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

export interface GenerateFailure {
  readonly failure: LlmFailure;
  readonly attempt?: ToolCallAttempt | undefined;
}

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
startToolRunWatch();

export function declineToolCall(chatId: string, messageId: string, callId: string): void {
  if (findCall(chatId, messageId, callId)?.state.kind !== 'waiting') return;
  useChatStore.getState().setToolCall(chatId, messageId, callId, { kind: 'declined' });
}
