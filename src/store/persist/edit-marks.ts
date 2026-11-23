import { isRecord } from '@/lib/guards';
import type { SessionStore } from '@/store/persist/session-store';
import { useRunReportStore, type SaveNotice } from '@/store/use-run-report-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { lineageOf, useTabsStore, type Tab } from '@/store/use-tabs-store';

export const EDIT_KEY_PREFIX = 'edit:';

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

interface EditWatch {
  readonly mark: (tab: Tab, name: string) => Promise<void>;
  readonly check: () => Promise<void>;
}

type HeldSessions = () => Promise<ReadonlySet<string> | null>;

export function createEditWatch(
  store: SessionStore,
  held: HeldSessions,
  now: () => number = Date.now,
): EditWatch {
  const since = now();
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
    const open = await held();
    if (open === null) return;
    report.dropSaveNotices(
      (notice) =>
        notice.kind === 'parallel' && notice.source !== undefined && !open.has(notice.source),
    );
  };

  return { mark, check };
}
