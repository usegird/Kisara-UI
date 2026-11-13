import { describe, expect, it } from 'vitest';

import { exportJson, reviveExport } from '@/lib/export-json';

describe('exportJson', () => {
  it('Blob とバイト列は印付きの data URL にして中身ごと入れ、物と配列はたどる', async () => {
    const text = await exportJson({
      list: [{ image: new Blob(['abc'], { type: 'image/png' }) }],
      bytes: new Uint8Array([1, 2]),
      name: 'x',
    });
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed).toHaveProperty(['list', 0, 'image', '$blob'], 'data:image/png;base64,YWJj');
    expect(parsed).toHaveProperty(['bytes', '$bytes'], 'data:application/octet-stream;base64,AQI=');
    expect(parsed.name).toBe('x');
  });

  it('外から来た鍵（__proto__）も、親を差し替えずにそのまま書く', async () => {
    const text = await exportJson(JSON.parse('{"__proto__": {"polluted": true}}'));
    expect(text).toContain('"__proto__"');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('reviveExport', () => {
  it('印を Blob・バイト列へ戻し、ほかはそのまま', async () => {
    const text = await exportJson({
      image: new Blob(['abc'], { type: 'image/png' }),
      bytes: new Uint8Array([1, 2]),
      name: 'x',
    });
    const revived = reviveExport(JSON.parse(text)) as Record<string, unknown>;
    expect(revived.image).toBeInstanceOf(Blob);
    expect(await (revived.image as Blob).text()).toBe('abc');
    expect((revived.image as Blob).type).toBe('image/png');
    expect([...(revived.bytes as Uint8Array)]).toEqual([1, 2]);
    expect(revived.name).toBe('x');
  });

  it('印でない物（鍵が 2 つ以上・中身が data URL でない）は戻さない', () => {
    const value = { $blob: 'data:x;base64,AA==', other: 1 };
    expect(reviveExport(value)).toEqual(value);
    expect(reviveExport({ $blob: 'not a url' })).toEqual({ $blob: 'not a url' });
  });
});
