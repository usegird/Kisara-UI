import { describe, expect, it } from 'vitest';

import { readOpenedFile } from '@/graph/workflow-source';

import { png, textChunk } from '../helpers/png';

const WORKFLOW = { nodes: [], links: [] };

describe('開くファイルの中身', () => {
  it('JSON は本文を読む', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(WORKFLOW));
    expect(readOpenedFile(bytes.buffer, new Map())).toEqual({ kind: 'workflow', source: WORKFLOW });
  });

  it('PNG は API Prompt（prompt）ではなく、埋め込みの workflow を読む', () => {
    const image = png(
      textChunk('prompt', '{"1":{}}'),
      textChunk('workflow', JSON.stringify(WORKFLOW)),
    );
    expect(readOpenedFile(image, new Map())).toEqual({ kind: 'workflow', source: WORKFLOW });
  });

  it('workflow が無く API Prompt（prompt）だけの PNG は、prompt から組み立てる', () => {
    const prompt = { '1': { class_type: 'Note', inputs: { text: 'memo' } } };
    const opened = readOpenedFile(png(textChunk('prompt', JSON.stringify(prompt))), new Map());

    expect(opened).toMatchObject({
      kind: 'workflow',
      source: { nodes: [{ id: 1, type: 'Note', widgets_values: ['memo'] }] },
    });
  });

  it('ワークフローを持たず文字の埋め込みだけの PNG は、画像として返す', () => {
    const text = 'a girl, Steps: 8';
    const opened = readOpenedFile(png(textChunk('parameters', text)), new Map());

    expect(opened.kind).toBe('image');
    expect(opened.kind === 'image' && opened.texts.get('parameters')).toBe(text);
  });

  it('埋め込みが 1 つも無い PNG は理由付きで断る', () => {
    expect(() => readOpenedFile(png(), new Map())).toThrow('ワークフローも埋め込みの文字も');
  });
});
