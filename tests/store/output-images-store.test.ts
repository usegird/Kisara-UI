import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutputFileRef, OutputImageBody } from '@/port/files';
import { forgetGoneTemps } from '@/store/kit/gone-temps';
import { trimHeld } from '@/store/kit/memory-budget';
import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import {
  outputSrc,
  outputViewUrl,
  useOutputImagesStore,
  type OutputImageEntry,
} from '@/store/use-output-images-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTaskLogStore } from '@/store/use-task-log-store';

// ─────────────────────────────
// 一度読んだ結果画像はメモリに持ち、以後はそれを出す。
// `temp` が ComfyUI の再起動で消えても、読み込み直すまでは見える。
// ─────────────────────────────

const fetchOutputImage = vi.hoisted(() => vi.fn<() => Promise<OutputImageBody>>());
vi.mock('@/comfy/queue', () => ({ fetchOutputImage }));

const file = (filename: string): OutputFileRef => ({ filename, subfolder: '', type: 'temp' });
/** 読めた画像の中身。更新時刻は省くと分からない扱い */
const body = (modifiedAt: number | null = null): OutputImageBody => ({
  blob: new Blob(['x']),
  modifiedAt,
});
/** つながっている接続先の `/view` の URL（作れないことは無い） */
const viewOf = (filename: string): string => outputViewUrl('http://comfy', file(filename)) ?? '';

