import type { SavedStyle, StyleTable } from '@/graph/styles';
import type { WorkflowTemplate } from '@/graph/template-filter';
import type { NodeDefinition, NodeDefinitionMap } from '@/graph/types';
import type {
  ConnectionDiagnosis,
  ReconnectPolicy,
  RequestFailure,
  RequestOptions,
  SocketGiveUp,
  SocketStatus,
} from '@/port/connection';
import type { OutputFileRef, OutputImageBody, OutputText } from '@/port/files';
import type { HistoryDetail, HistoryResult, QueueSnapshot } from '@/port/history';
import type { ManagerPort } from '@/port/manager';
import type { ModelsPort } from '@/port/models';
import type {
  ComfyEvent,
  PromptAccepted,
  PromptNode,
  PromptRejection,
  RunFailure,
  SubmitPromptParams,
} from '@/port/run';
import type {
  HistoryRunSource,
  RunHistoryEntry,
  RunHistoryFile,
  RunHistoryRead,
} from '@/port/run-history';
import type { SystemStats } from '@/port/system-stats';
import type { TagsPort } from '@/port/tags';
import type { SavedWorkflow, TemplateIndex, WorkflowSaveFailure } from '@/port/workflows';

interface ConnectionPort {
  readonly check: (baseUrl: string) => Promise<void>;
  readonly diagnose: (error: unknown, baseUrl: string) => Promise<ConnectionDiagnosis>;
  readonly failureOf: (error: unknown) => RequestFailure | null;
  readonly systemStats: (baseUrl: string, options?: RequestOptions) => Promise<SystemStats | null>;
}

export interface DefinitionsPort {
  readonly fetchAll: (baseUrl: string, options?: RequestOptions) => Promise<NodeDefinitionMap>;
  readonly fetchOne: (
    baseUrl: string,
    className: string,
    options?: RequestOptions,
  ) => Promise<NodeDefinition | null>;
  readonly fetchFrequency: (baseUrl: string, options?: RequestOptions) => Promise<string[]>;
}

interface RunPort {
  readonly submit: (
    baseUrl: string,
    params: SubmitPromptParams,
    options?: RequestOptions,
  ) => Promise<PromptAccepted>;
  readonly interrupt: (
    baseUrl: string,
    promptId: string,
    options?: RequestOptions,
  ) => Promise<void>;
  readonly rejectionOf: (error: unknown) => PromptRejection | null;
}

export interface EventOptions {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly onEvent: (event: ComfyEvent) => void;
  readonly onStatus: (status: SocketStatus) => void;
  readonly onRetry?: (attempt: number) => void;
  readonly onGiveUp?: (reason: SocketGiveUp) => void;
  readonly countsDrop?: () => boolean;
  readonly reconnect: ReconnectPolicy;
}

export interface EventConnection {
  readonly status: () => SocketStatus;
  readonly suspect: () => void;
  readonly close: () => void;
}

interface EventsPort {
  readonly connect: (options: EventOptions) => EventConnection;
}

interface QueuePort {
  readonly fetchQueue: (baseUrl: string, options?: RequestOptions) => Promise<QueueSnapshot>;
  readonly deleteQueued: (
    baseUrl: string,
    promptId: string,
    options?: RequestOptions,
  ) => Promise<void>;
  readonly fetchHistory: (
    baseUrl: string,
    maxItems: number | undefined,
    options?: RequestOptions,
  ) => Promise<HistoryResult>;
  readonly fetchHistoryItem: (
    baseUrl: string,
    promptId: string,
    options?: RequestOptions,
  ) => Promise<HistoryDetail | null>;
  readonly fetchPromptFromImage: (
    baseUrl: string,
    file: OutputFileRef,
    options?: RequestOptions,
  ) => Promise<Readonly<Record<string, unknown>> | null>;
  readonly fetchWorkflowFromImage: (
    baseUrl: string,
    file: OutputFileRef,
    options?: RequestOptions,
  ) => Promise<Readonly<Record<string, unknown>> | null>;
  readonly fetchOutputImage: (
    baseUrl: string,
    file: OutputFileRef,
    options?: RequestOptions,
  ) => Promise<OutputImageBody>;
  readonly outputSrc: (baseUrl: string, file: OutputFileRef) => string;
  readonly entryNodesOf: (entry: unknown) => Readonly<Record<string, unknown>> | null;
  readonly entryFailureOf: (entry: unknown) => RunFailure | null;
  readonly entryTextsOf: (entry: unknown) => readonly OutputText[];
  readonly promptNodesOf: (nodes: Readonly<Record<string, unknown>>) => Map<string, PromptNode>;
}

