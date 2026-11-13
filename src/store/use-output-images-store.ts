import { create } from 'zustand';

import { isRecord } from '@/lib/guards';
import type { OutputFileRef } from '@/port/files';
import { isKnownGone, noteGone, probeBoundary, type TempProbe } from '@/store/kit/gone-temps';
import { registerHolder, trimHeld } from '@/store/kit/memory-budget';
import { comfyPort } from '@/store/ports/comfy-port';
import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 一度読んだ結果画像の中身（この画面が開いている間だけ。保存領域には書かない）。`/view` を指すだけだと
// 描き直すたびにブラウザが取り直し、`temp` は ComfyUI の再起動で消えて見えなくなるので、メモリに写す。
// 持つ量は実行の記録と合わせて上限を設け、超えたら古いものから手放す（`memory-budget`）。
// ─────────────────────────────

/**
 * 更新時刻を比べるときのゆとり（ミリ秒）。`Last-Modified` は秒で切り捨てるので遅れる側には要らないが、
 * 実行の完了の印より書き終わりが少し後になることがある
 */
const MODIFIED_SLACK_MS = 2000;

/** 手元に写した画像の 1 枚 */
interface HeldImage {
  readonly src: string;
  readonly bytes: number;
  /** 古さ（epoch ミリ秒）。小さいものから手放す */
  readonly order: number;
  /** 接続先のファイルの更新時刻（epoch ミリ秒。接続先の時計）。分からなければ null */
  readonly modifiedAt: number | null;
}

/** 写すときの添え物 */
export interface EnsureOptions {
  /** 画像の古さ（epoch ミリ秒）。省くと頼んだ時刻（最も新しい扱い） */
  readonly order?: number | undefined;
  /**
   * その画像を出した実行が終わった時刻（epoch ミリ秒。接続先の時計の値だけ）。
   * 分かれば、再起動で消えたと分かっている `temp` を取りに行かない
   */
  readonly until?: number | undefined;
}

/**
 * 取っている最中か、取れなかったか（つないでいるのに応答が無い・読めない）、つないでいない間に
 * 取れなかったか（キャッシュにも無い）、無かったか（接続先が 404 などを返した）、上限で手放したか、
 * 持っているか
 */
export type OutputImageEntry =
  'pending' | 'failed' | 'offline' | 'missing' | 'released' | HeldImage;

/** 結果画像の中身（URL ごと）と、手元へ写す操作 */
interface OutputImagesState {
  /** `/view` の URL → 中身 */
  readonly images: ReadonlyMap<string, OutputImageEntry>;
  /**
   * 手元へ写す。済んだもの・取っている最中のものは取り直さない
   * （この画面の実行が同じ名前のファイルを書いたら、その印を捨てて取り直させる）
   */
  readonly ensure: (baseUrl: string, file: OutputFileRef, options?: EnsureOptions) => Promise<void>;
}

/**
 * `/view` の URL。接続先が空・読めない形で URL を作れなければ null（会話は ComfyUI につなぐ前でも
 * 開くので、結果の画像を持つ会話でも投げない）
 */
export function outputViewUrl(baseUrl: string, file: OutputFileRef): string | null {
  if (baseUrl.trim().length === 0) return null;
  try {
    return comfyPort().queue.outputSrc(baseUrl, file);
  } catch {
    // 窓口は接続先の URL が読めない形のときだけ投げる（作るだけで通信はしない）
    return null;
  }
}

/**
 * `img` に渡す先。持っていればその中身、取っている最中（まだ取っていないとき・つないでいない間に
 * 取れなかったときを含む）は null（まだ出さない）。接続先が無いと答えた画像は false（`img` に渡さず代替を出す。取り直しても同じ答えなので要求を重ねない）。
 * 取れなかったとき（接続先が CORS を許していないときを含む）・手放したとき・写せない環境では `/view` を
 * 直接指す（読めなければ `img` 側の代替に任せる）。
 * `until`（その画像を出した実行が終わった時刻。**接続先の時計**の値だけ）を渡すと、それより後に
 * 書かれたファイルは false にする（ComfyUI の再起動で `temp` が消えた後、同じ名前で書かれた別の画像）
 */
