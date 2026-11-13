import { describe, expect, it } from 'vitest';

import { chatImageSizeAfterMove } from '@/store/settings-fields/chat-image';

// ─────────────────────────────
// アバターの置き場を移したあとの枠の縦横。
// ─────────────────────────────

const tall = { width: 320, height: 480 };
const wide = { width: 480, height: 320 };

describe('置き場を移したあとの枠の縦横', () => {
  it('左右と上下の間では縦横を入れ替える', () => {
    expect(chatImageSizeAfterMove('right', 'top', tall)).toEqual(wide);
    expect(chatImageSizeAfterMove('aboveInput', 'left', tall)).toEqual(wide);
  });

  it('背景から左右へは長い方を縦、上下へは長い方を横にする', () => {
    expect(chatImageSizeAfterMove('background', 'left', wide)).toEqual(tall);
    expect(chatImageSizeAfterMove('background', 'right', tall)).toEqual(tall);
    expect(chatImageSizeAfterMove('background', 'top', tall)).toEqual(wide);
    expect(chatImageSizeAfterMove('background', 'aboveInput', wide)).toEqual(wide);
  });

  it('背景へ移すとき・同じ向きの間ではそのまま', () => {
    expect(chatImageSizeAfterMove('left', 'background', tall)).toEqual(tall);
    expect(chatImageSizeAfterMove('left', 'right', wide)).toEqual(wide);
    expect(chatImageSizeAfterMove('top', 'aboveInput', tall)).toEqual(tall);
  });
});
