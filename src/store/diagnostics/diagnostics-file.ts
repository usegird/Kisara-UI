import { activeLocale } from '@/i18n';
import { isRecord } from '@/lib/guards';
import { redactText, scrubKnown, traceSnapshot } from '@/lib/trace';
import {
  comfyConnection,
  definitionSources,
  endpointKind,
  readComfySystem,
  workflowShape,
  type ComfySystemSection,
} from '@/store/diagnostics/diagnostics-comfy';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore, type SettingsState } from '@/store/use-settings-store';

// ─────────────────────────────
// 診断ファイルの組み立て。**入れてよい物の一覧で組む。**
// 通信が要る物（ComfyUI の版）と待ちが要る物（保存領域の使用量）は先に読み（`readDiagnosticsInputs`）、
// 区分を選び直すたびの組み立ては同期で済ませる（`buildDiagnostics`）。書き出しは画面の側が行う
// ─────────────────────────────

/**
 * 種類の印。問い合わせのフォームもこれで診断ファイルと見分ける
 */
export const DIAGNOSTICS_KIND = 'kisara-diagnostics';
const DIAGNOSTICS_SCHEMA = 1;

/**
 * 区分の並び。全般・ComfyUI・LLM の 3 つに分ける
 */
export const DIAGNOSTICS_GROUPS = [
  { id: 'general', sections: ['format', 'faults', 'app', 'environment', 'settings'] },
  {
    id: 'comfy',
    sections: [
      'comfyEvents',
      'comfySystem',
      'comfyConnection',
      'comfyUrl',
      'workflowShape',
      'definitionSources',
    ],
  },
  { id: 'llm', sections: ['llmEvents', 'llmConnection', 'llmUrl', 'llmParams'] },
] as const;

/** 診断ファイルに入れる節の名前 */
export type DiagnosticsSection = (typeof DIAGNOSTICS_GROUPS)[number]['sections'][number];

/**
 * 外せない区分。ファイルの種類の印（フォームが見分けに使う）と、起きたエラー
 */
export const REQUIRED_SECTIONS: ReadonlySet<DiagnosticsSection> = new Set(['format', 'faults']);

/** 既定で外す区分（作品や手元の構成が分かる物） */
const OFF_BY_DEFAULT: ReadonlySet<DiagnosticsSection> = new Set([
  'workflowShape',
  'definitionSources',
]);

/**
 * 開いたときに選んである区分。接続先 URL も入れる（外せる）
 */
export const DEFAULT_SECTIONS: ReadonlySet<DiagnosticsSection> = new Set(
  DIAGNOSTICS_GROUPS.flatMap((group) => group.sections).filter(
    (section) => !OFF_BY_DEFAULT.has(section),
  ),
);

/**
 * ダイアログを開かずに書き出すときの区分（アプリ全体の受け止め画面）。全文を見せられないので
 * 接続先 URL は入れず、版は読まない（通信しない）
 */
export const FALLBACK_SECTIONS: ReadonlySet<DiagnosticsSection> = new Set(
  [...DEFAULT_SECTIONS].filter(
    (section) => section !== 'comfyUrl' && section !== 'llmUrl' && section !== 'comfySystem',
  ),
);

/** 先に読んでおく物 */
export interface DiagnosticsInputs {
  /** 読まなかったときは null（アプリ全体の受け止め画面から書き出すとき） */
  readonly comfySystem: ComfySystemSection | null;
  readonly storage: { readonly usage: number | null; readonly quota: number | null } | null;
}

/** 選択肢で選ぶ設定のうち、文字で持つ物（自由に書く文字は入れない） */
const CHOICE_SETTINGS = [
  'theme',
  'sidePanelDock',
  'chatImagePlace',
  'webSearchEngine',
] as const satisfies readonly (keyof SettingsState)[];

/** 数と真偽だけを抜き出す物（生成の設定は LLM の区分に分けて持つ） */
const NUMERIC_GROUPS = [
  'safeguards',
  'traceLevels',
] as const satisfies readonly (keyof SettingsState)[];

type Primitive = string | number | boolean;

