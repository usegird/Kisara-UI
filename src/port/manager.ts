import type { NodePackMapping } from '@/graph/node-packs';
import type { RequestOptions } from '@/port/connection';

export interface ManagerQueueStatus {
  readonly status: 'in_progress' | 'done';
  readonly target: string | null;
  readonly results: Readonly<Record<string, string>>;
}

export interface NodePackInstall {
  readonly key: string;
  readonly registry: boolean;
}

export interface ManagerPort {
  readonly fetchVersion: (baseUrl: string, options?: RequestOptions) => Promise<string | null>;
  readonly fetchMappings: (baseUrl: string, options?: RequestOptions) => Promise<NodePackMapping[]>;
  readonly install: (
    baseUrl: string,
    pack: NodePackInstall,
    options?: RequestOptions,
  ) => Promise<void>;
  readonly reboot: (baseUrl: string, options?: RequestOptions) => Promise<void>;
}