export function outputSrc(
  images: ReadonlyMap<string, OutputImageEntry>,
  url: string,
  until?: number,
): string | null | false {
  if (!canHold()) return url;

  const entry = images.get(url);
  if (entry === undefined || entry === 'pending' || entry === 'offline') return null;
  if (entry === 'missing') return false;
  if (typeof entry !== 'object') return url;
  return writtenAfter(entry, until) ? false : entry.src;
}

/** 写した画像が、その実行が終わった後に書かれたものか（終わりが分からなければ false） */
function writtenAfter(entry: HeldImage, until: number | undefined): boolean {
  if (until === undefined || entry.modifiedAt === null) return false;
  return entry.modifiedAt > until + MODIFIED_SLACK_MS;
}

/** 接続先が応答して断った（404 など）か。応答が無い・CORS で読めないときは状態を持たない */
function answeredWithStatus(error: unknown): boolean {
  return isRecord(error) && typeof error.status === 'number';
}

/** Blob の URL が作れない環境（テストなど）では写さない */
function canHold(): boolean {
  return typeof URL.createObjectURL === 'function';
}

/**
 * 選んだ画像を手放す。手放した中身の URL は無効にし、`released` を残す
 * （以後は `/view` を直接指す。写し直さない）。印を消すと「まだ取っていない」と見分けが付かず、
 * 何も出さないままになる
 */
function releaseImages(
  images: ReadonlyMap<string, OutputImageEntry>,
  urls: ReadonlySet<string>,
): Map<string, OutputImageEntry> {
  const next = new Map(images);
  for (const url of urls) {
    const entry = next.get(url);
    if (typeof entry !== 'object') continue;
    URL.revokeObjectURL(entry.src);
    next.set(url, 'released');
  }
  return next;
}

const inFlight = new Map<string, Promise<void>>();

interface HoldRequest {
  readonly baseUrl: string;
  readonly file: OutputFileRef;
  readonly url: string;
  readonly order: number;
  /** その画像を出した実行の終わり（接続先の時計）。分からなければ undefined */
  readonly until: number | undefined;
  readonly done: () => void;
}

/** 同じ描画で頼まれた分。次の小さな区切りで古いものから読み始める */
let requested: HoldRequest[] = [];

export const useOutputImagesStore = create<OutputImagesState>()((set, get) => ({
  images: new Map(),

  ensure: (baseUrl, file, options = {}) => {
    const order = options.order ?? Date.now();
    const { until } = options;
    const url = outputViewUrl(baseUrl, file);
    if (url === null) return Promise.resolve();
    if (!canHold() || get().images.has(url)) return inFlight.get(url) ?? Promise.resolve();
    // 再起動で消えたと分かっている `temp` は取りに行かない
    if (isKnownGone(baseUrl, file.type, until)) {
      set((state) => ({ images: new Map(state.images).set(url, 'missing') }));
      return Promise.resolve();
    }

    set((state) => ({ images: new Map(state.images).set(url, 'pending') }));
    const task = new Promise<void>((done) => {
      requested.push({ baseUrl, file, url, order, until, done });
      if (requested.length === 1) queueMicrotask(readRequested);
    }).finally(() => inFlight.delete(url));

    inFlight.set(url, task);
    return task;
  },
}));

// 実行の記録と合わせた上限で、古い方から手放す（`memory-budget`）
registerHolder('output-images', {
  held: () =>
    [...useOutputImagesStore.getState().images].flatMap(([key, entry]) =>
      typeof entry === 'object' ? [{ key, bytes: entry.bytes, order: entry.order }] : [],
    ),
  release: (keys) =>
    useOutputImagesStore.setState((state) => ({ images: releaseImages(state.images, keys) })),
});

/**
 * まとめて頼まれた分を古いものから読み始める（ブラウザは始めた順に送る）。一覧は新しい順に並ぶので、
 * 頼まれた順に読むと、上限を超えたときに新しいものから消えてしまう
 */
function readRequested(): void {
  const batch = requested.sort((a, b) => a.order - b.order);
  requested = [];
  // 実行の終わりが分かる `temp` は、消えた境目を探してから読む（古い分を 1 枚ずつ取りに行かない）
  const temps = batch.filter(
    (request) => request.file.type === 'temp' && request.until !== undefined,
  );
  for (const request of batch) if (!temps.includes(request)) void read(request);
  void readTemps(temps);
}

