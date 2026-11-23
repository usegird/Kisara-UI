import { create } from 'zustand';

import { isRecord } from '@/lib/guards';
import type { OutputFileRef } from '@/port/files';
import { isKnownGone, noteGone, probeBoundary, type TempProbe } from '@/store/kit/gone-temps';
import { registerHolder, trimHeld } from '@/store/kit/memory-budget';
import { comfyPort } from '@/store/ports/comfy-port';
import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useSettingsStore } from '@/store/use-settings-store';

const MODIFIED_SLACK_MS = 2000;

interface HeldImage {
  readonly src: string;
  readonly bytes: number;
  readonly order: number;
  readonly modifiedAt: number | null;
}

export interface EnsureOptions {
  readonly order?: number | undefined;
  readonly until?: number | undefined;
}

export type OutputImageEntry =
  'pending' | 'failed' | 'offline' | 'missing' | 'released' | HeldImage;

interface OutputImagesState {
  readonly images: ReadonlyMap<string, OutputImageEntry>;
  readonly ensure: (baseUrl: string, file: OutputFileRef, options?: EnsureOptions) => Promise<void>;
}

export function outputViewUrl(baseUrl: string, file: OutputFileRef): string | null {
  if (baseUrl.trim().length === 0) return null;
  try {
    return comfyPort().queue.outputSrc(baseUrl, file);
  } catch {
    return null;
  }
}

export function outputSrc(
  images: ReadonlyMap<string, OutputImageEntry>,
  url: string,
  until?: number,
): string | null | false {
  if (!canHold()) return url;

  const entry = images.get(url);
  if (entry === undefined || entry === 'pending' || entry === 'offline') return null;
  if (entry === 'missing') return false;
  if (typeof entry !== 'object') return url;
  return writtenAfter(entry, until) ? false : entry.src;
}

function writtenAfter(entry: HeldImage, until: number | undefined): boolean {
  if (until === undefined || entry.modifiedAt === null) return false;
  return entry.modifiedAt > until + MODIFIED_SLACK_MS;
}

function answeredWithStatus(error: unknown): boolean {
  return isRecord(error) && typeof error.status === 'number';
}

function canHold(): boolean {
  return typeof URL.createObjectURL === 'function';
}

function releaseImages(
  images: ReadonlyMap<string, OutputImageEntry>,
  urls: ReadonlySet<string>,
): Map<string, OutputImageEntry> {
  const next = new Map(images);
  for (const url of urls) {
    const entry = next.get(url);
    if (typeof entry !== 'object') continue;
    URL.revokeObjectURL(entry.src);
    next.set(url, 'released');
  }
  return next;
}

const inFlight = new Map<string, Promise<void>>();

interface HoldRequest {
  readonly baseUrl: string;
  readonly file: OutputFileRef;
  readonly url: string;
  readonly order: number;
  readonly until: number | undefined;
  readonly done: () => void;
}

let requested: HoldRequest[] = [];

export const useOutputImagesStore = create<OutputImagesState>()((set, get) => ({
  images: new Map(),

  ensure: (baseUrl, file, options = {}) => {
    const order = options.order ?? Date.now();
    const { until } = options;
    const url = outputViewUrl(baseUrl, file);
    if (url === null) return Promise.resolve();
    if (!canHold() || get().images.has(url)) return inFlight.get(url) ?? Promise.resolve();
    if (isKnownGone(baseUrl, file.type, until)) {
      set((state) => ({ images: new Map(state.images).set(url, 'missing') }));
      return Promise.resolve();
    }

    set((state) => ({ images: new Map(state.images).set(url, 'pending') }));
    const task = new Promise<void>((done) => {
      requested.push({ baseUrl, file, url, order, until, done });
      if (requested.length === 1) queueMicrotask(readRequested);
    }).finally(() => inFlight.delete(url));

    inFlight.set(url, task);
    return task;
  },
}));

registerHolder('output-images', {
  held: () =>
    [...useOutputImagesStore.getState().images].flatMap(([key, entry]) =>
      typeof entry === 'object' ? [{ key, bytes: entry.bytes, order: entry.order }] : [],
    ),
  release: (keys) =>
    useOutputImagesStore.setState((state) => ({ images: releaseImages(state.images, keys) })),
});

function readRequested(): void {
  const batch = requested.sort((a, b) => a.order - b.order);
  requested = [];
  const temps = batch.filter(
    (request) => request.file.type === 'temp' && request.until !== undefined,
  );
  for (const request of batch) if (!temps.includes(request)) void read(request);
  void readTemps(temps);
}

async function readTemps(temps: readonly HoldRequest[]): Promise<void> {
  const sorted = [...temps].sort((a, b) => (a.until ?? 0) - (b.until ?? 0));
  const { probed, firstPresent } = await probeBoundary(sorted.length, (index) => {
    const request = sorted[index];
    return request === undefined ? Promise.resolve<TempProbe>('unknown') : read(request);
  });
  sorted.forEach((request, index) => {
    if (probed.has(index)) return;
    if (firstPresent !== null && index < firstPresent) markGone(request);
    else void read(request);
  });
}

function markGone({ url, done }: HoldRequest): void {
  useOutputImagesStore.setState((state) => ({ images: new Map(state.images).set(url, 'missing') }));
  done();
}

async function read(request: HoldRequest): Promise<TempProbe> {
  const { baseUrl, file, url, order, until, done } = request;
  const put = (entry: OutputImageEntry): void =>
    useOutputImagesStore.setState((state) => ({ images: new Map(state.images).set(url, entry) }));
  const offline = useConnectionStore.getState().status !== 'connected';
  try {
    const { blob, modifiedAt } = await comfyPort().queue.fetchOutputImage(
      baseUrl,
      file,
      offline ? { cache: 'force-cache' } : {},
    );
    const held = { src: URL.createObjectURL(blob), bytes: blob.size, order, modifiedAt };
    put(held);
    trimHeld();
    if (!writtenAfter(held, until)) return 'present';
    noteGone(baseUrl, file.type, until);
    return 'gone';
  } catch (error) {
    if (!answeredWithStatus(error)) {
      put(offline ? 'offline' : 'failed');
      return 'unknown';
    }
    put('missing');
    noteGone(baseUrl, file.type, until);
    return 'gone';
  } finally {
    done();
  }
}

useExecutionStore.subscribe((state, previous) => {
  if (state.outputsById === previous.outputsById) return;
  const { baseUrl } = useSettingsStore.getState();
  const written = new Set<string>();
  for (const [promptId, run] of Object.entries(state.outputsById)) {
    const before = previous.outputsById[promptId];
    for (const [node, files] of Object.entries(run)) {
      if (before?.[node] === files) continue;
      for (const file of files) {
        const url = outputViewUrl(baseUrl, file);
        if (url !== null) written.add(url);
      }
    }
  }
  const { images } = useOutputImagesStore.getState();
  if (![...written].some((url) => images.has(url))) return;
  const next = new Map(images);
  for (const url of written) {
    const entry = next.get(url);
    if (entry === undefined || entry === 'pending') continue;
    if (typeof entry === 'object') URL.revokeObjectURL(entry.src);
    next.delete(url);
  }
  useOutputImagesStore.setState({ images: next });
});

useConnectionStore.subscribe((state, previous) => {
  if (state.status !== 'connected' || previous.status === 'connected') return;
  const { images } = useOutputImagesStore.getState();
  if (![...images.values()].includes('offline')) return;
  useOutputImagesStore.setState({
    images: new Map([...images].filter(([, entry]) => entry !== 'offline')),
  });
});
