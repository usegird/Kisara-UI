import { describe, expect, it } from 'vitest';

import { jsonEditsFilePath, notesFilePath, styleFilePath } from '@/graph/kisara-files';

describe('メモの経路', () => {
  it('モデル名の区切りはフォルダとして残し、拡張子を残したまま .txt を足す', () => {
    expect(notesFilePath('loras', 'sub\\a.safetensors')).toBe('loras/sub/a.safetensors.txt');
    expect(notesFilePath('loras', 'a.pt')).not.toBe(notesFilePath('loras', 'a.safetensors'));
  });

  it('同名の JSON の差分はメモと同じ名前で、拡張子だけ .json', () => {
    expect(jsonEditsFilePath('loras', 'sub\\a.safetensors')).toBe('loras/sub/a.safetensors.json');
  });

  it('要素ごとに退避するので、上へ戻る経路にならない', () => {
    expect(notesFilePath('loras', '../../x%2Fy.safetensors')).toBe(
      'loras/.~2E/.~2E/x%2Fy.safetensors.txt',
    );
  });
});

describe('スタイルの経路', () => {
  it('名前を小文字にしてから作る（大文字小文字だけ違う名前は同じファイル）', () => {
    expect(styleFilePath('Anime')).toBe('anime.json');
    expect(styleFilePath('a/b')).toBe('a~2Fb.json');
  });
});
