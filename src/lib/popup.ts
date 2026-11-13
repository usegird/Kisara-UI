// ─────────────────────────────
// 別ウィンドウを開く。描き込み先の要素までここで用意し、React 側は差し込むだけにする。
// ─────────────────────────────

/** 画面いっぱいに開くための指定 */
function features(): string {
  const { availWidth, availHeight } = globalThis.screen;
  return `popup=yes,width=${String(availWidth)},height=${String(availHeight)},left=0,top=0`;
}

/**
 * 元のページのスタイルを写す（開いた先は空の文書なので。開発中は `<style>`、本番は `<link>`）。
 * あとから増えた分は追わない（開いた時点の写し）
 */
function copyStyles(from: Document, to: Document): void {
  for (const node of from.querySelectorAll('style, link[rel="stylesheet"]')) {
    to.head.append(node.cloneNode(true));
  }
}

/** 開いたウィンドウと、その中の描き込み先 */
export interface Popup {
  readonly window: Window;
  /** React のポータルで描き込む先 */
  readonly mount: HTMLElement;
}

/**
 * 空のウィンドウを開き、描き込める状態にして返す。
 * 同じ名前なら開き直さず、既にあるものを前に出す。塞がれたときは null（呼び出し側で案内する）。
 * **必ずクリックの処理の中から呼ぶ。** 副作用の中へ遅らせると操作の許可が切れ、ブラウザに塞がれる。
 */
export function openPopup(name: string, title: string): Popup | null {
  const child = globalThis.open('', name, features());
  if (child === null) return null;

  const doc = child.document;
  doc.title = title;
  // 読み上げが正しい言語で読むように、元のページの言語を写す（WCAG 3.1.1）
  doc.documentElement.lang = globalThis.document.documentElement.lang;
  // 配色（`dark` のクラスと color-scheme）も写す。写さないとダークでも地が白くなる
  doc.documentElement.className = globalThis.document.documentElement.className;
  doc.documentElement.style.colorScheme = globalThis.document.documentElement.style.colorScheme;
  doc.body.replaceChildren();
  doc.body.style.margin = '0';
  copyStyles(globalThis.document, doc);

  const mount = doc.createElement('div');
  mount.style.height = '100vh';
  doc.body.append(mount);

  child.focus();
  return { window: child, mount };
}