interface WorkflowsPort {
  readonly list: (baseUrl: string, options?: RequestOptions) => Promise<SavedWorkflow[]>;
  readonly fetch: (baseUrl: string, path: string, options?: RequestOptions) => Promise<unknown>;
  readonly save: (
    baseUrl: string,
    path: string,
    content: string,
    options?: { readonly overwrite?: boolean } & RequestOptions,
  ) => Promise<void>;
  readonly saveFailure: (error: unknown) => WorkflowSaveFailure | null;
  readonly listTemplates: (
    baseUrl: string,
    locale: string,
    options?: RequestOptions,
  ) => Promise<TemplateIndex>;
  readonly fetchTemplate: (
    baseUrl: string,
    name: string,
    options?: RequestOptions,
  ) => Promise<unknown>;
  readonly templateThumbnailSrc: (baseUrl: string, template: WorkflowTemplate) => string | null;
}

interface InputImagesPort {
  readonly upload: (baseUrl: string, file: File, options?: RequestOptions) => Promise<string>;
  readonly uploadTemp: (
    baseUrl: string,
    file: File,
    subfolder: string,
    options?: RequestOptions,
  ) => Promise<string>;
  readonly src: (baseUrl: string, value: string) => string | null;
}

export interface AssetsPort {
  readonly fetchStyleTable: (baseUrl: string, options?: RequestOptions) => Promise<StyleTable>;
  readonly fetchSavedStyles: (baseUrl: string, options?: RequestOptions) => Promise<SavedStyle[]>;
  readonly saveStyle: (
    baseUrl: string,
    entry: SavedStyle,
    options?: RequestOptions,
  ) => Promise<void>;
  readonly fetchWildcards: (baseUrl: string, options?: RequestOptions) => Promise<string[] | null>;
  readonly fetchWildcardEntries: (
    baseUrl: string,
    name: string,
    options?: RequestOptions,
  ) => Promise<string[] | null>;
}

interface RunHistoryPort {
  readonly list: (baseUrl: string, options?: RequestOptions) => Promise<RunHistoryEntry[]>;
  readonly fetch: (
    baseUrl: string,
    name: string,
    options?: RequestOptions,
  ) => Promise<RunHistoryRead>;
  readonly save: (
    baseUrl: string,
    name: string,
    file: RunHistoryFile,
    options?: RequestOptions,
  ) => Promise<void>;
  readonly sourcesOf: (raw: unknown) => HistoryRunSource[];
}

export interface ChatFiles {
  readonly id: string;
  readonly body: string;
  readonly meta: string;
}

export interface ChatsPort {
  readonly listMetas: (baseUrl: string, options?: RequestOptions) => Promise<unknown[]>;
  readonly fetchChat: (baseUrl: string, id: string, options?: RequestOptions) => Promise<unknown>;
  readonly saveChat: (baseUrl: string, files: ChatFiles, options?: RequestOptions) => Promise<void>;
  readonly removeChat: (baseUrl: string, id: string, options?: RequestOptions) => Promise<void>;
  readonly isFull: (error: unknown) => boolean;
}

export type LibraryKind = 'presets' | 'system-prompts' | 'dictionaries' | 'playbooks' | 'avatars';

export interface LibraryItemFile {
  readonly kind: LibraryKind;
  readonly id: string;
  readonly body: string;
  readonly image: Blob | null;
}

export interface LibraryBackupPort {
  readonly list: (
    baseUrl: string,
    kind: LibraryKind,
    options?: RequestOptions,
  ) => Promise<unknown[]>;
  readonly save: (
    baseUrl: string,
    item: LibraryItemFile,
    options?: RequestOptions,
  ) => Promise<void>;
  readonly fetchImage: (
    baseUrl: string,
    kind: LibraryKind,
    id: string,
    options?: RequestOptions,
  ) => Promise<Blob | null>;
  readonly remove: (
    baseUrl: string,
    kind: LibraryKind,
    id: string,
    options?: RequestOptions,
  ) => Promise<void>;
}

export type UserFileKind = 'history' | 'notes' | 'styles' | 'tags';

export interface UserFile {
  readonly path: string;
  readonly bytes: number;
  readonly modified: number | null;
}

interface UserFilesPort {
  readonly list: (
    baseUrl: string,
    kind: UserFileKind,
    options?: RequestOptions,
  ) => Promise<UserFile[]>;
  readonly read: (
    baseUrl: string,
    kind: UserFileKind,
    path: string,
    options?: RequestOptions,
  ) => Promise<string | null>;
  readonly remove: (
    baseUrl: string,
    kind: UserFileKind,
    path: string,
    options?: RequestOptions,
  ) => Promise<void>;
}

export interface ComfyPort {
  readonly connection: ConnectionPort;
  readonly definitions: DefinitionsPort;
  readonly run: RunPort;
  readonly events: EventsPort;
  readonly queue: QueuePort;
  readonly workflows: WorkflowsPort;
  readonly models: ModelsPort;
  readonly inputImages: InputImagesPort;
  readonly assets: AssetsPort;
  readonly tags: TagsPort;
  readonly runHistory: RunHistoryPort;
  readonly chats: ChatsPort;
  readonly library: LibraryBackupPort;
  readonly userFiles: UserFilesPort;
  readonly manager: ManagerPort;
}
