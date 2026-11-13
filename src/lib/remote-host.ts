// ─────────────────────────────
// 宛先が自分の端末や私的なネットワークの外かの見分け（接続前の注意の関門が使う）。
// ホスト名の表を持たず、私的なアドレスの範囲だけで決める（接続先の名前を決め打ちしない）。
// ─────────────────────────────

const PRIVATE_V4 = [
  { base: 0x7f000000, mask: 0xff000000 }, // 127.0.0.0/8
  { base: 0x0a000000, mask: 0xff000000 }, // 10.0.0.0/8
  { base: 0xac100000, mask: 0xfff00000 }, // 172.16.0.0/12
  { base: 0xc0a80000, mask: 0xffff0000 }, // 192.168.0.0/16
  { base: 0xa9fe0000, mask: 0xffff0000 }, // 169.254.0.0/16（リンクローカル）
  { base: 0x64400000, mask: 0xffc00000 }, // 100.64.0.0/10（CGNAT。VPN の仮想ネットワークが使う）
  { base: 0x00000000, mask: 0xff000000 }, // 0.0.0.0/8
] as const;

/** IPv4 のオクテットの数 */
const IPV4_OCTETS = 4;
const MAX_OCTET = 255;
/** 1 オクテットが取る値の数（上の桁へ送る掛け算） */
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

/** IPv6 の私的な範囲（::1・fc00::/7・fe80::/10・IPv4 を埋め込んだ形） */
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

/** 公開の DNS に無い名前の末尾（RFC 6761・6762・8375 の予約） */
const PRIVATE_SUFFIXES = ['.localhost', '.local', '.test', '.home.arpa'] as const;

/**
 * 自分の端末や私的なネットワークのホストか。名前は localhost と予約された末尾、
 * 点を含まない名前（LAN の機器名。公開のホストにはならない）を私的とみなす
 */
export function isPrivateHost(host: string): boolean {
  const name = host.trim().toLowerCase();
  if (name.length === 0) return false;
  if (name === 'localhost' || PRIVATE_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true;
  if (privateV4(name) || privateV6(name)) return true;
  return !name.includes('.') && !name.includes(':') && ipv4(name) === null;
}

/**
 * 接続先の URL を読む。スキームの無い URL は、送る側（ComfyUI・LLM の窓口）と同じく `http://` を
 * 足して読む（足さないと読めない URL として素通りする）。読めなければ null
 */
function parseBaseUrl(baseUrl: string): URL | null {
  const trimmed = baseUrl.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

/**
 * つなぐ前に注意が要る宛先か（私的なアドレスの外）。読めない URL は、つないでも失敗するので
 * 注意の対象にしない
 */
export function isRemoteHost(baseUrl: string): boolean {
  const url = parseBaseUrl(baseUrl);
  return url !== null && !isPrivateHost(url.hostname);
}

/**
 * 同じ相手を指すかを見る鍵（ホスト名とポート）。書き方の違い（`http`/`https`・末尾の `/`・
 * `/comfy` などのパス・大文字小文字・既定のポートの有無）は同じ鍵になる。読めなければ前後の空白を
 * 落とした文字そのもの
 */
export function hostKeyOf(baseUrl: string): string {
  const host = parseBaseUrl(baseUrl)?.host ?? '';
  return host.length > 0 ? host : baseUrl.trim();
}