function primitivesOf(value: unknown, withStrings: boolean): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  // 渡るのは設定の値と設定の中の物だけ（配列は来ない）
  if (!isRecord(value)) return out;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'number' || typeof item === 'boolean') out[key] = item;
    else if (withStrings && typeof item === 'string') out[key] = item;
  }
  return out;
}

/**
 * 設定のうち、選択肢・真偽・数だけ
 */
function settingsSummary(state: SettingsState): Record<string, unknown> {
  const out: Record<string, unknown> = primitivesOf(state, false);
  for (const key of CHOICE_SETTINGS) out[key] = state[key];
  // 段階は選択肢の文字だけを持つ。上限と生成の設定は数と真偽だけ
  for (const key of NUMERIC_GROUPS) out[key] = primitivesOf(state[key], key === 'traceLevels');
  return out;
}

function environment(): Record<string, unknown> {
  const nav = globalThis.navigator as (Navigator & { readonly deviceMemory?: number }) | undefined;
  const win = globalThis as {
    innerWidth?: number;
    innerHeight?: number;
    devicePixelRatio?: number;
  };
  return {
    userAgent: nav?.userAgent ?? null,
    languages: nav?.languages ? [...nav.languages] : [],
    locale: activeLocale(),
    viewport: {
      width: win.innerWidth ?? null,
      height: win.innerHeight ?? null,
      devicePixelRatio: win.devicePixelRatio ?? null,
    },
    hardwareConcurrency: nav?.hardwareConcurrency ?? null,
    deviceMemory: nav?.deviceMemory ?? null,
  };
}

async function storageEstimate(): Promise<DiagnosticsInputs['storage']> {
  try {
    const estimate = await globalThis.navigator?.storage?.estimate?.();
    if (estimate === undefined) return null;
    return { usage: estimate.usage ?? null, quota: estimate.quota ?? null };
  } catch {
    return null;
  }
}

/** 組み立ての前に読む物。`comfySystem` を false にすると通信しない */
export async function readDiagnosticsInputs(
  options: { readonly comfySystem: boolean } = { comfySystem: true },
): Promise<DiagnosticsInputs> {
  const [comfySystem, storage] = await Promise.all([
    options.comfySystem ? readComfySystem() : Promise.resolve(null),
    storageEstimate(),
  ]);
  return { comfySystem, storage };
}

/**
 * アプリの版とビルドのコミット（`vite.config.ts` の `define`）。開発サーバが設定を読み直さずに
 * 動いていると名前が無いので、そのときは版が分からないとして書く（ダイアログを落とさない）
 */
function buildInfo(): { readonly version: string; readonly commit: string | null } {
  return typeof __KISARA_BUILD__ === 'undefined'
    ? { version: 'unknown', commit: null }
    : { version: __KISARA_BUILD__.version, commit: __KISARA_BUILD__.commit };
}

function llmBaseUrl(): string | null {
  const { llmProfileId } = useSettingsStore.getState();
  const profile = useLlmProfilesStore.getState().profiles.find((item) => item.id === llmProfileId);
  return profile === undefined || profile.baseUrl.trim().length === 0 ? null : profile.baseUrl;
}

/**
 * 書き出す接続先 URL。利用者名・パスワード・問い合わせの部分（`?` の後）は落とし、パスの中のキーに
 * 見える文字列も伏せる（パスにキーを入れるサービスがある）。読めない値は書かない
 */
function endpointUrl(value: string | null): string | null {
  if (value === null || value.trim().length === 0) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('/')) {
    const path = trimmed.split(/[?#]/)[0];
    return path === undefined ? null : redactText(path);
  }
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    return `${url.origin}${redactText(url.pathname.replace(/\/+$/, ''))}`;
  } catch {
    return null;
  }
}

/** 診断ファイルの中身。区分を選び直すたびに呼ぶ。外せない区分はいつも入る。分かっている秘密は文字の値から消してある */
export function buildDiagnostics(
  inputs: DiagnosticsInputs,
  chosen: ReadonlySet<DiagnosticsSection>,
  exportedAt: Date = new Date(),
): Record<string, unknown> {
  const sections = new Set([...REQUIRED_SECTIONS, ...chosen]);
  return scrubValues(
    rawDiagnostics(inputs, sections, exportedAt),
    knownSecrets(sections),
  ) as Record<string, unknown>;
}

