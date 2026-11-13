import { isRecord } from '@/lib/guards';
import type { SessionStore } from '@/store/persist/session-store';
import { useRunReportStore, type SaveNotice } from '@/store/use-run-report-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { lineageOf, useTabsStore, type Tab } from '@/store/use-tabs-store';

// ─────────────────────────────
// 編集の印。写しの関係にあるタブを 2 か所で直していないかを、置き場のデータだけで見分け、
// エラーの一覧に注意を出す（ブラウザのタブ間の連絡は使わない）。
// ─────────────────────────────

/** 編集の印の鍵の頭。後ろにセッションの id を付ける */
export const EDIT_KEY_PREFIX = 'edit:';

/** そのセッションの編集の印の鍵 */
export function editKey(session: string): string {
  return `${EDIT_KEY_PREFIX}${session}`;
}

interface EditMark {
  readonly lineage: string;
  readonly writer: string;
  readonly name: string;
  readonly savedAt: number;
}

function parseMark(raw: unknown): EditMark | null {
  if (!isRecord(raw)) return null;
  const { lineage, writer, name, savedAt } = raw;
  if (typeof lineage !== 'string' || typeof writer !== 'string') return null;
  if (typeof name !== 'string' || typeof savedAt !== 'number') return null;
  return { lineage, writer, name, savedAt };
}

/** 編集の印を書く・読む手続き */
interface EditWatch {
  /** このタブを編集して書いたことを印に残す */
  readonly mark: (tab: Tab, name: string) => Promise<void>;
  /**
   * 印を読み、写しの関係にあるタブがほかで編集されていたら注意を出す。編集したセッションをどの
   * ブラウザのタブも開いていなくなった注意は外す
   */
  readonly check: () => Promise<void>;
}

/** 鍵（Web Locks）が持たれているセッション。鍵の一覧が取れなければ null（session.ts が渡す） */
type HeldSessions = () => Promise<ReadonlySet<string> | null>;

/**
 * 印の読み書きを用意する。始めた時点より前の編集は数えない（写したときに中身へ入っている）。
 * 同じ編集で注意を重ねないよう、読んだ印の時刻を覚える
 */
export function createEditWatch(
  store: SessionStore,
  held: HeldSessions,
  now: () => number = Date.now,
): EditWatch {
  const since = now();
  /** 印の鍵 → 最後に注意した編集の時刻 */
  const seen = new Map<string, number>();

  const mark = async (tab: Tab, name: string): Promise<void> => {
    const lineage = lineageOf(tab);
    if (lineage === undefined || tab.runSession === undefined) return;
    const value: EditMark = {
      lineage,
      writer: useSettingsStore.getState().clientId,
      name,
      savedAt: now(),
    };
    await store.put(editKey(tab.runSession), value);
  };

  const check = async (): Promise<void> => {
    const clientId = useSettingsStore.getState().clientId;
    const tabs = useTabsStore.getState().tabs;
    const mine = new Set(
      tabs.flatMap((tab) => (tab.runSession === undefined ? [] : [tab.runSession])),
    );
    const notices: SaveNotice[] = [];

    for (const key of await store.keys()) {
      if (!key.startsWith(EDIT_KEY_PREFIX) || mine.has(key.slice(EDIT_KEY_PREFIX.length))) continue;
      const found = parseMark(await store.get(key));
      if (found === null || found.writer === clientId) continue;
      if (found.savedAt <= Math.max(since, seen.get(key) ?? 0)) continue;
      seen.set(key, found.savedAt);
      for (const tab of tabs) {
        if (lineageOf(tab) !== found.lineage) continue;
        notices.push({
          kind: 'parallel',
          tabId: tab.id,
          name: found.name,
          savedAt: found.savedAt,
          source: key.slice(EDIT_KEY_PREFIX.length),
        });
      }
    }
    const report = useRunReportStore.getState();
    if (notices.length > 0) report.addSaveNotices(notices);
    // 編集したセッションをどのブラウザのタブも開いていなければ、2 か所での編集は終わっている。
    // 鍵の一覧が取れないときは確かめられないので外さない
    const open = await held();
    if (open === null) return;
    report.dropSaveNotices(
      (notice) =>
        notice.kind === 'parallel' && notice.source !== undefined && !open.has(notice.source),
    );
  };

  return { mark, check };
}
