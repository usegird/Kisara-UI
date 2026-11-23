const urls = new WeakMap<Blob, string>();

export function blobUrl(blob: Blob): string {
  const known = urls.get(blob);
  if (known !== undefined) return known;
  const url = URL.createObjectURL(blob);
  urls.set(blob, url);
  return url;
}