let made = 0;
const revoke = vi.fn();
beforeEach(() => {
  made = 0;
  URL.createObjectURL = vi.fn(() => `blob:${String(++made)}`);
  revoke.mockReset();
  URL.revokeObjectURL = revoke;
  useOutputImagesStore.setState({ images: new Map() });
  // つないでいる間だけ取りに行く
  useConnectionStore.setState({ status: 'connected' });
  fetchOutputImage.mockReset();
  forgetGoneTemps();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('手元へ写す', () => {
  it('読んだ画像はその中身を出し、同じ画像は取り直さない', async () => {
    fetchOutputImage.mockResolvedValue(body());
    const { ensure: hold } = useOutputImagesStore.getState();

    await Promise.all([hold('http://comfy', file('a.png')), hold('http://comfy', file('a.png'))]);
    await hold('http://comfy', file('a.png'));

    const url = viewOf('a.png');
    expect(outputSrc(useOutputImagesStore.getState().images, url)).toBe('blob:1');
    expect(fetchOutputImage).toHaveBeenCalledTimes(1);
  });

  it('取っている最中は出さず、取れなければ /view を直接指す', async () => {
    let fail: (reason: unknown) => void = () => {};
    fetchOutputImage.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    const url = viewOf('gone.png');

    const task = useOutputImagesStore.getState().ensure('http://comfy', file('gone.png'));
    expect(outputSrc(useOutputImagesStore.getState().images, url)).toBeNull();

    // 応答が無い・読めない（CORS を許していない接続先）ときは `img` が直接読むのに任せる
    fail(new TypeError('Failed to fetch'));
    await task;
    expect(outputSrc(useOutputImagesStore.getState().images, url)).toBe(url);
  });

  it('接続先が無いと答えた画像（404 など）は、`img` にも渡さない', async () => {
    fetchOutputImage.mockRejectedValue(Object.assign(new Error('404'), { status: 404 }));
    await useOutputImagesStore.getState().ensure('http://comfy', file('gone.png'));
    expect(outputSrc(useOutputImagesStore.getState().images, viewOf('gone.png'))).toBe(false);
  });

  it('つないでいない間はブラウザのキャッシュを使い、無ければ 1 回だけ試して、つないだら取り直す', async () => {
    useConnectionStore.setState({ status: 'disconnected' });
    fetchOutputImage.mockRejectedValue(new TypeError('Failed to fetch'));
    const { ensure: hold } = useOutputImagesStore.getState();
    const url = viewOf('a.png');

    await hold('http://comfy', file('a.png'));
    expect(fetchOutputImage.mock.calls[0] as unknown[]).toContainEqual({ cache: 'force-cache' });
    // 描き直して頼み直しても取りに行かない。`img` にも渡さない
    await hold('http://comfy', file('a.png'));
    expect(fetchOutputImage).toHaveBeenCalledTimes(1);
    expect(outputSrc(useOutputImagesStore.getState().images, url)).toBeNull();

    // つないだら印を外し、頼み直すと取る
    fetchOutputImage.mockResolvedValue(body());
    useConnectionStore.setState({ status: 'connected' });
    expect(useOutputImagesStore.getState().images.has(url)).toBe(false);
    await hold('http://comfy', file('a.png'));
    expect(fetchOutputImage).toHaveBeenCalledTimes(2);
    expect(outputSrc(useOutputImagesStore.getState().images, url)).toBe('blob:1');
  });
});

describe('再起動で消えた temp', () => {
  /** 実行の終わりが `until` の temp を 1 枚頼む */
  const hold = (name: string, until: number): Promise<void> =>
    useOutputImagesStore.getState().ensure('http://comfy', file(name), { until });
  const notFound = (): Promise<OutputImageBody> =>
    Promise.reject(Object.assign(new Error('404'), { status: 404 }));
  const requestedNames = (): string[] =>
    fetchOutputImage.mock.calls.map((call) => ((call as unknown[])[1] as OutputFileRef).filename);

  it('同じ描画の分は境目を半分ずつ読んで探し、境目より前は取りに行かない', async () => {
    // 終わりが 1〜4 は消え、5〜8 は残っている
    fetchOutputImage.mockImplementation((...args: unknown[]) => {
      const name = (args[1] as OutputFileRef).filename;
      return Number(name.slice(1, 2)) <= 4 ? notFound() : Promise.resolve(body());
    });
    const names = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'];
    await Promise.all(names.map((name, index) => hold(`${name}.png`, index + 1)));

    const { images } = useOutputImagesStore.getState();
    expect(names.map((name) => outputSrc(images, viewOf(`${name}.png`), 0) !== false)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
    // 消えた 4 枚のうち読んだのは境目を探した分（t3・t4）だけで、それより前は取りに行かない
    expect(requestedNames().filter((name) => Number(name.slice(1, 2)) <= 4).sort()).toEqual([
      't3.png',
      't4.png',
    ]);
  });

  it('一度無いと分かったら、それより前に終わった実行の temp は後から頼まれても取りに行かない', async () => {
    fetchOutputImage.mockImplementation(notFound);
    await hold('new.png', 100);
    fetchOutputImage.mockClear();

    await hold('old.png', 50);
    await useOutputImagesStore.getState().ensure('http://comfy', file('kept.png'));
    expect(requestedNames()).toEqual(['kept.png']);
    expect(outputSrc(useOutputImagesStore.getState().images, viewOf('old.png'))).toBe(false);
  });

  it('応答が無ければ境目を決めず、残りを全部読む', async () => {
    fetchOutputImage.mockRejectedValue(new TypeError('Failed to fetch'));
    await Promise.all([hold('a.png', 1), hold('b.png', 2), hold('c.png', 3)]);
    expect(fetchOutputImage).toHaveBeenCalledTimes(3);
  });
});

describe('同じ名前で書き直された temp', () => {
  it('実行の完了より後に書かれたファイルは、その実行の画像として出さない', async () => {
    fetchOutputImage.mockResolvedValue(body(10_000));
    await useOutputImagesStore.getState().ensure('http://comfy', file('a.png'));
    const { images } = useOutputImagesStore.getState();

    expect(outputSrc(images, viewOf('a.png'), 1_000)).toBe(false);
    // 完了の少し後（書き終わりの遅れ）までは同じ実行のものとして出す
    expect(outputSrc(images, viewOf('a.png'), 9_000)).toBe('blob:1');
    expect(outputSrc(images, viewOf('a.png'))).toBe('blob:1');
  });

  it('この画面の実行が同じ名前を書いたら、写しと「無い」の印を捨てて取り直させる', async () => {
    fetchOutputImage.mockRejectedValueOnce(Object.assign(new Error('404'), { status: 404 }));
    fetchOutputImage.mockResolvedValue(body());
    const { ensure: hold } = useOutputImagesStore.getState();
    await Promise.all([
      hold('http://comfy', file('gone.png')),
      hold('http://comfy', file('b.png')),
    ]);

    const before = useExecutionStore.getState();
    useSettingsStore.setState({ baseUrl: 'http://comfy' });
    useExecutionStore.setState({
      outputsById: { p9: { '7': [file('gone.png'), file('b.png')] } },
    });

    const { images } = useOutputImagesStore.getState();
    expect(images.has(viewOf('gone.png'))).toBe(false);
    expect(images.has(viewOf('b.png'))).toBe(false);
    expect(revoke).toHaveBeenCalledWith('blob:1');
    useExecutionStore.setState(before);
  });
});

describe('読む順', () => {
  it('同じ描画でまとめて頼まれた分は、古いものから読む', async () => {
    fetchOutputImage.mockResolvedValue(body());
    const { ensure: hold } = useOutputImagesStore.getState();

    // 一覧は新しい順に並ぶので、新しいものから頼まれる
    await Promise.all([
      hold('http://comfy', file('new.png'), { order: 3 }),
      hold('http://comfy', file('mid.png'), { order: 2 }),
      hold('http://comfy', file('old.png'), { order: 1 }),
    ]);

    const names = fetchOutputImage.mock.calls.map(
      (call) => (call as unknown[])[1] as OutputFileRef,
    );
    expect(names.map((ref) => ref.filename)).toEqual(['old.png', 'mid.png', 'new.png']);
  });
});

describe('上限', () => {
  it('超えたら古く読んだものから手放し、その中身は無効にして /view を直接指す', () => {
    const images = new Map<string, OutputImageEntry>([
      // 読んだ順ではなく古さ（order）で手放す
      ['c', { src: 'blob:c', bytes: 60, order: 2, modifiedAt: null }],
      ['b', 'pending'],
      ['a', { src: 'blob:a', bytes: 60, order: 1, modifiedAt: null }],
    ]);
    useOutputImagesStore.setState({ images });

    trimHeld(100);

    const next = useOutputImagesStore.getState().images;
    expect(next.get('a')).toBe('released');
    expect(outputSrc(next, 'a')).toBe('a');
    expect(next.get('c')).toMatchObject({ src: 'blob:c', order: 2 });
    expect(revoke).toHaveBeenCalledWith('blob:a');
  });

  it('実行の記録の丸ごとと合わせて数え、種類を問わず古いものから手放す（一覧の軽い部分は残す）', () => {
    useOutputImagesStore.setState({
      images: new Map<string, OutputImageEntry>([
        ['img', { src: 'blob:i', bytes: 60, order: 2, modifiedAt: null }],
      ]),
    });
    const raw = { prompt: 'x'.repeat(50) };
    useTaskLogStore.setState({
      entries: [
        {
          promptId: 'p1',
          number: 1,
          startedAt: 1,
          finishedAt: 1,
          success: true,
          outputs: [],
          name: 'old',
          raw,
        },
      ],
    });

    trimHeld(100);

    const entry = useTaskLogStore.getState().entries[0];
    expect(entry?.raw).toBeUndefined();
    expect(entry?.name).toBe('old');
    expect(useOutputImagesStore.getState().images.get('img')).toMatchObject({ src: 'blob:i' });
    useTaskLogStore.getState().clear();
  });
});

describe('接続先が無いとき', () => {
  it('URL を作らずに null を返し、取りにも行かない（会話は接続前でも開く）', async () => {
    expect(outputViewUrl('', file('a.png'))).toBeNull();
    await useOutputImagesStore.getState().ensure('', file('a.png'));
    expect(fetchOutputImage).not.toHaveBeenCalled();
    expect(useOutputImagesStore.getState().images.size).toBe(0);
  });
});
