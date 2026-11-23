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

export type WorkflowToolProblem =
  'no-tool' | 'bad-name' | 'unreadable' | 'no-definitions' | 'tab-closed';

export type LoadedWorkflowTool =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly tool: WorkflowTool;
      readonly args: readonly ToolArgument[];
      readonly definition: ToolDefinition;
      readonly workflow: Workflow;
      readonly tabName: string | null;
    }
  | { readonly kind: 'problem'; readonly problem: WorkflowToolProblem };

interface WorkflowToolsState {
  readonly entries: Readonly<Record<string, LoadedWorkflowTool>>;
  readonly loadedFor: string | null;
  readonly refresh: (baseUrl: string) => Promise<void>;
  readonly refreshOne: (baseUrl: string, target: ComfyToolTarget) => Promise<void>;
}

function openTabOf(baseUrl: string, path: string): string | null {
  const tabs = useTabsStore.getState();
  for (const tab of tabs.tabs) {
    if (tab.kind !== 'workflow') continue;
    const snapshot = tabs.readTab(tab.id);
    if (snapshot?.savedPath === path && snapshot.savedOn === baseUrl) return tab.id;
  }
  return null;
}

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
    if (get().loadedFor !== baseUrl) return;
    set({ entries: { ...get().entries, [target.id]: entry } });
  },
}));

export interface ToolTab {
  readonly tabId: string;
  readonly name: string;
  readonly toolName: string;
  readonly path: string | null;
  readonly workflow: Workflow;
}

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

export interface ActiveWorkflowTool {
  readonly target: ComfyToolTarget;
  readonly tool: WorkflowTool;
  readonly args: readonly ToolArgument[];
  readonly definition: ToolDefinition;
}

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

function currentWorkflowTools(): ActiveWorkflowTool[] {
  const settings = useSettingsStore.getState();
  if (!settings.chatComfyTools) return [];
  return activeWorkflowTools(
    useWorkflowToolsStore.getState().entries,
    settings.chatComfyToolTargets,
  );
}

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

export function chatWorkflowTools(chat: Chat | undefined): ActiveWorkflowTool[] {
  return toChatTools(currentWorkflowTools(), chat);
}

function checkToolCall(call: ToolCallRecord, chat: Chat | undefined): ToolCallState {
  const found = chatWorkflowTools(chat).find((item) => item.tool.name === call.name);
  if (found === undefined) return { kind: 'invalid', problem: { code: 'unknown-tool' } };
  const parsed = parseToolArguments(found.args, call.arguments);
  return parsed.ok ? { kind: 'waiting' } : { kind: 'invalid', problem: parsed.problem };
}

provideChatTools({
  definitions: (chat) => chatWorkflowTools(chat).map((item) => item.definition),
  check: checkToolCall,
});
