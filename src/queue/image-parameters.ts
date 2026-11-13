// ─────────────────────────────
// 他のツール（A1111 / Forge）が画像に埋め込む `parameters` の読み分け。
// ─────────────────────────────

/** `parameters` を読み分けたもの */
interface ImageParameters {
  readonly positive: string;
  /** `Negative prompt:` が無ければ null */
  readonly negative: string | null;
  readonly settings: readonly { readonly name: string; readonly text: string }[];
  /** 設定の `Model` と、プロンプトの `<lora:名前:重み>` の名前（重複を除く） */
  readonly models: readonly string[];
}

const SETTINGS_HEAD = 'Steps: ';
const NEGATIVE_HEAD = 'Negative prompt:';

/** `a: 1, b: "x, y"` を項目に分ける。`"` で囲んだ中のカンマでは分けない */
function settingItems(line: string): { name: string; text: string }[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);

  return parts.flatMap((part) => {
    const at = part.indexOf(':');
    if (at < 0) return [];
    const name = part.slice(0, at).trim();
    const text = part
      .slice(at + 1)
      .trim()
      .replace(/^"(.*)"$/s, '$1');
    return name.length === 0 ? [] : [{ name, text }];
  });
}

function loraNames(prompt: string): string[] {
  return [...prompt.matchAll(/<lora:([^:>]+)(?::[^>]*)?>/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

/**
 * `parameters` の本文をポジティブ・ネガティブ・設定・モデル名に分ける。形は次のとおり:
 *   <ポジティブ>
 *   Negative prompt: <ネガティブ>        … 無いこともある
 *   Steps: 20, Sampler: Euler a, Model: name, Lora hashes: "a: 1, b: 2", …
 */
export function parseImageParameters(text: string): ImageParameters {
  const lines = text.split(/\r?\n/);
  const at = lines.findLastIndex((line) => line.startsWith(SETTINGS_HEAD));
  const settings = at < 0 ? [] : settingItems(lines.slice(at).join(', '));
  const prompt = (at < 0 ? lines : lines.slice(0, at)).join('\n');

  const negativeAt = prompt.indexOf(`\n${NEGATIVE_HEAD}`);
  const start = prompt.startsWith(NEGATIVE_HEAD) ? 0 : negativeAt;
  const positive = (start < 0 ? prompt : prompt.slice(0, start)).trim();
  const negative = start < 0 ? null : prompt.slice(start).trim().slice(NEGATIVE_HEAD.length).trim();

  const model = settings.find((item) => item.name === 'Model')?.text;
  const models = [...new Set([...(model ? [model] : []), ...loraNames(positive)])];
  return { positive, negative, settings, models };
}
