// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelCard } from '@/components/comfy/flow/dialogs/ModelCard';
import { buildModelItems, modelFileIndex } from '@/graph/model-files';

import { modelFile } from '../helpers/model-files';

afterEach(cleanup);

const NAMES = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => `${name}.safetensors`);

function cards(): void {
  const items = buildModelItems(NAMES, modelFileIndex(NAMES.map((name) => modelFile(name))));
  render(
    <>
      {items.map((item) => (
        <ModelCard
          key={item.value}
          item={item}
          folder="loras"
          baseUrl="http://127.0.0.1:1"
          height={120}
          current={false}
          selected={false}
          onSelect={vi.fn()}
          onPlace={vi.fn()}
        />
      ))}
    </>,
  );
}

function loading(): string[] {
  return NAMES.filter((name) => screen.getByTitle(name).querySelector('img') !== null);
}

describe('ModelCard の画像の順番待ち', () => {
  it('同時に読むのは 4 枚まで。読み終えたら次のカードが読み始める', () => {
    cards();
    expect(loading()).toEqual(NAMES.slice(0, 4));

    fireEvent.load(screen.getByTitle('a.safetensors').querySelector('img') as Element);
    fireEvent.error(screen.getByTitle('b.safetensors').querySelector('img') as Element);
    expect(loading()).toEqual(['a', 'c', 'd', 'e', 'f'].map((name) => `${name}.safetensors`));
  });

  it('カードが消えたら枠を返す', () => {
    cards();
    cleanup();
    cards();
    expect(loading()).toEqual(NAMES.slice(0, 4));
  });
});
