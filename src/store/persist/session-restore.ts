import type { StateStorage } from 'zustand/middleware';

import { isRecord } from '@/lib/guards';
import { newShortId } from '@/lib/id';
import { safeStorage } from '@/lib/safe-storage';
import { hasWebLocks } from '@/lib/web-locks';
import { chatsOpenElsewhere } from '@/store/persist/chat-locks';
import { EDIT_KEY_PREFIX, editKey } from '@/store/persist/edit-marks';
import { heldSessionLocks, sessionsOf } from '@/store/persist/session';
import {
  fromStored,
  LAYOUT_KEY,
  parseLayout,
  TAB_KEY_PREFIX,
  TAB_LAYOUT_KEY,
  tabKey,
} from '@/store/persist/session-format';
import { defaultSessionStore, getOrNull, type SessionStore } from '@/store/persist/session-store';
import { useRunReportStore, type SaveNotice } from '@/store/use-run-report-store';
import { clientIdReady, clientIdRenewed } from '@/store/use-settings-store';
import {
  useTabsStore,
  whenSessionsClaimed,
  type Tab,
  type TabSnapshot,
} from '@/store/use-tabs-store';

// ─────────────────────────────
// 開いていたものの読み戻し。読めないものは異常とせず、既定の 1 枚から始める。閉じたタブの中身も拾う。
// ─────────────────────────────

/** 小さい保存領域の JSON。無い・読めなければ null */
function readText(storage: StateStorage, key: string): unknown {
  try {
    const text = storage.getItem(key);
    return typeof text === 'string' && text.length > 0 ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

/** 1 件を書いたブラウザのタブと時刻 */
interface Written {
  readonly writer: string | null;
  readonly savedAt: number | null;
}

/** 並びに載ったタブの中身と、それを書いたブラウザのタブを読む。読めないタブは空から始める */
async function loadSnapshots(
  store: SessionStore,
  tabs: readonly Tab[],
): Promise<{ snapshots: Record<string, TabSnapshot>; written: Record<string, Written> }> {
  const snapshots: Record<string, TabSnapshot> = {};
  const written: Record<string, Written> = {};
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.runSession === undefined) return;
      const raw = await getOrNull(store, tabKey(tab.runSession));
      const snapshot = fromStored(raw);
      if (snapshot === null || !isRecord(raw)) return;
      snapshots[tab.id] = snapshot;
      written[tab.id] = {
        writer: typeof raw.writer === 'string' ? raw.writer : null,
        savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : null,
      };
    }),
  );
  return { snapshots, written };
}

/**
 * 読み込み直し・開き直しで戻したタブの一時保存を、ほかのブラウザのタブが書いていたら注意に出す
 * （閉じている間に引き継がれて書き換えられた）。複製したブラウザのタブは
 * 写しから始めるのが当然なので出さない
 */
async function noticeOtherWriters(
  tabs: readonly Tab[],
  snapshots: Readonly<Record<string, TabSnapshot>>,
  written: Readonly<Record<string, Written>>,
): Promise<void> {
  const clientId = await clientIdReady;
  if (await clientIdRenewed) return;
  const notices: SaveNotice[] = [];
  for (const tab of tabs) {
    const entry = written[tab.id];
    if (entry === undefined || entry.writer === null || entry.writer === clientId) continue;
    notices.push({
      kind: 'restored',
      tabId: tab.id,
      name: snapshots[tab.id]?.name ?? '',
      savedAt: entry.savedAt,
    });
  }
  if (notices.length > 0) useRunReportStore.getState().addSaveNotices(notices);
}

/** セッションの中身の控えを新しい id へ移す。編集の印は前の id のものを消す */
async function moveSession(store: SessionStore, from: string): Promise<string> {
  const fresh = newShortId();
  const raw = await getOrNull(store, tabKey(from));
  if (raw !== null) {
    await store.put(tabKey(fresh), raw);
    await store.delete(tabKey(from));
  }
  await store.delete(editKey(from));
  return fresh;
}

/**
 * 新しく開いたブラウザのタブでは、ほかのブラウザのタブで開いている会話のタブを戻さない
 * （複製ではないので写さない。写すと開くたびに同じ会話が増える）。
 * 選んでいたタブを外したら先頭を選ぶ
 */
async function withoutChatsOpenElsewhere(layout: {
  readonly tabs: readonly Tab[];
  readonly activeId: string;
}): Promise<{ tabs: readonly Tab[]; activeId: string }> {
  const ids = layout.tabs.flatMap((tab) => (tab.chatId === undefined ? [] : [tab.chatId]));
  const elsewhere = ids.length === 0 ? new Set<string>() : await chatsOpenElsewhere(ids);
  if (elsewhere.size === 0) return layout;
  const tabs = layout.tabs.filter((tab) => tab.chatId === undefined || !elsewhere.has(tab.chatId));
  const kept = tabs.some((tab) => tab.id === layout.activeId);
  return { tabs, activeId: kept ? layout.activeId : (tabs[0]?.id ?? '') };
}

/**
 * ブラウザを起動し直した（このブラウザのタブの並びが無い）ときは、ワークフローのタブに
 * 新しいセッションを振る。前の起動の記録に足し続けない。
 * ほかのブラウザのタブが開いているセッションは触らない（戻すときに写しになる）。
 * 鍵の一覧が取れない・移せないときはそのまま戻す
 */
