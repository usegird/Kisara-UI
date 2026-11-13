import { isRemoteHost } from '@/lib/remote-host';
import type { SystemStats } from '@/port/system-stats';
import { comfyPort } from '@/store/ports/comfy-port';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 診断ファイルの ComfyUI の区分。**URL・タブの名前・値は入れない。**
// 接続先は種類（私的なアドレスか・保護された経路か）だけ、ワークフローは `class_type` ごとの数だけにする
// ─────────────────────────────

/** 接続先の種類。URL が無ければ null */
interface EndpointKind {
  readonly place: 'private' | 'remote';
  readonly secure: boolean;
}

/** 接続先の URL から種類だけを取り出す。空なら null */
export function endpointKind(baseUrl: string): EndpointKind | null {
  const trimmed = baseUrl.trim();
  if (trimmed.length === 0) return null;
  return {
    place: isRemoteHost(trimmed) ? 'remote' : 'private',
    secure: /^https:\/\//i.test(trimmed),
  };
}

/** 診断ファイルの ComfyUI の接続の節 */
interface ComfyConnectionSection {
  readonly status: string;
  readonly socket: string;
  readonly endpoint: EndpointKind | null;
  /** 直近の失敗の推定（種類と番号だけ） */
  readonly diagnosis: { readonly code: string; readonly status: number | null } | null;
}

/** 今の接続の状態から、診断ファイルの接続の節を組み立てる */
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

/** 版を読めなかったときは、読めなかった理由の種類 */
export type ComfySystemSection = SystemStats | { readonly unavailable: string };

/** 接続していれば版と実行環境を 1 回読む（`GET /system_stats`）。読めなければ理由の種類 */
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

/** 開いているワークフローの形。`class_type` ごとのノードの数と link の数 */
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

/** ノード定義の数と、出どころ（`python_module`）ごとの数 */
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
