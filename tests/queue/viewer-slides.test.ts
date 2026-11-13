import { describe, expect, it } from 'vitest';

import { imagesOf, pickImage } from '@/queue/outputs';
import {
  anchoredStart,
  buildSlides,
  firstSlideOf,
  followShift,
  moveAnchored,
  pageNumbers,
  pageStart,
  promptIdOfKey,
  pushInOffsets,
  pushOutOffsets,
  resolveSlide,
  shouldFollow,
  slideIndex,
} from '@/queue/viewer-slides';

import { outputFile, queueTask } from '../helpers/queue';

// ─────────────────────────────
// ビューワーの送り。**画像はすべて対等**で、1 件のタスクが何枚出していても全部並ぶ。
// 行×列で決まる枚数ごとにページ送りし、端では止まる。
// 新しい画像を追いかけるのは**先頭のページを見ているときだけ**。
// ─────────────────────────────

describe('タスクの画像', () => {
  it('画像でないものは飛ばし、後に出たものを先に並べる', () => {
    const found = imagesOf([
      outputFile('a.txt'),
      outputFile('1.png'),
      outputFile('b.json'),
      outputFile('2.png'),
    ]);
    expect(found.map((entry) => entry.filename)).toEqual(['2.png', '1.png']);
  });

  it('代表の 1 枚は種別で優先しない（最後に出たもの）', () => {
    const found = pickImage([outputFile('saved.png', 'output'), outputFile('preview.png', 'temp')]);
    expect(found?.filename).toBe('preview.png');
  });

  it('画像が無ければ null', () => {
    expect(pickImage([outputFile('a.txt')])).toBeNull();
  });
});

describe('並びの組み立て', () => {
  it('1 件のタスクの画像をすべて並べる', () => {
    const slides = buildSlides([
      queueTask('a', [outputFile('a1.png'), outputFile('a2.png')], { number: 3 }),
      queueTask('b', []),
      queueTask('c', [outputFile('c1.png')], { number: 1 }),
    ]);

    expect(slides.map((slide) => slide.file.filename)).toEqual(['a2.png', 'a1.png', 'c1.png']);
    expect(slides[0]?.number).toBe(3);
  });

  it('鍵はタスクとファイルの組で分かれる', () => {
    const slides = buildSlides([
      queueTask('a', [outputFile('x.png')]),
      queueTask('b', [outputFile('x.png')]),
    ]);
    expect(new Set(slides.map((slide) => slide.key)).size).toBe(2);
  });

  it('そのタスクの最初の 1 枚を引ける', () => {
    const slides = buildSlides([queueTask('a', [outputFile('1.png'), outputFile('2.png')])]);
    expect(firstSlideOf(slides, 'a')).toBe(slides[0]?.key);
    expect(firstSlideOf(slides, '知らない')).toBeNull();
  });
});

describe('種別の絞り込み', () => {
  const tasks = [
    queueTask('p1', [outputFile('saved.png', 'output'), outputFile('preview.png', 'temp')]),
  ];
  const names = (filter: 'all' | 'temp' | 'output'): string[] =>
    buildSlides(tasks, filter).map((slide) => slide.file.filename);

  it('all はすべて、temp と output はその種別だけ並べる', () => {
    expect(names('all')).toEqual(['preview.png', 'saved.png']);
    expect(names('temp')).toEqual(['preview.png']);
    expect(names('output')).toEqual(['saved.png']);
  });
});

