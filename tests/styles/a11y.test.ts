import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TOAST_TIMEOUT } from '@/components/ui/toast-manager';

// ─────────────────────────────
// WCAG 2.1 AA の明度差・動き・知らせの時間。
// 色は `globals.css` のトークンの値から明度差を求める（ブラウザと同じく sRGB で重ねる）。
// ─────────────────────────────

const CSS = readFileSync('src/styles/globals.css', 'utf8');

type Rgb = readonly [number, number, number];

/** `selector {` から閉じ括弧までの中身 */
function block(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  return CSS.slice(start, CSS.indexOf('\n}', start));
}

/** トークンの oklch（L C H と透明度） */
function token(scope: string, name: string): { readonly lch: Rgb; readonly alpha: number } {
  const match = new RegExp(
    `--${name}: oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)(?: / (\\d+)%)?\\)`,
  ).exec(block(scope));
  if (match === null) throw new Error(`no token ${scope} ${name}`);
  const [, l, c, h, a] = match;
  return { lch: [Number(l), Number(c), Number(h)], alpha: a === undefined ? 1 : Number(a) / 100 };
}

function srgb([l, c, h]: Rgb): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const;
  const linear = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ];
  const [r = 0, g = 0, bl = 0] = linear.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  });
  return [r, g, bl];
}

function blend(top: Rgb, alpha: number, under: Rgb): Rgb {
  return [0, 1, 2].map(
    (i) => (top[i] ?? 0) * alpha + (under[i] ?? 0) * (1 - alpha),
  ) as unknown as Rgb;
}

function luminance(rgb: Rgb): number {
  const [r = 0, g = 0, b = 0] = rgb.map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(x: Rgb, y: Rgb): number {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** 地のトークンをページの地に重ねた色 */
function ground(scope: string, name: string): Rgb {
  const page = srgb(token(scope, 'background').lch);
  const { lch, alpha } = token(scope, name);
  return blend(srgb(lch), alpha, page);
}

const WHITE: Rgb = [1, 1, 1];

describe('明度差（WCAG 1.4.3・1.4.11）', () => {
  for (const scope of [':root', '.dark']) {
    it(`${scope}: 補助の文字はどの地でも 4.5:1 以上`, () => {
      const text = srgb(token(scope, 'muted-foreground').lch);
      for (const name of ['background', 'card', 'muted', 'band', 'pane']) {
        expect(ratio(text, ground(scope, name)), name).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${scope}: 焦点の輪はどの地でも 3:1 以上`, () => {
      const ring = srgb(token(scope, 'ring').lch);
      for (const name of ['background', 'card', 'muted', 'band']) {
        expect(ratio(ring, ground(scope, name)), name).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('ライト: 入れ切りのスイッチの入は、列の欄の地と 3:1 以上', () => {
    const on = srgb(token(':root', 'switch-on').lch);
    expect(ratio(on, ground(':root', 'pane'))).toBeGreaterThanOrEqual(3);
  });

  it('トーストの白い文字は、白地に重ねても 4.5:1 以上', () => {
    for (const name of ['color-toast-success', 'color-toast-error']) {
      const toast = blend(srgb(token('@theme static', name).lch), 0.9, WHITE);
      expect(ratio(WHITE, toast), name).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/** `src/` の下の .ts・.tsx */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

/** 正規表現に当たる行（`path:行`） */
function offenders(pattern: RegExp, allow: (line: string) => boolean = () => false): string[] {
  return sources('src').flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        pattern.test(line) && !allow(line) ? [`${path}:${index + 1}`] : [],
      ),
  );
}

describe('クラスの決まり', () => {
  it('読ませる文字を透明度で薄くしない（飾りのアイコンとサムネイルの空枠を除く）', () => {
    expect(
      offenders(/text-muted-foreground\/\d/u, (line) => /aria-hidden|THUMBNAIL_FRAME/u.test(line)),
    ).toEqual([]);
  });

  it('焦点の輪を透かさない', () => {
    expect(offenders(/(?:ring|outline)-ring\/\d/u)).toEqual([]);
    expect(CSS).not.toMatch(/outline-ring\/\d/u);
  });

  it('回り続ける・点滅し続ける動きは、動きを減らす設定で止める', () => {
    expect(offenders(/(?<![:\w-])animate-(?:spin|pulse)\b/u)).toEqual([]);
  });
});

describe('知らせの時間（WCAG 2.2.1）', () => {
  it('失敗のトーストは自動では消さない', () => {
    expect(TOAST_TIMEOUT.error).toBe(0);
  });
});
