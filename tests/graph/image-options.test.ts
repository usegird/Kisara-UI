import { describe, expect, it } from 'vitest';

import {
  buildImageItems,
  filterImageItems,
  isImageUpload,
  sortImageItems,
} from '@/graph/image-options';

// ─────────────────────────────
// 画像を読み込む選択肢の加工。
// ─────────────────────────────

describe('画像を読み込む選択肢か', () => {
  it('image_upload が有効なときだけ', () => {
    expect(isImageUpload({ image_upload: true })).toBe(true);
    expect(isImageUpload({ image_upload: false })).toBe(false);
    expect(isImageUpload({ video_upload: true })).toBe(false);
  });
});

describe('カードの並び', () => {
  it('文字列でない・空の選択肢は落とし、サブフォルダを除いた名前を出す', () => {
    const items = buildImageItems(['a.png', '', 3, 'sub\\b.jpg']);

    expect(items.map((item) => item.value)).toEqual(['a.png', 'sub\\b.jpg']);
    expect(items[1]?.path).toBe('sub/b.jpg');
    expect(items[1]?.label).toBe('b.jpg');
  });

  it('名前の順に並べ、向きを変えられる', () => {
    const items = buildImageItems(['b.png', 'a.png', 'c.png']);

    expect(sortImageItems(items, true).map((item) => item.value)).toEqual([
      'a.png',
      'b.png',
      'c.png',
    ]);
    expect(sortImageItems(items, false)[0]?.value).toBe('c.png');
  });

  it('サブフォルダを含む名前の部分一致で絞り、前方一致を先に出す', () => {
    const items = buildImageItems(['x-cat.png', 'cat.png', 'pets/dog.png']);

    expect(filterImageItems(items, 'cat').map((item) => item.value)).toEqual([
      'cat.png',
      'x-cat.png',
    ]);
    expect(filterImageItems(items, 'pets').map((item) => item.value)).toEqual(['pets/dog.png']);
    expect(filterImageItems(items, '')).toHaveLength(3);
  });
});