describe('追従を切っているときのページ（錨から数える）', () => {
  const before = buildSlides([
    queueTask('b', [outputFile('b1.png'), outputFile('b2.png')]),
    queueTask('c', [outputFile('c1.png'), outputFile('c2.png')]),
  ]);
  // 先頭に 1 枚増えた並び
  const after = buildSlides([
    queueTask('a', [outputFile('a1.png')]),
    queueTask('b', [outputFile('b1.png'), outputFile('b2.png')]),
    queueTask('c', [outputFile('c1.png'), outputFile('c2.png')]),
  ]);
  const names = (slides: typeof after, start: number): string[] =>
    slides.slice(start, start + 2).map((slide) => slide.file.filename);

  it('画像が増えても、出していた並びのまま（並べ直さない）', () => {
    const anchor = before[2]?.key ?? null;
    expect(names(before, anchoredStart(before, anchor, anchor, 2))).toEqual(['c2.png', 'c1.png']);
    expect(names(after, anchoredStart(after, anchor, anchor, 2))).toEqual(['c2.png', 'c1.png']);
  });

  it('送ると錨からちょうど 1 ページ動き、新しい方の端に足りなければ先頭まで', () => {
    const start = anchoredStart(after, before[2]?.key ?? null, null, 2);
    expect(start).toBe(3);
    expect(moveAnchored(after, start, 2, -1)).toBe(after[1]?.key);
    expect(moveAnchored(after, 1, 2, -1)).toBe(after[0]?.key);
    expect(moveAnchored(after, 0, 2, -1)).toBeNull();
    expect(moveAnchored(after, start, 2, 1)).toBeNull();
  });

  it('見ている画像が錨のページの外なら、先頭から数えた区切りに戻す', () => {
    expect(anchoredStart(after, after[3]?.key ?? null, after[0]?.key ?? null, 2)).toBe(0);
    expect(anchoredStart(after, null, after[3]?.key ?? null, 2)).toBe(2);
  });
});

describe('ページ送り', () => {
  const slides = buildSlides([
    queueTask('a', [outputFile('a1.png'), outputFile('a2.png')]),
    queueTask('b', [outputFile('b1.png'), outputFile('b2.png')]),
    queueTask('c', [outputFile('c1.png')]),
  ]);
  const keyAt = (index: number): string => slides[index]?.key ?? '';

  it('位置を引ける', () => {
    expect(slideIndex(slides, keyAt(2))).toBe(2);
    expect(slideIndex(slides, null)).toBe(-1);
  });

  /** 錨の無いとき（見ている画像のページから）に送った先 */
  const movePage = (
    list: typeof slides,
    key: string | null,
    perPage: number,
    direction: number,
  ): string | null =>
    moveAnchored(list, anchoredStart(list, null, key, perPage), perPage, direction);

  it('1 枚ずつなら 1 つ動く', () => {
    expect(movePage(slides, keyAt(1), 1, 1)).toBe(keyAt(2));
    expect(movePage(slides, keyAt(1), 1, -1)).toBe(keyAt(0));
  });

  it('2 枚ずつならページの境目で動く', () => {
    expect(movePage(slides, keyAt(1), 2, 1)).toBe(keyAt(2));
    expect(movePage(slides, keyAt(3), 2, -1)).toBe(keyAt(0));
  });

  it('端では送らない', () => {
    expect(movePage(slides, keyAt(0), 2, -1)).toBeNull();
    expect(movePage(slides, keyAt(4), 2, 1)).toBeNull();
  });

  it('ページの先頭は並びの頭から数える', () => {
    expect(pageStart(slides, keyAt(3), 2)).toBe(2);
    expect(pageStart(slides, keyAt(4), 2)).toBe(4);
  });

  it('並びが空なら送れない', () => {
    expect(movePage([], null, 1, 1)).toBeNull();
  });
});

describe('通し番号', () => {
  it('いちばん古いものが 1、いちばん新しいものが総数', () => {
    expect(pageNumbers(5, 0, 1)).toEqual({ from: 5, to: 5 });
    expect(pageNumbers(5, 4, 1)).toEqual({ from: 1, to: 1 });
  });

  it('複数枚のときは範囲になる（小さい方が古い）', () => {
    expect(pageNumbers(5, 0, 2)).toEqual({ from: 4, to: 5 });
    expect(pageNumbers(5, 2, 2)).toEqual({ from: 2, to: 3 });
  });

  it('端のページは足りない分だけ縮む', () => {
    expect(pageNumbers(5, 4, 2)).toEqual({ from: 1, to: 1 });
  });
});

