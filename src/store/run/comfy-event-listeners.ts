import type { ComfyEvent } from '@/port/run';

type Listener = (event: ComfyEvent) => void;

const listeners = new Set<Listener>();

export function listenComfyEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitComfyEvent(event: ComfyEvent): void {
  for (const listener of listeners) listener(event);
}
