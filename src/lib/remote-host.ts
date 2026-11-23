const PRIVATE_V4 = [
  { base: 0x7f000000, mask: 0xff000000 },
  { base: 0x0a000000, mask: 0xff000000 },
  { base: 0xac100000, mask: 0xfff00000 },
  { base: 0xc0a80000, mask: 0xffff0000 },
  { base: 0xa9fe0000, mask: 0xffff0000 },
  { base: 0x64400000, mask: 0xffc00000 },
  { base: 0x00000000, mask: 0xff000000 },
] as const;

const IPV4_OCTETS = 4;
const MAX_OCTET = 255;
const OCTET_RANGE = 256;

function ipv4(host: string): number | null {
  const parts = host.split('.');
  if (parts.length !== IPV4_OCTETS) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > MAX_OCTET) return null;
    value = value * OCTET_RANGE + octet;
  }
  return value;
}

function privateV6(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (bare === '::1' || bare === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(bare)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(bare)) return true;
  const embedded = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(bare)?.[1];
  return embedded !== undefined && privateV4(embedded);
}

function privateV4(host: string): boolean {
  const value = ipv4(host);
  return (
    value !== null &&
    PRIVATE_V4.some(({ base, mask }) => (value & mask) >>> 0 === (base & mask) >>> 0)
  );
}

const PRIVATE_SUFFIXES = ['.localhost', '.local', '.test', '.home.arpa'] as const;

export function isPrivateHost(host: string): boolean {
  const name = host.trim().toLowerCase();
  if (name.length === 0) return false;
  if (name === 'localhost' || PRIVATE_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true;
  if (privateV4(name) || privateV6(name)) return true;
  return !name.includes('.') && !name.includes(':') && ipv4(name) === null;
}

function parseBaseUrl(baseUrl: string): URL | null {
  const trimmed = baseUrl.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

export function isRemoteHost(baseUrl: string): boolean {
  const url = parseBaseUrl(baseUrl);
  return url !== null && !isPrivateHost(url.hostname);
}

export function hostKeyOf(baseUrl: string): string {
  const host = parseBaseUrl(baseUrl)?.host ?? '';
  return host.length > 0 ? host : baseUrl.trim();
}
