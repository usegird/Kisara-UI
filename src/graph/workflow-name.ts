import { plainFileName } from '@/lib/file-name';

export function workflowDisplayName(path: string): string {
  const file = path.split('/').at(-1) ?? path;

  return file.replace(/\.json$/i, '');
}

export function workflowFileName(name: string): string {
  return plainFileName(name, 'json', 'workflow');
}

export interface SaveTarget {
  readonly path: string;
  readonly overwrite: boolean;
}

export function saveTarget(savedPath: string | null, name: string): SaveTarget {
  if (savedPath !== null && workflowDisplayName(savedPath) === name.trim()) {
    return { path: savedPath, overwrite: true };
  }
  const file = workflowFileName(name);
  if (savedPath === null) return { path: file, overwrite: false };

  const slash = savedPath.lastIndexOf('/');
  const path = slash < 0 ? file : `${savedPath.slice(0, slash + 1)}${file}`;

  return { path, overwrite: path === savedPath };
}
