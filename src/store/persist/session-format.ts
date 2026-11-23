import { parseWorkflow } from '@/graph/normalize';
import { unlinkedNodeIds } from '@/graph/rows';
import { isRecord, isUnknownArray } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';
import type { Tab, TabSnapshot } from '@/store/use-tabs-store';

export const LAYOUT_KEY = 'layout';

export const TAB_KEY_PREFIX = 'tab:';

export const TAB_LAYOUT_KEY = 'kisaraui.layout';

const LAYOUT_VERSION = 2;

export function tabKey(session: string): string {
  return `${TAB_KEY_PREFIX}${session}`;
}

export interface StoredSnapshot {
  readonly workflow: unknown;
  readonly name: string;
  readonly savedPath?: string | null;
  readonly savedOn?: string | null;
  readonly savedOwn?: boolean;
  readonly dirty: boolean;
  readonly selectedNodeIds: readonly number[];
  readonly appValues: Record<string, Record<string, unknown>>;
  readonly writer?: string;
  readonly savedAt?: number;
}

interface StoredLayout {
  readonly version: number;
  readonly tabs: readonly Tab[];
  readonly activeId: string;
}

export function toStored(snapshot: TabSnapshot): StoredSnapshot {
  const appValues: Record<string, Record<string, unknown>> = {};
  for (const [promptNodeId, fields] of snapshot.appValues)
    setOwn(appValues, promptNodeId, { ...fields });

  return {
    workflow: snapshot.workflow,
    name: snapshot.name,
    savedPath: snapshot.savedPath,
    savedOn: snapshot.savedOn ?? null,
    savedOwn: snapshot.savedOwn ?? false,
    dirty: snapshot.dirty,
    selectedNodeIds: snapshot.selectedNodeIds,
    appValues,
  };
}

export function fromStored(raw: unknown): TabSnapshot | null {
  if (!isRecord(raw)) return null;

  let workflow = null;
  try {
    if (raw.workflow !== null && raw.workflow !== undefined) workflow = parseWorkflow(raw.workflow);
  } catch {
    return null;
  }

  const values = new Map<string, Readonly<Record<string, unknown>>>();
  if (isRecord(raw.appValues)) {
    for (const [promptNodeId, fields] of Object.entries(raw.appValues)) {
      if (isRecord(fields)) values.set(promptNodeId, fields);
    }
  }

  return {
    workflow,
    name: typeof raw.name === 'string' ? raw.name : '',
    savedPath: typeof raw.savedPath === 'string' ? raw.savedPath : null,
    savedOn: typeof raw.savedOn === 'string' ? raw.savedOn : null,
    savedOwn: raw.savedOwn === true,
    dirty: raw.dirty === true,
    selectedNodeIds: storedSelection(raw),
    hiddenCandidates: workflow ? unlinkedNodeIds(workflow) : new Set(),
    appValues: values,
  };
}

function storedSelection(raw: Record<string, unknown>): number[] {
  return isUnknownArray(raw.selectedNodeIds)
    ? raw.selectedNodeIds.filter((id): id is number => typeof id === 'number')
    : [];
}

function parseTabs(raw: Record<string, unknown>): { tabs: Tab[]; activeId: string } | null {
  if (!isUnknownArray(raw.tabs) || typeof raw.activeId !== 'string') return null;

  const tabs: Tab[] = [];
  for (const item of raw.tabs) {
    const tab = parseTab(item);
    if (tab !== null) tabs.push(tab);
  }
  if (tabs.length === 0) return null;

  const activeId = tabs.some((tab) => tab.id === raw.activeId) ? raw.activeId : (tabs[0]?.id ?? '');
  return { tabs, activeId };
}

function parseTab(tab: unknown): Tab | null {
  if (!isRecord(tab) || typeof tab.id !== 'string') return null;
  if (tab.kind === 'chat') return parseChatTab(tab, tab.id);
  if (tab.kind !== 'workflow') return null;

  const runSession = typeof tab.runSession === 'string' ? tab.runSession : undefined;
  const origin = typeof tab.origin === 'string' ? tab.origin : undefined;
  return {
    id: tab.id,
    kind: 'workflow',
    ...(runSession === undefined ? {} : { runSession }),
    ...(origin === undefined ? {} : { origin }),
  };
}

function parseChatTab(tab: Record<string, unknown>, id: string): Tab | null {
  if (typeof tab.chatId !== 'string') return null;
  const comfyUrl = typeof tab.chatComfyUrl === 'string' ? tab.chatComfyUrl : undefined;
  return {
    id,
    kind: 'chat',
    chatId: tab.chatId,
    ...(comfyUrl === undefined ? {} : { chatComfyUrl: comfyUrl }),
    ...(comfyUrl !== undefined && tab.chatBoth === true ? { chatBoth: true } : {}),
  };
}

export function parseLayout(raw: unknown): { tabs: Tab[]; activeId: string } | null {
  if (!isRecord(raw) || raw.version !== LAYOUT_VERSION) return null;
  return parseTabs(raw);
}

export function buildLayout(tabs: readonly Tab[], activeId: string): StoredLayout {
  return { version: LAYOUT_VERSION, tabs: tabs.filter((tab) => tab.kind !== 'image'), activeId };
}