async function renewSessions(store: SessionStore, tabs: readonly Tab[]): Promise<readonly Tab[]> {
  try {
    const held = await heldSessionLocks();
    if (held === null) return tabs;
    const renewed: Tab[] = [];
    for (const tab of tabs) {
      const session = tab.runSession;
      if (tab.kind !== 'workflow' || session === undefined || held.has(session)) {
        renewed.push(tab);
        continue;
      }
      renewed.push({ ...tab, runSession: await moveSession(store, session) });
    }
    return renewed;
  } catch {
    return tabs;
  }
}

/** どのブラウザのタブにも開かれていないタブの中身 */
interface Orphan {
  readonly session: string;
  readonly snapshot: TabSnapshot;
  readonly savedAt: number;
}

/**
 * どのブラウザのタブにも開かれておらず、戻した並びにも無いタブの中身を、追加で開く
 * （並びとタブの中身は別に置く。ブラウザのタブごと閉じたタブを失わない）。
 * 書いた時刻の古い順に並びの最後へ足す。読めない中身と、中身の無い編集の印は消す。
 * 開かれているかは鍵（Web Locks）で見る。鍵の一覧が取れなければ何もしない。
 * `renew` ならブラウザを起動し直したので、開くタブに新しいセッションを振る（`renewSessions`）
 */
async function adoptOrphans(store: SessionStore, renew: boolean): Promise<void> {
  if (!hasWebLocks()) return;
  await whenSessionsClaimed();

  const keep = new Set<string>(sessionsOf(useTabsStore.getState().tabs));
  for (const session of (await heldSessionLocks()) ?? []) keep.add(session);
  const keys = await store.keys();
  const orphans: Orphan[] = [];
  for (const key of keys) {
    if (!key.startsWith(TAB_KEY_PREFIX)) continue;
    const session = key.slice(TAB_KEY_PREFIX.length);
    if (keep.has(session)) continue;
    const orphan = await readOrphan(store, key, renew);
    if (orphan !== null) orphans.push(orphan);
  }
  orphans.sort((a, b) => a.savedAt - b.savedAt);
  for (const session of await useTabsStore.getState().adopt(orphans)) keep.add(session);
  await removeEmptyEditMarks(store, keys, keep);
}

/** 持ち主の無い中身を読む。読めない中身と、接続前のタブの中身は開かずに消して null */
async function readOrphan(
  store: SessionStore,
  key: string,
  renew: boolean,
): Promise<Orphan | null> {
  const session = key.slice(TAB_KEY_PREFIX.length);
  const raw = await getOrNull(store, key);
  const snapshot = fromStored(raw);
  if (snapshot === null || !isRecord(raw) || snapshot.workflow === null) {
    await store.delete(key);
    return null;
  }
  const savedAt = typeof raw.savedAt === 'number' ? raw.savedAt : 0;
  return { session: renew ? await moveSession(store, session) : session, snapshot, savedAt };
}

/** 中身の無い編集の印（閉じたタブの残り）を消す */
async function removeEmptyEditMarks(
  store: SessionStore,
  keys: readonly string[],
  keep: ReadonlySet<string>,
): Promise<void> {
  const stored = new Set(keys.filter((key) => key.startsWith(TAB_KEY_PREFIX)));
  for (const key of keys) {
    if (!key.startsWith(EDIT_KEY_PREFIX)) continue;
    const session = key.slice(EDIT_KEY_PREFIX.length);
    if (!keep.has(session) && !stored.has(tabKey(session))) await store.delete(key);
  }
}

/** 追加で開く。開けなくても起動は続ける（次に開いたときにもう一度開く） */
async function adoptQuietly(store: SessionStore, renew: boolean): Promise<void> {
  try {
    await adoptOrphans(store, renew);
  } catch {
    // 置き場が読めない・鍵が取れない環境でも画面は続ける
  }
}

/**
 * 端末に残した控えを読み、タブごと戻す。無ければ何もしない。
 * 並びは**このブラウザのタブのもの**（読み込み直し・複製）→ 最後に保存したもの（新しく開いた
 * ブラウザのタブ）の順に探す
 */
export async function restoreSession(
  store: SessionStore = defaultSessionStore(),
  tabStorage: StateStorage = safeStorage('session'),
): Promise<boolean> {
  const own = parseLayout(readText(tabStorage, TAB_LAYOUT_KEY));
  const layout = own ?? parseLayout(await getOrNull(store, LAYOUT_KEY));

  // このブラウザのタブの並びが無い＝ブラウザを起動し直した（か新しく開いた）。
  // 開いていたタブには新しいセッションを振る（読み込み直しでは今のセッションを続ける）
  const renew = own === null;
  if (layout !== null) {
    const kept = renew ? await withoutChatsOpenElsewhere(layout) : layout;
    const tabs = renew ? await renewSessions(store, kept.tabs) : kept.tabs;
    const { snapshots, written } = await loadSnapshots(store, tabs);
    useTabsStore.getState().restore(tabs, kept.activeId, snapshots);
    // このブラウザのタブの並び（読み込み直し・開き直し）のときだけ、書き換えを見る
    if (!renew) void noticeOtherWriters(tabs, snapshots, written);
    await adoptQuietly(store, renew);
    return true;
  }

  // 並びが無くても、中身だけ残っていれば開く
  await adoptQuietly(store, renew);
  return useTabsStore.getState().tabs.length > 1;
}
