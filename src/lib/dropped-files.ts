const MAX_DEPTH = 8;
const MAX_FILES = 500;

export interface PathedFile {
  readonly file: File;
  readonly path: string;
}

export async function readDroppedFiles(transfer: DataTransfer): Promise<PathedFile[]> {
  const entries = [...transfer.items]
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry() : null))
    .filter((entry) => entry !== null);
  if (entries.length === 0) {
    return [...transfer.files].map((file) => ({ file, path: file.name }));
  }
  const out: PathedFile[] = [];
  for (const entry of entries) await collect(entry, '', 0, out);
  return out;
}

export function pathedFilesOf(files: readonly File[]): PathedFile[] {
  return files.map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

async function collect(
  entry: FileSystemEntry,
  folder: string,
  depth: number,
  out: PathedFile[],
): Promise<void> {
  if (out.length >= MAX_FILES) return;
  const path = `${folder}${entry.name}`;
  if (isFileEntry(entry)) {
    const file = await new Promise<File | null>((resolve) => {
      entry.file(resolve, () => resolve(null));
    });
    if (file !== null) out.push({ file, path });
    return;
  }
  if (!isDirectoryEntry(entry) || depth >= MAX_DEPTH) return;
  for (const child of await readAllEntries(entry.createReader())) {
    await collect(child, `${path}/`, depth + 1, out);
  }
}

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(resolve, () => resolve([]));
    });
    if (batch.length === 0 || all.length >= MAX_FILES) return all;
    all.push(...batch);
  }
}

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

function isDirectoryEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}
