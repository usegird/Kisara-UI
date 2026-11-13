import { describe, expect, it } from 'vitest';

import { isImageFile, pickImage } from '@/queue/outputs';

// ─────────────────────────────
// 結果ファイルの扱い。`temp` は ComfyUI の再起動で消えるので、代表は `output` を優先する。
// ─────────────────────────────

describe('画像の選び方', () => {
  it('画像かどうかを拡張子で見る', () => {
    expect(isImageFile({ filename: 'a.png', subfolder: '', type: 'output' })).toBe(true);
    expect(isImageFile({ filename: 'a.mp4', subfolder: '', type: 'output' })).toBe(false);
  });

  it('temp より output を優先する', () => {
    const temp = { filename: 'p.png', subfolder: '', type: 'temp' };
    const output = { filename: 's.png', subfolder: '', type: 'output' };

    expect(pickImage([temp, output])).toBe(output);
  });
});
