// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { menuActionSections } from '@/lib/menu-actions';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(html: string): void {
  document.body.innerHTML = html;
}

function summary(origin: string): string[][] {
  const element = document.querySelector(origin);
  if (element === null) throw new Error(`${origin} が無い`);
  return menuActionSections(element).map((section) => [
    section.label,
    ...section.actions.map((action) => action.label),
  ]);
}

describe('menuActionSections', () => {
  it('開いた行の操作と、行の外の操作に分ける。ほかの行の操作は並べない', () => {
    mount(`
      <li data-menu-scope="カード">
        <button data-menu-action aria-label="並べ替える"></button>
        <div data-menu-row="a">
          <button data-menu-action aria-label="a の手前に追加"></button>
          <input id="a" />
        </div>
        <div data-menu-row="b">
          <button data-menu-action aria-label="b の手前に追加"></button>
        </div>
        <button aria-label="印の無いボタン"></button>
      </li>`);

    expect(summary('#a')).toEqual([
      ['a', 'a の手前に追加'],
      ['カード', '並べ替える'],
    ]);
  });

  it('掴み（区切り・並べ替えの取っ手）は焦点を移すもの、ほかは押すもの。名前はメニュー用・読み上げ・説明の順', () => {
    mount(`
      <li data-menu-scope="カード">
        <div data-menu-action role="separator" aria-label="高さ"></div>
        <button data-menu-action aria-roledescription="sortable" aria-label="取っ手"></button>
        <button data-menu-action title="MODEL（ドラッグして接続）">MODEL</button>
        <button data-menu-action aria-label="押せない" disabled></button>
        <button data-menu-action data-menu-label="カードを選ぶ">カード</button>
        <input id="field" />
      </li>`);

    const [section] = menuActionSections(document.querySelector('#field') as Element);
    expect(section?.actions.map((action) => [action.label, action.focus, action.disabled])).toEqual(
      [
        ['高さ', true, false],
        ['取っ手', true, false],
        ['MODEL（ドラッグして接続）', false, false],
        ['押せない', false, true],
        ['カードを選ぶ', false, false],
      ],
    );
  });

  it('入れ子のカードの操作は外のカードに並べない', () => {
    mount(`
      <li data-menu-scope="外">
        <button data-menu-action aria-label="外の操作"></button>
        <input id="outer" />
        <li data-menu-scope="中"><button data-menu-action aria-label="中の操作"></button></li>
      </li>`);

    expect(summary('#outer')).toEqual([['外', '外の操作']]);
  });

  it('まとまりの外で開いたら何も並べない', () => {
    mount('<input id="alone" />');
    expect(summary('#alone')).toEqual([]);
  });
});
