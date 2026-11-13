// ─────────────────────────────
// 画像の先読み。**入れ替える前に読み込みと復号まで済ませる**ため、
// 差し替えた瞬間に空白が出ない（`decode()` の用途そのもの）。
// ─────────────────────────────

/**
 * 先読みを待つ上限。待ちが長引くと操作が止まって見えるので、これを超えたら読み込みを続けたまま
 * 先へ進む
 */
const PRELOAD_TIMEOUT_MS = 1_200;

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ready(url: string): Promise<void> {
  const image = new Image();
  image.src = url;

  try {
    await image.decode();
  } catch {
    // 読めない画像でも送りは止めない（表示は `img` 側の代替に任せる）
  }
}

/**
 * すべて描ける状態になったら解決する（上限あり）。
 * 読み先がまだ決まっていないとき（取り寄せ中）は、その待ちも上限に含める
 */
export function preloadImages(urls: readonly string[] | Promise<readonly string[]>): Promise<void> {
  return Promise.race([
    Promise.resolve(urls)
      .then((list) => Promise.all(list.map(ready)))
      .then(() => undefined),
    timeout(PRELOAD_TIMEOUT_MS),
  ]);
}
