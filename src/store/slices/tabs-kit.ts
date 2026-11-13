import type { StoreApi } from 'zustand';

import { comfyUrlOf, type ChatPlace } from '@/chat/types';
import { newShortId } from '@/lib/id';
import { writeTabList } from '@/lib/tab-id';
import { hold } from '@/lib/web-locks';
import { retainNodeViews } from '@/store/kit/node-views-cache';
import { captureTabScoped, restoreTabScoped } from '@/store/kit/tab-scoped';
import { useAppValuesStore } from '@/store/use-app-values-store';
import { useGraphStore } from '@/store/use-graph-store';
import type { Tab, TabKind, TabSnapshot, TabsState } from '@/store/use-tabs-store';

// ─────────────────────────────
// タブのストアの slice が共有する、タブの採番・セッションの鍵・控えの出し入れ。
// ─────────────────────────────

/** 前に使ったセッションの置き場（ブラウザのタブごとの保存領域） */
export const PAST_SESSIONS_KEY = 'kisaraui.session.past';

/**
 * 前に使ったセッションを覚えておく数
 */
const PAST_SESSION_LIMIT = 50;

/**
 * セッションの id の鍵（Web Locks）の名前の頭（ほかのブラウザのタブと同じ id を持たない）
 */
export const SESSION_LOCK_PREFIX = 'kisaraui.session:';

/** タブの id の頭 */
const TAB_ID_PREFIX = 'tab-';

/** 空のタブの中身 */
export const EMPTY_SNAPSHOT: TabSnapshot = {
  workflow: null,
  name: '',
  savedPath: null,
  dirty: false,
  selectedNodeIds: [],
  hiddenCandidates: new Set(),
  appValues: new Map(),
};

/** タブのストアの set と get */
interface TabsStoreAccess {
  readonly set: StoreApi<TabsState>['setState'];
  readonly get: () => TabsState;
}

let counter = 0;

/** 戻したタブのセッションの鍵を取り終えたら解決する（取り直しが済むまで控えを片付けない） */
let sessionsClaimed: Promise<void> = Promise.resolve();

/** このブラウザのタブが鍵を持っているセッション。中身の控えを消してよいのはこれだけ */
const heldSessions = new Set<string>();

/** 戻したタブのセッションの鍵を取り終えるのを待つ */
export function whenSessionsClaimed(): Promise<void> {
  return sessionsClaimed;
}

/**
 * そのセッションの鍵をこのブラウザのタブが持っているか
 */
export function holdsSession(session: string): boolean {
  return heldSessions.has(session);
}

/** 新しいセッションの id。鍵も取っておく（作ったばかりの id は誰も持っていない） */
export function newSession(): string {
  const session = newShortId();
  heldSessions.add(session);
  void hold(sessionLock(session));
  return session;
}

/** セッションの鍵を取る。取れたら持っている印を付けて true */
export async function claimSession(session: string): Promise<boolean> {
  if (!(await hold(sessionLock(session)))) return false;
  heldSessions.add(session);
  return true;
}

/** 前に使ったセッションの先頭に足す（重ねず、上限で古いものから手放す） */
export function withPast(past: readonly string[], session: string | undefined): readonly string[] {
  if (session === undefined) return past;
  const next = [session, ...past.filter((id) => id !== session)].slice(0, PAST_SESSION_LIMIT);
  writeTabList(PAST_SESSIONS_KEY, next);
  return next;
}

/** 次のタブの id */
export function nextId(): string {
  counter += 1;
  return `${TAB_ID_PREFIX}${String(counter)}`;
}

/**
 * 戻した id とぶつからないところまで採番を進める。
 * これをしないと、次に足したタブが戻した id と同じ名前になる。
 */
export function advanceCounter(tabs: readonly Tab[]): void {
  for (const tab of tabs) {
    const number = Number(tab.id.replace(TAB_ID_PREFIX, ''));
    if (Number.isFinite(number) && number > counter) counter = number;
  }
}

/** 戻したタブのセッションの鍵を取り始める（取り終えるのは `whenSessionsClaimed` で待つ） */
export function startClaimingSessions(store: TabsStoreAccess): void {
  sessionsClaimed = claimSessions(store);
}

