interface PackItem {
  readonly key: string;
  readonly height: number;
  readonly before?: number | undefined;
  readonly after?: number | undefined;
}

interface PackOptions {
  readonly gap: number;
}

export function packList(items: readonly PackItem[], options: PackOptions): Map<string, number> {
  const positions = new Map<string, number>();

  let cursor = 0;
  for (const item of items) {
    cursor += item.before ?? 0;
    positions.set(item.key, cursor);
    cursor += item.height + (item.after ?? 0) + options.gap;
  }
  return positions;
}
