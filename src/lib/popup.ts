function features(): string {
  const { availWidth, availHeight } = globalThis.screen;
  return `popup=yes,width=${String(availWidth)},height=${String(availHeight)},left=0,top=0`;
}

function copyStyles(from: Document, to: Document): void {
  for (const node of from.querySelectorAll('style, link[rel="stylesheet"]')) {
    to.head.append(node.cloneNode(true));
  }
}

export interface Popup {
  readonly window: Window;
  readonly mount: HTMLElement;
}

export function openPopup(name: string, title: string): Popup | null {
  const child = globalThis.open('', name, features());
  if (child === null) return null;

  const doc = child.document;
  doc.title = title;
  doc.documentElement.lang = globalThis.document.documentElement.lang;
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