/** 閉じたあとに選ぶタブ。**右隣を優先し、無ければ左隣** */
export function nextActiveId(
  tabs: readonly Tab[],
  closing: string,
  activeId: string,
): string | null {
  if (closing !== activeId) return activeId;

  const index = tabs.findIndex((tab) => tab.id === closing);
  const rest = tabs.filter((tab) => tab.id !== closing);
  if (rest.length === 0) return null;

  return (rest[index] ?? rest[rest.length - 1] ?? rest[0])?.id ?? null;
}

/** 写しの元（たどった先）。写しの関係にあるタブはこれが同じ */
export function lineageOf(tab: Tab): string | undefined {
  return tab.origin ?? tab.runSession;
}

/**
 * 会話のタブに持つ置き場（並びに残す）
 */
export function tabPlace(place: ChatPlace): Pick<Tab, 'chatComfyUrl' | 'chatBoth'> {
  return {
    chatComfyUrl: comfyUrlOf(place) ?? undefined,
    chatBoth: place.kind === 'both' || undefined,
  };
}

/** 種別と中身を決めてタブを足し、切り替える手続きを作る */
export function createTabAdder(
  store: TabsStoreAccess,
): (kind: TabKind, snapshot: TabSnapshot, chatId?: string) => string {
  return (kind, snapshot, chatId) => {
    const id = nextId();
    const { activeId, tabs, snapshots } = store.get();
    store.set({
      tabs: [...tabs, newTabOf(id, kind, chatId)],
      activeId: id,
      snapshots: { ...snapshots, [activeId]: currentSnapshot() },
    });
    applySnapshot(snapshot);
    return id;
  };
}

/** 今ストアに載っている内容を控えの形にする */
export function currentSnapshot(): TabSnapshot {
  const graph = useGraphStore.getState();
  return {
    workflow: graph.workflow,
    name: graph.name,
    savedPath: graph.savedPath,
    savedOn: graph.savedOn,
    savedOwn: graph.savedOwn,
    dirty: graph.dirty,
    selectedNodeIds: graph.selectedNodeIds,
    hiddenCandidates: graph.hiddenCandidates,
    appValues: useAppValuesStore.getState().values,
    history: graph.history,
    dialogs: captureTabScoped(),
  };
}

/** 控えをストアへ載せ直す。ダイアログは控えのものを開き直し、無ければ閉じる */
export function applySnapshot(snapshot: TabSnapshot): void {
  useGraphStore.getState().restore(snapshot);
  useAppValuesStore.getState().restore(snapshot.appValues);
  restoreTabScoped(snapshot.dialogs);
}

/**
 * 閉じたタブのカードの表示データを忘れる。
 * 載せ直したあとに呼び、今載っているものと控えのワークフローだけを残す
 */
export function forgetClosed(snapshots: Readonly<Record<string, TabSnapshot>>): void {
  retainNodeViews([
    useGraphStore.getState().workflow,
    ...Object.values(snapshots).map((snapshot) => snapshot.workflow),
  ]);
}

/**
 * 新しく足すタブ。ワークフローのタブは開くたびに新しいセッションにする
 */
function newTabOf(id: string, kind: TabKind, chatId: string | undefined): Tab {
  if (kind === 'workflow') return { id, kind, runSession: newSession() };
  if (kind === 'chat') return { id, kind, chatId };
  return { id, kind };
}

/**
 * 戻したタブのセッションの鍵を取る。ほかのブラウザのタブ（複製したもの）が同じ id を
 * 持っていれば、そのタブだけ新しいセッションにする
 */
async function claimSessions(store: TabsStoreAccess): Promise<void> {
  for (const tab of store.get().tabs) {
    const session = tab.runSession;
    if (session === undefined || heldSessions.has(session)) continue;
    if (await hold(sessionLock(session))) {
      heldSessions.add(session);
      continue;
    }
    // 写しとして新しいセッションにする。元をたどれるように残す
    store.set({
      tabs: store
        .get()
        .tabs.map((item) =>
          item.id === tab.id
            ? { ...item, runSession: newSession(), origin: lineageOf(item) }
            : item,
        ),
    });
  }
}

function sessionLock(session: string): string {
  return `${SESSION_LOCK_PREFIX}${session}`;
}
