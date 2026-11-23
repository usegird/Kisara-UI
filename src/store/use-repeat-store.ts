import { create } from 'zustand';

export interface RepeatJob {
  readonly tabId: string;
  readonly count: number;
  readonly promptId: string | null;
  readonly sending: boolean;
  readonly failures: number;
  readonly sentAt: number;
}

interface RepeatState {
  readonly jobs: readonly RepeatJob[];
  readonly begin: (tabId: string) => boolean;
  readonly send: (tabId: string) => void;
  readonly submitted: (tabId: string, promptId: string) => void;
  readonly release: (tabId: string, failed: boolean) => void;
  readonly stop: (tabId: string) => void;
}

type RepeatOutcome = 'pending' | 'next' | 'failed';

export interface RepeatSignals {
  readonly execution: {
    readonly promptId: string | null;
    readonly status: string;
  };
  readonly logged: boolean | null;
}

export function repeatOutcome(promptId: string, signals: RepeatSignals): RepeatOutcome {
  const { execution, logged } = signals;
  if (execution.promptId === promptId) {
    if (execution.status === 'failed' || execution.status === 'unknown') return 'failed';
    if (execution.status === 'done') return 'next';
  }
  if (logged === null) return 'pending';
  return logged ? 'next' : 'failed';
}

function updateJob(
  jobs: readonly RepeatJob[],
  tabId: string,
  change: (job: RepeatJob) => RepeatJob,
): readonly RepeatJob[] {
  return jobs.some((job) => job.tabId === tabId)
    ? jobs.map((job) => (job.tabId === tabId ? change(job) : job))
    : jobs;
}

export const useRepeatStore = create<RepeatState>()((set, get) => ({
  jobs: [],

  begin: (tabId) => {
    if (get().jobs.some((job) => job.tabId === tabId)) return false;
    set((state) => ({
      jobs: [
        ...state.jobs,
        { tabId, count: 0, promptId: null, sending: false, failures: 0, sentAt: 0 },
      ],
    }));
    return true;
  },

  send: (tabId) =>
    set((state) => ({ jobs: updateJob(state.jobs, tabId, (job) => ({ ...job, sending: true })) })),

  submitted: (tabId, promptId) =>
    set((state) => ({
      jobs: updateJob(state.jobs, tabId, (job) => ({
        ...job,
        promptId,
        sending: false,
        count: job.count + 1,
        sentAt: Date.now(),
      })),
    })),

  release: (tabId, failed) =>
    set((state) => ({
      jobs: updateJob(state.jobs, tabId, (job) => ({
        ...job,
        promptId: null,
        failures: failed ? job.failures + 1 : 0,
      })),
    })),

  stop: (tabId) =>
    set((state) =>
      state.jobs.some((job) => job.tabId === tabId)
        ? { jobs: state.jobs.filter((job) => job.tabId !== tabId) }
        : state,
    ),
}));
