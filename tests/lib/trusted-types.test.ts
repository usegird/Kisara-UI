import { describe, expect, it } from 'vitest';

import { allowedHtml, allowedScriptUrl } from '@/lib/trusted-types';

describe('通す HTML', () => {
  it('文字の参照 1 つと空の文字列だけを通す', () => {
    expect(allowedHtml('&amp;')).toBe('&amp;');
    expect(allowedHtml('&#169;')).toBe('&#169;');
    expect(allowedHtml('&#x1F600;')).toBe('&#x1F600;');
    expect(allowedHtml('')).toBe('');
  });

  it('要素や、参照を並べたものは通さない', () => {
    expect(() => allowedHtml('<img src=x onerror=alert(1)>')).toThrow(TypeError);
    expect(() => allowedHtml('&amp;<b>')).toThrow(TypeError);
    expect(() => allowedHtml('&amp;&amp;')).toThrow(TypeError);
  });
});

describe('通すスクリプトの URL', () => {
  const origin = 'https://kisara.example';

  it('同じオリジンだけを通す（相対の URL を含む）', () => {
    expect(allowedScriptUrl('https://kisara.example/assets/w.js', origin)).toBe(
      'https://kisara.example/assets/w.js',
    );
    expect(allowedScriptUrl('/assets/w.js', origin)).toBe('/assets/w.js');
  });

  it('ほかのオリジンと blob・data は通さない', () => {
    expect(() => allowedScriptUrl('https://evil.example/w.js', origin)).toThrow(TypeError);
    expect(() => allowedScriptUrl('data:text/javascript,alert(1)', origin)).toThrow(TypeError);
    expect(() => allowedScriptUrl('blob:https://evil.example/1', origin)).toThrow(TypeError);
    expect(() => allowedScriptUrl('blob:https://kisara.example/1', origin)).toThrow(TypeError);
  });
});
