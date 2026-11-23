export interface PathDirectory {
  readonly path: string;
  readonly label: string;
  readonly depth: number;
  readonly count: number;
}

export function directoryTree(directories: readonly string[]): PathDirectory[] {
  const counts = new Map<string, number>();

  for (const directory of directories) {
    if (directory.length === 0) continue;

    const segments = directory.split('/');
    for (let end = 1; end <= segments.length; end += 1) {
      const path = segments.slice(0, end).join('/');
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }

  return [...counts.keys()].sort().map((path) => ({
    path,
    label: path.split('/').pop() ?? path,
    depth: path.split('/').length - 1,
    count: counts.get(path) ?? 0,
  }));
}

export interface PathLeaf {
  readonly key: string;
  readonly path: string;
}

export type PathTreeRow =
  | ({ readonly kind: 'directory' } & PathDirectory)
  | {
      readonly kind: 'leaf';
      readonly key: string;
      readonly path: string;
      readonly label: string;
      readonly depth: number;
    };

export function pathTreeRows(
  directories: readonly PathDirectory[],
  leaves: readonly PathLeaf[],
): PathTreeRow[] {
  const childDirectories = new Map<string, PathDirectory[]>();
  for (const directory of directories) {
    const parent = splitPath(directory.path).directory;
    childDirectories.set(parent, [...(childDirectories.get(parent) ?? []), directory]);
  }
  const childLeaves = new Map<string, PathLeaf[]>();
  for (const leaf of [...leaves].sort((a, b) => a.path.localeCompare(b.path))) {
    const parent = splitPath(leaf.path).directory;
    childLeaves.set(parent, [...(childLeaves.get(parent) ?? []), leaf]);
  }

  const rows: PathTreeRow[] = [];
  const visit = (parent: string, depth: number): void => {
    for (const directory of childDirectories.get(parent) ?? []) {
      rows.push({ kind: 'directory', ...directory });
      visit(directory.path, directory.depth + 1);
    }
    for (const leaf of childLeaves.get(parent) ?? []) {
      rows.push({
        kind: 'leaf',
        key: leaf.key,
        path: leaf.path,
        label: splitPath(leaf.path).label,
        depth,
      });
    }
  };
  visit('', 0);
  return rows;
}

export function visibleTreeRows(
  rows: readonly PathTreeRow[],
  isOpen: (path: string) => boolean,
): PathTreeRow[] {
  return rows.filter((row) => {
    const segments = splitPath(row.path).directory.split('/');
    if (segments[0] === '') return true;
    return segments.every((_, end) => isOpen(segments.slice(0, end + 1).join('/')));
  });
}

export function splitPath(path: string): { readonly directory: string; readonly label: string } {
  const at = path.lastIndexOf('/');
  return at < 0
    ? { directory: '', label: path }
    : { directory: path.slice(0, at), label: path.slice(at + 1) };
}

export function isUnderDirectory(directory: string, selected: string): boolean {
  return selected.length === 0 || directory === selected || directory.startsWith(`${selected}/`);
}
