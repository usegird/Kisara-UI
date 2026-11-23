import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '@/comfy/client';
import { templateFileUrl, templateIndexUrl } from '@/comfy/endpoints';
import { listTemplates, parseTemplateIndex, templateThumbnailSrc } from '@/comfy/templates';

const BASE = 'http://127.0.0.1:8188';

const INDEX = [
  {
    title: 'Image',
    category: 'GENERATION TYPE',
    templates: [
      { name: 'flux', title: 'Flux', mediaType: 'image', mediaSubtype: 'webp', usage: 5 },
      { title: '名前が無い' },
    ],
  },
  { title: '空', templates: [] },
  'broken',
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('テンプレートの一覧', () => {
  it('形の合わない見出しと 1 件は落とし、残りは読む', () => {
    const sections = parseTemplateIndex(INDEX);

    expect(sections.map((section) => section.title)).toEqual(['Image']);
    expect(sections[0]?.templates.map((template) => template.name)).toEqual(['flux']);
    expect(sections[0]?.templates[0]?.usage).toBe(5);
    expect(sections[0]?.templates[0]?.size).toBeNull();
  });

  it('配列でなければ空', () => {
    expect(parseTemplateIndex({ templates: [] })).toEqual([]);
  });

  it('英語は既定の一覧だけを取る', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(INDEX)));

    const result = await listTemplates(BASE, 'en', { fetchImpl });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([templateIndexUrl(BASE)]);
    expect(result.fellBack).toBe(false);
  });

  it('他の言語は訳の一覧を取る', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(INDEX)));

    const result = await listTemplates(BASE, 'ja', { fetchImpl });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([templateIndexUrl(BASE, 'ja')]);
    expect(result.fellBack).toBe(false);
  });

  it('言語の一覧が無ければ既定の一覧に落とす', async () => {
    const fetchImpl = vi.fn<FetchLike>((url) =>
      Promise.resolve(url.endsWith('index.ja.json') ? jsonResponse({}, 404) : jsonResponse(INDEX)),
    );

    const { sections, fellBack } = await listTemplates(BASE, 'ja', { fetchImpl });

    expect(sections).toHaveLength(1);
    expect(fellBack).toBe(true);
    expect(fetchImpl.mock.calls.at(-1)?.[0]).toBe(templateIndexUrl(BASE));
  });

  it('サムネイルは画像のものだけ', () => {
    const [image] = parseTemplateIndex(INDEX)[0]?.templates ?? [];
    if (!image) throw new Error('fixture');

    expect(templateThumbnailSrc(BASE, image)).toBe(templateFileUrl(BASE, 'flux-1.webp'));
    expect(templateThumbnailSrc(BASE, { ...image, mediaType: 'audio' })).toBeNull();
  });

  it('経路は templates の下', () => {
    expect(templateIndexUrl(BASE, 'ja')).toBe(`${BASE}/templates/index.ja.json`);
    expect(templateFileUrl(BASE, 'a b.json')).toBe(`${BASE}/templates/a%20b.json`);
  });
});
