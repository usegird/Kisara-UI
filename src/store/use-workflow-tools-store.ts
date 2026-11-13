import { create } from 'zustand';

import { TOOL_REPLY_RULE, toolFunction, withArgumentGuide } from '@/chat/request';
import { parseToolArguments } from '@/chat/tool-arguments';
import type { Chat, ToolCallRecord, ToolCallState } from '@/chat/types';
import { parseWorkflow } from '@/graph/normalize';
import type { Workflow } from '@/graph/types';
import {
  isToolName,
  readWorkflowTool,
  toolArguments,
  withImageChoices,
  type ToolArgument,
  type WorkflowTool,
} from '@/graph/workflow-tool';
import { newShortId } from '@/lib/id';
import type { ToolDefinition } from '@/port/llm-port';
import { comfyPort } from '@/store/ports/comfy-port';
import { imageReferences } from '@/store/run/workflow-tool-images';
import { provideChatTools } from '@/store/use-chat-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore, type ComfyToolTarget } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// 会話から呼べるワークフローの定義（画面を開いている間だけ持つ。選んだタブは設定のストア）。
// 読み込むのは会話のタブを出したときと「更新」だけで、ファイルより開いているタブの今の状態を優先する。
// ─────────────────────────────

/**
 * 読み込めなかった理由
 */
export type WorkflowToolProblem =
  'no-tool' | 'bad-name' | 'unreadable' | 'no-definitions' | 'tab-closed';

/** 1 つのワークフローの定義の読み込みの結果 */
export type LoadedWorkflowTool =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly tool: WorkflowTool;
      readonly args: readonly ToolArgument[];
      readonly definition: ToolDefinition;
      /**
       * 読んだワークフロー（設定を読み取り専用で見せる）
       */
      readonly workflow: Workflow;
      /** 読んだタブの名前。ファイルから読んだなら null */
      readonly tabName: string | null;
    }
  | { readonly kind: 'problem'; readonly problem: WorkflowToolProblem };

/** 読み込んだワークフローの定義と、読み込む操作 */
interface WorkflowToolsState {
  /** 選んだ 1 件の id → 読み込んだ定義 */
  readonly entries: Readonly<Record<string, LoadedWorkflowTool>>;
  /** どの接続先で読み込んだか。まだ読んでいなければ null */
  readonly loadedFor: string | null;
  /** 選んだすべてを読み直す */
  readonly refresh: (baseUrl: string) => Promise<void>;
  /** 1 件だけ読む（足したとき） */
  readonly refreshOne: (baseUrl: string, target: ComfyToolTarget) => Promise<void>;
}

/** そのパスで、同じ接続先から開いているタブ。無ければ null */
function openTabOf(baseUrl: string, path: string): string | null {
  const tabs = useTabsStore.getState();
  for (const tab of tabs.tabs) {
    if (tab.kind !== 'workflow') continue;
    const snapshot = tabs.readTab(tab.id);
    if (snapshot?.savedPath === path && snapshot.savedOn === baseUrl) return tab.id;
  }
  return null;
}

/**
 * 指しているタブ。選んだタブが今も同じファイル（保存していないタブなら、ワークフローがあること）を
 * 開いていればそのタブ、違えば保存先のパスを開いているタブ。どちらも無ければ null
 */
export function resolveTargetTab(target: ComfyToolTarget, baseUrl: string): string | null {
  const tabs = useTabsStore.getState();
  const own = tabs.tabs.some((tab) => tab.id === target.tabId && tab.kind === 'workflow');
  const snapshot = own ? tabs.readTab(target.tabId) : null;
  if (snapshot?.workflow) {
    const same =
      target.path === null || (snapshot.savedPath === target.path && snapshot.savedOn === baseUrl);
    if (same) return target.tabId;
  }
  return target.path === null ? null : openTabOf(baseUrl, target.path);
}

/**
 * 見つけたタブに合わせて、指すタブと保存先を付け替える（タブを保存したときもパスを持つ）。
 * タブの id は読み込み直しやブラウザのタブで変わるので、保存先のパスを開いているタブを探して追う
 */
export function followTab(target: ComfyToolTarget, tabId: string, baseUrl: string): void {
  const snapshot = useTabsStore.getState().readTab(tabId);
  const saved = snapshot?.savedOn === baseUrl ? (snapshot.savedPath ?? null) : null;
  const path = saved ?? target.path;
  if (tabId === target.tabId && path === target.path) return;
  useSettingsStore.getState().updateChatComfyToolTarget(target.id, { tabId, path });
}