/** 入れる区分だけを、鍵ごと持つ物にする */
function pick(
  sections: ReadonlySet<DiagnosticsSection>,
  entries: readonly (readonly [DiagnosticsSection, string, () => unknown])[],
): Record<string, unknown> {
  return Object.fromEntries(
    entries.filter(([section]) => sections.has(section)).map(([, key, read]) => [key, read()]),
  );
}

function rawDiagnostics(
  inputs: DiagnosticsInputs,
  sections: ReadonlySet<DiagnosticsSection>,
  exportedAt: Date,
): Record<string, unknown> {
  const trace = traceSnapshot();
  const comfyUrl = useSettingsStore.getState().baseUrl;
  const llmUrl = llmBaseUrl();
  const eventsOf = (area: 'comfy' | 'llm') => trace.events.filter((event) => event.area === area);
  return {
    kind: DIAGNOSTICS_KIND,
    schema: DIAGNOSTICS_SCHEMA,
    exportedAt: exportedAt.toISOString(),
    levels: trace.levels,
    faults: trace.faults,
    ...pick(sections, [
      ['app', 'app', buildInfo],
      ['environment', 'environment', () => ({ ...environment(), storage: inputs.storage })],
      ['settings', 'settings', () => settingsSummary(useSettingsStore.getState())],
    ]),
    comfy: pick(sections, [
      ['comfyEvents', 'events', () => eventsOf('comfy')],
      ['comfySystem', 'system', () => inputs.comfySystem ?? { unavailable: 'not-read' }],
      ['comfyConnection', 'connection', comfyConnection],
      ['comfyUrl', 'url', () => endpointUrl(comfyUrl)],
      ['workflowShape', 'workflowShape', workflowShape],
      ['definitionSources', 'definitionSources', definitionSources],
    ]),
    llm: pick(sections, [
      ['llmEvents', 'events', () => eventsOf('llm')],
      ['llmConnection', 'endpoint', () => (llmUrl === null ? null : endpointKind(llmUrl))],
      ['llmUrl', 'url', () => endpointUrl(llmUrl)],
      ['llmParams', 'params', () => primitivesOf(useSettingsStore.getState().llmParams, false)],
    ]),
  };
}

/**
 * URL とそのホスト（ポート付きとポート無し）。開発時の中継（`/comfy`）のような相対の値は
 * 秘密ではなく、短い語まで消してしまうので探さない
 */
function urlParts(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.startsWith('/')) return [];
  const parts = [trimmed];
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    parts.push(url.host, url.hostname);
  } catch {
    // 読めない値はそのまま探す
  }
  return parts;
}

/**
 * 接続先（ComfyUI・LLM の今の値と履歴）。書き出す文面からそのまま消す。接続先 URL の区分を選んだ側は、
 * その接続先を消さない。API キーは本体に無い（ゲートウェイが持つ）ので探さない
 */
function knownSecrets(sections: ReadonlySet<DiagnosticsSection>): string[] {
  const { profiles } = useLlmProfilesStore.getState();
  const { baseUrl, baseUrlHistory, llmUrlHistory } = useSettingsStore.getState();
  const comfyUrls = sections.has('comfyUrl') ? [] : [baseUrl, ...baseUrlHistory];
  const llmUrls = sections.has('llmUrl')
    ? []
    : [...llmUrlHistory, ...profiles.map((p) => p.baseUrl)];
  return [...comfyUrls, ...llmUrls].flatMap(urlParts);
}

/** 文字の値だけをたどって秘密を消す（鍵と形は変えない） */
function scrubValues(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') return scrubKnown(value, secrets);
  if (Array.isArray(value)) return value.map((item) => scrubValues(item, secrets));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, scrubValues(item, secrets)]),
    );
  }
  return value;
}

/**
 * 書き出す文面（秘密は `buildDiagnostics` が消してある）
 */
export function formatDiagnostics(diagnostics: Record<string, unknown>): string {
  return `${JSON.stringify(diagnostics, null, 2)}\n`;
}

/** `kisara-diagnostics-<年月日>-<時分秒>.json`（利用者の時刻） */
export function diagnosticsFileName(at: Date = new Date()): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  const date = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}`;
  const time = `${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
  return `${DIAGNOSTICS_KIND}-${date}-${time}.json`;
}
