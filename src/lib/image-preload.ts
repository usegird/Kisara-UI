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
  }
}

export function preloadImages(urls: readonly string[] | Promise<readonly string[]>): Promise<void> {
  return Promise.race([
    Promise.resolve(urls)
      .then((list) => Promise.all(list.map(ready)))
      .then(() => undefined),
    timeout(PRELOAD_TIMEOUT_MS),
  ]);
}