interface ReadWorkflow {
  readonly workflow: Workflow;
  readonly tabName: string | null;
}

async function readWorkflow(
  target: ComfyToolTarget,
  baseUrl: string,
): Promise<ReadWorkflow | null> {
  const tabId = resolveTargetTab(target, baseUrl);
  if (tabId !== null) {
    followTab(target, tabId, baseUrl);
    const snapshot = useTabsStore.getState().readTab(tabId);
    return snapshot?.workflow ? { workflow: snapshot.workflow, tabName: snapshot.name } : null;
  }
  if (target.path === null) return null;
  try {
    const raw = await comfyPort().workflows.fetch(baseUrl, target.path);
    return { workflow: parseWorkflow(raw), tabName: null };
  } catch {
    return null;
  }
}

async function loadEntry(baseUrl: string, target: ComfyToolTarget): Promise<LoadedWorkflowTool> {
  const definitions = useDefinitionsStore.getState().definitions;
  const connected = useConnectionStore.getState().status === 'connected';
  if (!connected || definitions.size === 0) return { kind: 'problem', problem: 'no-definitions' };
  const read = await readWorkflow(target, baseUrl);
  if (read === null) {
    return { kind: 'problem', problem: target.path === null ? 'tab-closed' : 'unreadable' };
  }
  const { workflow, tabName } = read;
  const tool = readWorkflowTool(workflow);
  if (tool === null) return { kind: 'problem', problem: 'no-tool' };
  if (!isToolName(tool.name)) return { kind: 'problem', problem: 'bad-name' };
  const args = toolArguments(workflow, definitions, tool);
  return {
    kind: 'ready',
    tool,
    args,
    definition: { type: 'function', function: toolFunction(tool, args) },
    workflow,
    tabName,
  };
}

export const useWorkflowToolsStore = create<WorkflowToolsState>()((set, get) => ({
  entries: {},
  loadedFor: null,

  refresh: async (baseUrl) => {
    const targets = useSettingsStore.getState().chatComfyToolTargets;
    set({
      loadedFor: baseUrl,
      entries: Object.fromEntries(targets.map((item) => [item.id, { kind: 'loading' } as const])),
    });
    await Promise.all(targets.map((target) => get().refreshOne(baseUrl, target)));
  },

  refreshOne: async (baseUrl, target) => {
    set({ loadedFor: baseUrl, entries: { ...get().entries, [target.id]: { kind: 'loading' } } });
    const entry = await loadEntry(baseUrl, target);
    // 読んでいる間に接続先が変わったら捨てる
    if (get().loadedFor !== baseUrl) return;
    set({ entries: { ...get().entries, [target.id]: entry } });
  },
}));

// ─────────────────────────────
// 選べるタブ（拡張のタブの「タブを足す」）
// ─────────────────────────────

/** LLM からの呼び出し設定を持つ、開いているワークフローのタブ */
export interface ToolTab {
  readonly tabId: string;
  /** タブの名前 */
  readonly name: string;
  /** ワークフロー名 */
  readonly toolName: string;
  /** 今の接続先に保存したパス。無ければ null */
  readonly path: string | null;
  /** タブの今のワークフロー（設定を読み取り専用で見せる） */
  readonly workflow: Workflow;
}

/** その接続先で、LLM からの呼び出し設定を持つ開いているワークフローのタブを並べる */
export function listToolTabs(baseUrl: string): ToolTab[] {
  const tabs = useTabsStore.getState();
  return tabs.tabs.flatMap((tab): ToolTab[] => {
    if (tab.kind !== 'workflow') return [];
    const snapshot = tabs.readTab(tab.id);
    const tool = snapshot?.workflow ? readWorkflowTool(snapshot.workflow) : null;
    if (snapshot === null || tool === null) return [];
    const saved = snapshot.savedOn === baseUrl ? snapshot.savedPath : null;
    const workflow = snapshot?.workflow ?? null;
    if (workflow === null) return [];
    return [{ tabId: tab.id, name: snapshot.name, toolName: tool.name, path: saved, workflow }];
  });
}

/**
 * 追加のダイアログの OK。出したタブのうち、チェックしたものは選び（まだなら足して読む）、
 * 外したものは選択から外す。出していない（閉じた）タブを指すものはそのまま残す
 */
