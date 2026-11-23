const CHANNEL_STARTS = { red: 1, green: 3, blue: 5 } as const;
const HEX_RADIX = 16;
const MAX_CHANNEL = 255;
const MAX_COLOR_LENGTH = 64;

export function toHexColor(value: string): string | null {
  const full = /^#[0-9a-f]{3}$/i.test(value)
    ? `#${[...value.slice(1)].map((digit) => digit + digit).join('')}`
    : value;
  return /^#[0-9a-f]{6}$/i.test(full) ? full.toLowerCase() : null;
}

export function scaleHexColor(value: string, factor: number): string | null {
  const hex = toHexColor(value);
  if (hex === null) return null;

  const channels = Object.values(CHANNEL_STARTS).map((at) => {
    const scaled = Math.round(Number.parseInt(hex.slice(at, at + 2), HEX_RADIX) * factor);
    return Math.min(MAX_CHANNEL, Math.max(0, scaled)).toString(HEX_RADIX).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

export function paintableColor(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value.length > MAX_COLOR_LENGTH) return null;
  return /^[#a-z0-9(),.%\s-]+$/i.test(value) ? value : null;
}
