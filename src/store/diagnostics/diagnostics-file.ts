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

export const DIAGNOSTICS_KIND = 'kisara-diagnostics';
const DIAGNOSTICS_SCHEMA = 1;

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

export type DiagnosticsSection = (typeof DIAGNOSTICS_GROUPS)[number]['sections'][number];

export const REQUIRED_SECTIONS: ReadonlySet<DiagnosticsSection> = new Set(['format', 'faults']);

const OFF_BY_DEFAULT: ReadonlySet<DiagnosticsSection> = new Set([
  'workflowShape',
  'definitionSources',
]);

export const DEFAULT_SECTIONS: ReadonlySet<DiagnosticsSection> = new Set(
  DIAGNOSTICS_GROUPS.flatMap((group) => group.sections).filter(
    (section) => !OFF_BY_DEFAULT.has(section),
  ),
);

export const FALLBACK_SECTIONS: ReadonlySet<DiagnosticsSection> = new Set(
  [...DEFAULT_SECTIONS].filter(
    (section) => section !== 'comfyUrl' && section !== 'llmUrl' && section !== 'comfySystem',
  ),
);

export interface DiagnosticsInputs {
  readonly comfySystem: ComfySystemSection | null;
  readonly storage: { readonly usage: number | null; readonly quota: number | null } | null;
}

const CHOICE_SETTINGS = [
  'theme',
  'sidePanelDock',
  'chatImagePlace',
  'webSearchEngine',
] as const satisfies readonly (keyof SettingsState)[];

const NUMERIC_GROUPS = [
  'safeguards',
  'traceLevels',
] as const satisfies readonly (keyof SettingsState)[];

type Primitive = string | number | boolean;

function primitivesOf(value: unknown, withStrings: boolean): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  if (!isRecord(value)) return out;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'number' || typeof item === 'boolean') out[key] = item;
    else if (withStrings && typeof item === 'string') out[key] = item;
  }
  return out;
}

function settingsSummary(state: SettingsState): Record<string, unknown> {
  const out: Record<string, unknown> = primitivesOf(state, false);
  for (const key of CHOICE_SETTINGS) out[key] = state[key];
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

export async function readDiagnosticsInputs(
  options: { readonly comfySystem: boolean } = { comfySystem: true },
): Promise<DiagnosticsInputs> {
  const [comfySystem, storage] = await Promise.all([
    options.comfySystem ? readComfySystem() : Promise.resolve(null),
    storageEstimate(),
  ]);
  return { comfySystem, storage };
}

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

function urlParts(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.startsWith('/')) return [];
  const parts = [trimmed];
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    parts.push(url.host, url.hostname);
  } catch {
  }
  return parts;
}

function knownSecrets(sections: ReadonlySet<DiagnosticsSection>): string[] {
  const { profiles } = useLlmProfilesStore.getState();
  const { baseUrl, baseUrlHistory, llmUrlHistory } = useSettingsStore.getState();
  const comfyUrls = sections.has('comfyUrl') ? [] : [baseUrl, ...baseUrlHistory];
  const llmUrls = sections.has('llmUrl')
    ? []
    : [...llmUrlHistory, ...profiles.map((p) => p.baseUrl)];
  return [...comfyUrls, ...llmUrls].flatMap(urlParts);
}

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

export function formatDiagnostics(diagnostics: Record<string, unknown>): string {
  return `${JSON.stringify(diagnostics, null, 2)}\n`;
}

export function diagnosticsFileName(at: Date = new Date()): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  const date = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}`;
  const time = `${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
  return `${DIAGNOSTICS_KIND}-${date}-${time}.json`;
}
