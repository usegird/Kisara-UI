import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { anchorColor, slotColor } from '@/styles/slot-color';

function globals(): string {
  return readFileSync(
    fileURLToPath(new URL('../../src/styles/globals.css', import.meta.url)),
    'utf8',
  );
}

describe('スロット型の配色', () => {
  it('参照している型のトークンが CSS に定義されている', () => {
    const css = globals();
    const types = [
      'IMAGE',
      'LATENT',
      'MODEL',
      'CLIP',
      'CLIP_VISION',
      'CLIP_VISION_OUTPUT',
      'VAE',
      'CONDITIONING',
      'CONTROL_NET',
      'MASK',
      'STYLE_MODEL',
      'NOISE',
      'GUIDER',
      'SAMPLER',
      'SIGMAS',
      'TAESD',
      'VIDEO',
      'UNKNOWN_TYPE',
    ];

    for (const type of types) {
      const variable = slotColor(type).replace('var(', '').replace(')', '');
      expect(css, `${type} のトークンが無い`).toContain(`${variable}:`);
    }
  });

  it('未使用でも出力されるよう @theme static を使う', () => {
    expect(globals()).toContain('@theme static {');
  });
});

describe('本家と同じ値', () => {
  it('既定パレットの色をそのまま持つ', () => {
    const css = globals();

    expect(css).toContain('--color-slot-image: #64b5f6;');
    expect(css).toContain('--color-slot-model: #b39ddb;');
    expect(css).toContain('--color-slot-clip: #ffd500;');
  });

  it('色を持たない型は既定色に落ちる', () => {
    expect(slotColor('VIDEO')).toBe('var(--color-slot-default)');
    expect(slotColor('WANVIDEO_MODEL')).toBe('var(--color-slot-default)');
  });
});

describe('出力アンカーの色', () => {
  it('型が 1 つならその色', () => {
    expect(anchorColor(['LATENT'])).toBe('var(--color-slot-latent)');
    expect(anchorColor(['IMAGE', 'IMAGE'])).toBe('var(--color-slot-image)');
  });

  it('型が混ざるなら既定色（1 つの型だけが出ているように見せない）', () => {
    expect(anchorColor(['MODEL', 'CLIP', 'VAE'])).toBe('var(--color-slot-default)');
  });

  it('出力が無いカードも既定色', () => {
    expect(anchorColor([])).toBe('var(--color-slot-default)');
  });
});
