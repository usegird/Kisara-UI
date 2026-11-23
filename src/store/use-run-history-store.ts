import { create } from 'zustand';

import type { RunHistoryEntry, RunHistoryFile } from '@/port/run-history';
import { createRunHistoryEditSlice } from '@/store/slices/run-history-edits';
import { createRunHistoryFileSlice } from '@/store/slices/run-history-files';
import { createRunHistorySessionSlice } from '@/store/slices/run-history-sessions';

type RunHistoryStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface RunHistoryState {
  readonly entries: readonly RunHistoryEntry[];
  readonly files: ReadonlyMap<string, RunHistoryFile>;
  readonly status: RunHistoryStatus;
  readonly error: string | null;
  readonly ingest: (baseUrl: string, raw: unknown) => Promise<void>;
  readonly load: (baseUrl: string) => Promise<void>;
  readonly fetchFiles: (baseUrl: string, names: readonly string[]) => Promise<void>;
  readonly clear: () => void;
  readonly rememberSent: (promptId: string, workflow: unknown) => void;
  readonly upTo: string | null;
  readonly setUpTo: (upTo: string | null) => void;
  readonly sessionName: string;
  readonly sessionNames: ReadonlyMap<string, string>;
  readonly loadSession: (baseUrl: string) => Promise<void>;
  readonly setSessionName: (baseUrl: string, name: string) => Promise<void>;
  readonly renameSession: (baseUrl: string, fileName: string, name: string) => Promise<void>;
  readonly removeSession: (baseUrl: string, fileName: string) => Promise<void>;
}

export const useRunHistoryStore = create<RunHistoryState>()((...store) => ({
  entries: [],
  files: new Map(),
  status: 'idle',
  error: null,
  upTo: null,
  sessionName: '',
  sessionNames: new Map(),
  ...createRunHistorySessionSlice(...store),
  ...createRunHistoryFileSlice(...store),
  ...createRunHistoryEditSlice(...store),
}));
