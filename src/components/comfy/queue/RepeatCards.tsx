import { Repeat, Square } from 'lucide-react';

import { t } from '@/i18n';
import { useGraphStore } from '@/store/use-graph-store';
import { useRepeatStore, type RepeatJob } from '@/store/use-repeat-store';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { useTabsStore } from '@/store/use-tabs-store';

export function RepeatCards(): React.ReactElement | null {
  const jobs = useRepeatStore((state) => state.jobs);
  if (jobs.length === 0) return null;

  return (
    <>
      {jobs.map((job) => (
        <RepeatItem key={job.tabId} job={job} />
      ))}
    </>
  );
}

function RepeatItem({ job }: { readonly job: RepeatJob }): React.ReactElement {
  const stop = useRepeatStore((state) => state.stop);
  const { tabId } = job;
  const active = useTabsStore((state) => state.activeId === tabId);
  const snapshotName = useTabsStore((state) => state.snapshots[tabId]?.name ?? '');
  const activeName = useGraphStore((state) => state.name);
  const session = useTabsStore(
    (state) => state.tabs.find((tab) => tab.id === tabId)?.runSession ?? null,
  );
  const activeSessionName = useRunHistoryStore((state) => state.sessionName);
  const knownSessionName = useRunHistoryStore((state) =>
    session === null ? '' : (state.sessionNames.get(session) ?? ''),
  );

  const name = (active ? activeName : snapshotName) || t('queue.repeat.untitled');
  const sessionLabel = (active ? activeSessionName : knownSessionName) || session || '';

  return (
    <li
      className="border-slot-conditioning/40 bg-slot-conditioning/10 flex w-full min-w-0
        items-center gap-2 rounded-md border p-1.5 text-2xs"
      role="status"
    >
      <div
        className="border-slot-conditioning/30 text-slot-conditioning flex size-14 shrink-0
          items-center justify-center rounded border"
      >
        <Repeat className="size-5" aria-hidden />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          <span className="min-w-0 truncate">{t('queue.repeat.running')}</span>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {t('queue.repeat.count', { count: String(job.count) })}
          </span>
        </span>
        <span className="min-w-0 truncate whitespace-nowrap" title={name}>
          {name}
        </span>
        {sessionLabel.length === 0 ? null : (
          <span
            className="text-muted-foreground min-w-0 truncate whitespace-nowrap"
            title={sessionLabel}
          >
            {sessionLabel}
          </span>
        )}
      </div>
      <button
        type="button"
        className="border-input hover:bg-muted inline-flex shrink-0 items-center rounded-md border
          p-1.5"
        aria-label={t('queue.repeat.stop')}
        title={t('queue.repeat.stopHint')}
        onClick={() => stop(tabId)}
      >
        <Square className="size-3" aria-hidden />
      </button>
    </li>
  );
}
