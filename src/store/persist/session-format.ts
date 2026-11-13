import { parseWorkflow } from '@/graph/normalize';
import { unlinkedNodeIds } from '@/graph/rows';
import { isRecord, isUnknownArray } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';
import type { Tab, TabSnapshot } from '@/store/use-tabs-store';

// ─────────────────────────────
// 開いていたものの控えの形。鍵と、タブの並び・中身の変換。
// ─────────────────────────────

/** 最後に保存した並びの鍵 */
export const LAYOUT_KEY = 'layout';

/** タブの中身の鍵の頭。後ろにセッションの id を付ける */
export const TAB_KEY_PREFIX = 'tab:';

/** ブラウザのタブごとの保存領域での、並びの名前 */
export const TAB_LAYOUT_KEY = 'kisaraui.layout';

/** 並びの形の版。変えたら上げる。古い並びは読み捨てる */
const LAYOUT_VERSION = 2;

/** タブの中身の鍵 */
export function tabKey(session: string): string {
  return `${TAB_KEY_PREFIX}${session}`;
}

/** 端末に書くタブの中身の 1 件（鍵は `tab:<セッションの id>`） */
export interface StoredSnapshot {
  readonly workflow: unknown;
  readonly name: string;
  /** 無い控え（保存先を覚える前に書いたもの）も読めるよう省略可 */
  readonly savedPath?: string | null;
  /**
   * 保存先の接続先と、KisaraUI が作ったファイルか。無い控えは上書きできない扱い
   */
  readonly savedOn?: string | null;
  readonly savedOwn?: boolean;
  readonly dirty: boolean;
  readonly selectedNodeIds: readonly number[];
  readonly appValues: Record<string, Record<string, unknown>>;
  /** 書いたブラウザのタブの `clientId` */
  readonly writer?: string;
  /** 書いた時刻（epoch ミリ秒） */
  readonly savedAt?: number;
}

/** 並び。中身は持たない（タブごとに別の 1 件） */
interface StoredLayout {
  readonly version: number;
  readonly tabs: readonly Tab[];
  readonly activeId: string;
}

/** タブの控えを、端末に書く 1 件の形にする */
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

/** 保存した形からタブの中身に戻す。形が違えば null */
export function fromStored(raw: unknown): TabSnapshot | null {
  if (!isRecord(raw)) return null;

  // 壊れた控えで画面ごと止めない。読めたところまでで戻す
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
    // 読み込み直しは開いたときと同じ扱い。隠す相手は今の線で決め直す
    hiddenCandidates: workflow ? unlinkedNodeIds(workflow) : new Set(),
    appValues: values,
  };
}

/** 選んでいたノード */
function storedSelection(raw: Record<string, unknown>): number[] {
  return isUnknownArray(raw.selectedNodeIds)
    ? raw.selectedNodeIds.filter((id): id is number => typeof id === 'number')
    : [];
}

/** タブの並びと選んでいたタブ。ワークフローと会話のタブが 1 つも無ければ null */
function parseTabs(raw: Record<string, unknown>): { tabs: Tab[]; activeId: string } | null {
  if (!isUnknownArray(raw.tabs) || typeof raw.activeId !== 'string') return null;

  const tabs: Tab[] = [];
  for (const item of raw.tabs) {
    const tab = parseTab(item);
    if (tab !== null) tabs.push(tab);
  }
  if (tabs.length === 0) return null;

  // 選んでいたタブが消えていたら先頭に寄せる
  const activeId = tabs.some((tab) => tab.id === raw.activeId) ? raw.activeId : (tabs[0]?.id ?? '');
  return { tabs, activeId };
}

/** タブ 1 つを読む。読めない・種別を知らないタブは null */
function parseTab(tab: unknown): Tab | null {
  if (!isRecord(tab) || typeof tab.id !== 'string') return null;
  if (tab.kind === 'chat') return parseChatTab(tab, tab.id);
  if (tab.kind !== 'workflow') return null;

  // セッションの id も一緒に戻す。無ければ戻した後で作る
  const runSession = typeof tab.runSession === 'string' ? tab.runSession : undefined;
  const origin = typeof tab.origin === 'string' ? tab.origin : undefined;
  return {
    id: tab.id,
    kind: 'workflow',
    ...(runSession === undefined ? {} : { runSession }),
    ...(origin === undefined ? {} : { origin }),
  };
}

/**
 * 会話のタブは会話の id と置き場だけを並びに持つ。中身は置き場
 */
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

/** 並びを読む。形が違う・版が違えば null */
export function parseLayout(raw: unknown): { tabs: Tab[]; activeId: string } | null {
  if (!isRecord(raw) || raw.version !== LAYOUT_VERSION) return null;
  return parseTabs(raw);
}

/** 書き出す並び。ワークフローと会話のタブだけ（画像のタブは戻さない） */
export function buildLayout(tabs: readonly Tab[], activeId: string): StoredLayout {
  return { version: LAYOUT_VERSION, tabs: tabs.filter((tab) => tab.kind !== 'image'), activeId };
}