describe('見ている位置の付け直し', () => {
  const slides = buildSlides([
    queueTask('a', [outputFile('a1.png', 'output')]),
    queueTask('b', [outputFile('b1.png', 'output')]),
  ]);

  it('鍵からタスクの id を引ける', () => {
    expect(promptIdOfKey(slides[0]?.key ?? null)).toBe('a');
    expect(promptIdOfKey(null)).toBeNull();
    expect(promptIdOfKey('区切りなし')).toBeNull();
  });

  it('並びにあるものはそのまま', () => {
    expect(resolveSlide(slides, slides[1]?.key ?? null)).toBe(slides[1]?.key);
  });

  it('**画像が差し替わっても、同じタスクに留まる**（新しい方へ飛ばない）', () => {
    // 実行中の一時画像は、終わると別のファイルになる
    const gone = 'b:temp:/preview.png';
    expect(resolveSlide(slides, gone)).toBe(slides[1]?.key);
  });

  it('タスクごと消えたら手がかりが無い', () => {
    expect(resolveSlide(slides, 'z:temp:/x.png')).toBeNull();
  });

  it('まだ何も見ていなければ先頭', () => {
    expect(resolveSlide(slides, null)).toBe(slides[0]?.key);
  });
});

describe('新しい画像の追いかけ', () => {
  const slides = buildSlides([
    queueTask('new', [outputFile('1.png')]),
    queueTask('old', [outputFile('2.png')]),
  ]);

  it('先頭が新しい画像に替わったら送る（遡って見ていても）', () => {
    expect(shouldFollow(slides, slides.slice(1))).toBe(true);
    expect(shouldFollow(slides, [])).toBe(true);
  });

  it('先頭が変わっていなければ送らない', () => {
    expect(shouldFollow(slides, slides)).toBe(false);
  });

  it('先頭の画像が抜けて、前から居た画像が先頭に来ただけなら送らない', () => {
    expect(shouldFollow(slides.slice(1), slides)).toBe(false);
  });
});

describe('追従の押しのけ', () => {
  it('前の先頭が何枚下がったかを数える。見失ったら 1 ページ分', () => {
    const slides = buildSlides([
      queueTask('b', [outputFile('b.png')]),
      queueTask('a', [outputFile('a.png')]),
    ]);
    const previous = slides.slice(1);

    expect(followShift(previous, slides, 4)).toBe(1);
    expect(followShift([], slides, 4)).toBe(4);
  });

  it('先頭以外のページでも、同じ位置から数えて増えた枚数だけ送る', () => {
    const slides = buildSlides([
      queueTask('n2', [outputFile('n2.png')]),
      queueTask('n1', [outputFile('n1.png')]),
      queueTask('a', [outputFile('a.png')]),
      queueTask('b', [outputFile('b.png')]),
      queueTask('c', [outputFile('c.png')]),
    ]);
    // 増える前は 1 番目（b, c）を出していた。2 枚増えたので同じ位置 1 から数えると 2 枚送られる
    const previous = slides.slice(3, 5);
    expect(followShift(previous, slides, 2, 1)).toBe(2);
  });

  it('2×2 で 1 枚増えると、行の右端の画像は次の行の左端へ繰り下がる', () => {
    const offsets = pushInOffsets(1, 4, 2);

    expect(offsets[0]).toEqual({ x: -1, y: 0 });
    expect(offsets[1]).toEqual({ x: -1, y: 0 });
    // 枠 2（2 行目の左）は枠 1（1 行目の右）から来る
    expect(offsets[2]).toEqual({ x: 1, y: -1 });
  });

  it('あふれた画像だけを右の外へ出す', () => {
    expect(pushOutOffsets(1, 4)).toEqual([null, null, null, { x: 1, y: 0 }]);
  });
});
