export function wildcardPath(name: string): string {
  return name.replace(/^__/u, '').replace(/__$/u, '');
}

export function wildcardDirectory(name: string): string {
  const path = wildcardPath(name);
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}

export function wildcardLabel(name: string): string {
  const path = wildcardPath(name);
  return path.slice(path.lastIndexOf('/') + 1);
}