export function applyToolTabs(
  baseUrl: string,
  shown: readonly ToolTab[],
  checked: ReadonlySet<string>,
): void {
  const settings = useSettingsStore.getState();
  for (const tab of shown) {
    const current = settings.chatComfyToolTargets.find((target) => target.tabId === tab.tabId);
    if (current !== undefined && !checked.has(tab.tabId)) {
      settings.removeChatComfyToolTarget(current.id);
    }
    if (current === undefined && checked.has(tab.tabId)) {
      const target: ComfyToolTarget = {
        id: newShortId(),
        tabId: tab.tabId,
        path: tab.path,
        name: tab.name,
      };
      settings.addChatComfyToolTarget(target);
      void useWorkflowToolsStore.getState().refreshOne(baseUrl, target);
    }
  }
}

// ─────────────────────────────
// 送るワークフロー
// ─────────────────────────────

/** 送るワークフロー。選んだ順で、名前が重なれば後のものを落とす */
export interface ActiveWorkflowTool {
  readonly target: ComfyToolTarget;
  readonly tool: WorkflowTool;
  readonly args: readonly ToolArgument[];
  readonly definition: ToolDefinition;
}

/** 選んだ 1 件ずつのうち、読み込めたものを並べる（同じ名前のツールは最初の 1 つだけ） */
export function activeWorkflowTools(
  entries: Readonly<Record<string, LoadedWorkflowTool>>,
  targets: readonly ComfyToolTarget[],
): ActiveWorkflowTool[] {
  const seen = new Set<string>();
  const result: ActiveWorkflowTool[] = [];
  for (const target of targets) {
    const entry = entries[target.id];
    if (entry?.kind !== 'ready' || seen.has(entry.tool.name)) continue;
    seen.add(entry.tool.name);
    result.push({ target, tool: entry.tool, args: entry.args, definition: entry.definition });
  }
  return result;
}

/** 名前が先に選んだものと重なる 1 件の id（送らない。拡張のタブで警告する） */
export function duplicateTargets(
  entries: Readonly<Record<string, LoadedWorkflowTool>>,
  targets: readonly ComfyToolTarget[],
): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const target of targets) {
    const entry = entries[target.id];
    if (entry?.kind !== 'ready') continue;
    if (seen.has(entry.tool.name)) duplicates.add(target.id);
    seen.add(entry.tool.name);
  }
  return duplicates;
}

/** 今送れるワークフロー。有効にしていなければ空 */
function currentWorkflowTools(): ActiveWorkflowTool[] {
  const settings = useSettingsStore.getState();
  if (!settings.chatComfyTools) return [];
  return activeWorkflowTools(
    useWorkflowToolsStore.getState().entries,
    settings.chatComfyToolTargets,
  );
}

/**
 * 送るツールにする。画像の引数の選択肢を、その会話で選べる参照名にし、説明の後ろに
 * 設定の共通の追加指示と、本文も書かせる決まった一文を添える
 */
export function toChatTools(
  tools: readonly ActiveWorkflowTool[],
  chat: Chat | undefined,
  guide: string = useSettingsStore.getState().chatComfyToolsArgGuide,
): ActiveWorkflowTool[] {
  const references = imageReferences(chat);
  const added = [guide.trim(), TOOL_REPLY_RULE].filter((text) => text.length > 0).join('\n\n');
  return tools.map((item) => {
    const images = item.args.some((arg) => arg.image === true);
    const args = images ? withImageChoices(item.args, references) : item.args;
    const spec = withArgumentGuide(toolFunction(item.tool, args), added);
    return { ...item, args, definition: { type: 'function', function: spec } };
  });
}

/** その会話で送るワークフロー */
export function chatWorkflowTools(chat: Chat | undefined): ActiveWorkflowTool[] {
  return toChatTools(currentWorkflowTools(), chat);
}

/**
 * 受け取った呼び出しを、その会話の選択肢で確かめる
 */
function checkToolCall(call: ToolCallRecord, chat: Chat | undefined): ToolCallState {
  const found = chatWorkflowTools(chat).find((item) => item.tool.name === call.name);
  if (found === undefined) return { kind: 'invalid', problem: { code: 'unknown-tool' } };
  const parsed = parseToolArguments(found.args, call.arguments);
  return parsed.ok ? { kind: 'waiting' } : { kind: 'invalid', problem: parsed.problem };
}

// 会話のストアに、送るツールと確かめ方を渡す（会話のストアからこのストアを読まない）
provideChatTools({
  definitions: (chat) => chatWorkflowTools(chat).map((item) => item.definition),
  check: checkToolCall,
});
