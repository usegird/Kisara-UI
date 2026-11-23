import { isRemoteHost } from '@/lib/remote-host';
import type { SystemStats } from '@/port/system-stats';
import { comfyPort } from '@/store/ports/comfy-port';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';

interface EndpointKind {
  readonly place: 'private' | 'remote';
  readonly secure: boolean;
}

export function endpointKind(baseUrl: string): EndpointKind | null {
  const trimmed = baseUrl.trim();
  if (trimmed.length === 0) return null;
  return {
    place: isRemoteHost(trimmed) ? 'remote' : 'private',
    secure: /^https:\/\//i.test(trimmed),
  };
}

interface ComfyConnectionSection {
  readonly status: string;
  readonly socket: string;
  readonly endpoint: EndpointKind | null;
  readonly diagnosis: { readonly code: string; readonly status: number | null } | null;
}

export function comfyConnection(): ComfyConnectionSection {
  const { status, socketStatus, diagnosis } = useConnectionStore.getState();
  return {
    status,
    socket: socketStatus,
    endpoint: endpointKind(useSettingsStore.getState().baseUrl),
    diagnosis:
      diagnosis === null ? null : { code: diagnosis.code, status: diagnosis.status ?? null },
  };
}

export type ComfySystemSection = SystemStats | { readonly unavailable: string };

export async function readComfySystem(): Promise<ComfySystemSection> {
  const { baseUrl } = useSettingsStore.getState();
  if (useConnectionStore.getState().status !== 'connected' || baseUrl.length === 0) {
    return { unavailable: 'not-connected' };
  }
  const port = comfyPort();
  try {
    return (await port.connection.systemStats(baseUrl)) ?? { unavailable: 'bad-response' };
  } catch (error) {
    return { unavailable: port.connection.failureOf(error)?.kind ?? 'failed' };
  }
}

export function workflowShape(): {
  readonly nodes: Readonly<Record<string, number>>;
  readonly links: number;
} | null {
  const { workflow } = useGraphStore.getState();
  if (workflow === null) return null;
  const nodes = new Map<string, number>();
  for (const node of workflow.nodes) {
    const type = typeof node.type === 'string' ? node.type : '(unknown)';
    nodes.set(type, (nodes.get(type) ?? 0) + 1);
  }
  return { nodes: Object.fromEntries(nodes), links: workflow.links.length };
}

export function definitionSources(): {
  readonly count: number;
  readonly modules: Readonly<Record<string, number>>;
} {
  const { definitions } = useDefinitionsStore.getState();
  const modules = new Map<string, number>();
  for (const definition of definitions.values()) {
    const module = definition.module.length > 0 ? definition.module : '(unknown)';
    modules.set(module, (modules.get(module) ?? 0) + 1);
  }
  return { count: definitions.size, modules: Object.fromEntries(modules) };
}
