import type { ModelFile } from '@/graph/model-files';
import type { ModelJsonEdits, ModelJsonEditValue } from '@/graph/model-json-edits';
import type { ModelJsonEntry } from '@/graph/model-metadata';
import type { RequestOptions } from '@/port/connection';

export interface ModelNoteFile {
  readonly folder: string;
  readonly filename: string;
  readonly text: string;
}

export interface ModelJsonEditsFile {
  readonly folder: string;
  readonly filename: string;
  readonly edits: ModelJsonEdits;
}

export interface ModelsPort {
  readonly fetchFiles: (
    baseUrl: string,
    folder: string,
    options?: RequestOptions,
  ) => Promise<ModelFile[]>;
  readonly fetchMetadata: (
    baseUrl: string,
    folder: string,
    filename: string,
    options?: RequestOptions,
  ) => Promise<Map<string, string>>;
  readonly listNotes: (baseUrl: string, options?: RequestOptions) => Promise<ReadonlySet<string>>;
  readonly fetchNotes: (
    baseUrl: string,
    folder: string,
    filename: string,
    options?: RequestOptions,
  ) => Promise<string | null>;
  readonly fetchPysssssNotes: (
    baseUrl: string,
    folder: string,
    filename: string,
    options?: RequestOptions,
  ) => Promise<string | null>;
  readonly hasNotesRoute: (baseUrl: string, options?: RequestOptions) => Promise<boolean>;
  readonly fetchModelJson: (
    baseUrl: string,
    folder: string,
    filename: string,
    options?: RequestOptions,
  ) => Promise<ModelJsonEntry[] | null>;
  readonly fetchJsonEdits: (
    baseUrl: string,
    folder: string,
    filename: string,
    options?: RequestOptions,
  ) => Promise<Map<string, ModelJsonEditValue>>;
  readonly saveJsonEdits: (
    baseUrl: string,
    file: ModelJsonEditsFile,
    options?: RequestOptions,
  ) => Promise<void>;
  readonly saveNotes: (
    baseUrl: string,
    note: ModelNoteFile,
    options?: RequestOptions,
  ) => Promise<void>;
  readonly previewSrc: (baseUrl: string, folder: string, file: ModelFile | null) => string | null;
}
