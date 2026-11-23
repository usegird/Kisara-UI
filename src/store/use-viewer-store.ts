import { create } from 'zustand';

import { isRecord } from '@/lib/guards';
import type { Popup } from '@/lib/popup';
import type { QueueTask } from '@/queue/queue-tasks';
import type { SlideFilter } from '@/queue/viewer-slides';
import { registerTabScoped } from '@/store/kit/tab-scoped';

type ViewerMode = 'closed' | 'overlay' | 'window';

export const VIEWER_WINDOW = 'kisaraui-image-viewer';

interface ViewerState {
  readonly mode: ViewerMode;
  readonly current: string | null;
  readonly popup: Popup | null;
  readonly blocked: boolean;
  readonly tasks: readonly QueueTask[] | null;
  readonly owner: string | null;
  readonly filter: SlideFilter;
  readonly setFilter: (filter: SlideFilter) => void;
  readonly openOverlay: (
    key: string | null,
    tasks?: readonly QueueTask[] | null,
    owner?: string | null,
  ) => void;
  readonly setTasks: (tasks: readonly QueueTask[]) => void;
  readonly openWindow: (popup: Popup | null, key?: string | null) => void;
  readonly setCurrent: (key: string) => void;
  readonly close: () => void;
}

const CLOSED = {
  mode: 'closed' as ViewerMode,
  current: null,
  popup: null,
  blocked: false,
  tasks: null,
  owner: null,
};

export const useViewerStore = create<ViewerState>()((set) => ({
  ...CLOSED,
  filter: 'all',

  setFilter: (filter) => set({ filter }),

  openOverlay: (key, tasks = null, owner = null) =>
    set({ mode: 'overlay', current: key, blocked: false, tasks, owner }),

  setTasks: (tasks) => set({ tasks }),

  openWindow: (popup, key) =>
    set((state) =>
      popup === null
        ? { blocked: true }
        : {
            mode: 'window',
            popup,
            blocked: false,
            current: key === undefined ? state.current : key,
          },
    ),

  setCurrent: (current) => set({ current }),

  close: () => set(CLOSED),
}));

registerTabScoped('viewer', {
  capture: () => {
    const { mode, current, tasks } = useViewerStore.getState();
    return mode === 'overlay' && tasks === null ? { current } : undefined;
  },
  restore: (saved) => {
    const viewer = useViewerStore.getState();
    if (isRecord(saved)) {
      viewer.openOverlay(typeof saved.current === 'string' ? saved.current : null);
    } else if (viewer.mode === 'overlay') {
      viewer.close();
    }
  },
});
