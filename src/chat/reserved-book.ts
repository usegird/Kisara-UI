export const RESERVED_BOOK_PREFIX = '##';

export function isReservedBookName(name: string): boolean {
  return name.trim().startsWith(RESERVED_BOOK_PREFIX);
}

export function importedBookName(name: string): string {
  const trimmed = name.trim();
  return isReservedBookName(trimmed) ? trimmed.replace(/^#+\s*/u, '') : trimmed;
}
