import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { MOTION_MS } from '@/lib/motion';

// ─────────────────────────────
// 滑り込み・抜け出しの長さは MOTION_MS が正。CSS は値を読めないので、書き写した値が揃っていることを確かめる
// ─────────────────────────────

const CSS = readFileSync('src/styles/globals.css', 'utf8');

describe('滑り込み・抜け出しの長さ', () => {
  it('--kisara-motion は MOTION_MS と同じ', () => {
    expect(/--kisara-motion: (\d+)ms;/u.exec(CSS)?.[1]).toBe(String(MOTION_MS));
  });

  it('カードとチップの動きは --kisara-motion の長さで動く', () => {
    const rules = [...CSS.matchAll(/animation: kisara-card-(?:enter|leave) ([^ ]+) /gu)];
    expect(rules.map((rule) => rule[1])).toEqual(['var(--kisara-motion)', 'var(--kisara-motion)']);
  });
});
