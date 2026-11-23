import type { ComfyPort } from '@/port/comfy-port';
import { guardComfyPort } from '@/store/ports/network-consent';
import { traceComfyPort } from '@/store/ports/trace-ports';

let current: ComfyPort | null = null;

export function installComfyPort(port: ComfyPort): void {
  current = traceComfyPort(guardComfyPort(port));
}

export function installComfyPortWithoutConsent(port: ComfyPort): void {
  current = port;
}

export function comfyPort(): ComfyPort {
  if (current === null) throw new Error('ComfyPort is not installed (call installComfyPort first)');
  return current;
}