/**
 * 実行の終わりが分かる `temp` を、終わりの古い順に並べて境目を半分ずつ読んで探し、境目より前は
 * 取らずに無いものとする。境目を決められなかったら（応答が無いなど）残りを全部読む
 */
async function readTemps(temps: readonly HoldRequest[]): Promise<void> {
  const sorted = [...temps].sort((a, b) => (a.until ?? 0) - (b.until ?? 0));
  const { probed, firstPresent } = await probeBoundary(sorted.length, (index) => {
    const request = sorted[index];
    return request === undefined ? Promise.resolve<TempProbe>('unknown') : read(request);
  });
  sorted.forEach((request, index) => {
    if (probed.has(index)) return;
    if (firstPresent !== null && index < firstPresent) markGone(request);
    else void read(request);
  });
}

/** 読まずに無いものとする（境目より前の `temp`） */
function markGone({ url, done }: HoldRequest): void {
  useOutputImagesStore.setState((state) => ({ images: new Map(state.images).set(url, 'missing') }));
  done();
}

async function read(request: HoldRequest): Promise<TempProbe> {
  const { baseUrl, file, url, order, until, done } = request;
  const put = (entry: OutputImageEntry): void =>
    useOutputImagesStore.setState((state) => ({ images: new Map(state.images).set(url, entry) }));
  // つないでいない間は、ブラウザのキャッシュにあればそれを使う（古くても使う。無ければ取りに行く）
  const offline = useConnectionStore.getState().status !== 'connected';
  try {
    const { blob, modifiedAt } = await comfyPort().queue.fetchOutputImage(
      baseUrl,
      file,
      offline ? { cache: 'force-cache' } : {},
    );
    const held = { src: URL.createObjectURL(blob), bytes: blob.size, order, modifiedAt };
    put(held);
    trimHeld();
    // 同じ名前で後から書かれたものなら、この実行の画像は消えている
    if (!writtenAfter(held, until)) return 'present';
    noteGone(baseUrl, file.type, until);
    return 'gone';
  } catch (error) {
    // 読めなかったものは取り直さない。接続先が無いと答えたもの（`temp` が消えた後など）は `img` にも
    // 渡さない。つないでいない間の失敗は、つないだときに取り直す。つないでいるのに応答が無い・読めない
    // もの（CORS を許していない接続先）は `img` が直接読むのに任せる
    if (!answeredWithStatus(error)) {
      put(offline ? 'offline' : 'failed');
      return 'unknown';
    }
    put('missing');
    noteGone(baseUrl, file.type, until);
    return 'gone';
  } finally {
    done();
  }
}

/**
 * この画面の実行がファイルを書いたら、同じ URL の写しと印を捨てる（描いている部品が頼み直す）。
 * `temp` は ComfyUI の再起動の後に同じ名前で書かれることがあり、前の中身や「無い」を出し続けないため。
 * 捨てるのは新しく届いた出力の分だけなので、取り直した結果でまた捨てることはない
 */
useExecutionStore.subscribe((state, previous) => {
  if (state.outputsById === previous.outputsById) return;
  const { baseUrl } = useSettingsStore.getState();
  const written = new Set<string>();
  for (const [promptId, run] of Object.entries(state.outputsById)) {
    const before = previous.outputsById[promptId];
    for (const [node, files] of Object.entries(run)) {
      if (before?.[node] === files) continue;
      for (const file of files) {
        const url = outputViewUrl(baseUrl, file);
        if (url !== null) written.add(url);
      }
    }
  }
  const { images } = useOutputImagesStore.getState();
  if (![...written].some((url) => images.has(url))) return;
  const next = new Map(images);
  for (const url of written) {
    const entry = next.get(url);
    if (entry === undefined || entry === 'pending') continue;
    if (typeof entry === 'object') URL.revokeObjectURL(entry.src);
    next.delete(url);
  }
  useOutputImagesStore.setState({ images: next });
});

/** つないだら、つないでいない間に取れなかった印を外す（描いている部品が頼み直す） */
useConnectionStore.subscribe((state, previous) => {
  if (state.status !== 'connected' || previous.status === 'connected') return;
  const { images } = useOutputImagesStore.getState();
  if (![...images.values()].includes('offline')) return;
  useOutputImagesStore.setState({
    images: new Map([...images].filter(([, entry]) => entry !== 'offline')),
  });
});
