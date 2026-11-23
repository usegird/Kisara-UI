import type { OwnLorebook } from '@/chat/lore';
import type { ChatPlaybookRef, PlaybookInstruction } from '@/chat/playbook';
import type { OutputFileRef } from '@/port/files';
import type {
  Citation,
  GenerationParams,
  LlmFailure,
  TokenUsage,
  ToolBilling,
} from '@/port/llm-port';

export type CandidateEnd =
  | { readonly kind: 'streaming' }
  | { readonly kind: 'done'; readonly reason: string | null }
  | { readonly kind: 'stopped' }
  | { readonly kind: 'failed'; readonly failure: LlmFailure };

export type ToolCallProblem =
  | { readonly code: 'unknown-tool' }
  | { readonly code: 'json' }
  | {
      readonly code: 'missing' | 'unknown' | 'type' | 'range' | 'choice';
      readonly argument: string;
    };

export type ToolCallState =
  | { readonly kind: 'receiving' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'invalid'; readonly problem: ToolCallProblem }
  | { readonly kind: 'declined' }
  | {
      readonly kind: 'queued';
      readonly promptId: string;
      readonly outputs?: readonly string[] | undefined;
    }
  | { readonly kind: 'done'; readonly images: readonly OutputFileRef[] }
  | { readonly kind: 'failed'; readonly message: string }
  | {
      readonly kind: 'unknown';
      readonly promptId: string;
      readonly outputs?: readonly string[] | undefined;
    };

export interface ToolCallRun {
  readonly arguments: string;
  readonly state: ToolCallState;
}

export interface ResponseTiming {
  readonly firstMs?: number | undefined;
  readonly receivingMs?: number | undefined;
  readonly referenceUsd?: number | undefined;
}

export interface ResponseRecord {
  readonly usage?: TokenUsage | undefined;
  readonly timing?: ResponseTiming | undefined;
  readonly billing?: ToolBilling | undefined;
}

export interface ToolCallGeneration extends ResponseRecord {
  readonly reasoning: string;
}

export interface ToolCallRecord extends ToolCallRun {
  readonly id: string;
  readonly name: string;
  readonly previousRuns?: readonly ToolCallRun[] | undefined;
  readonly generation?: ToolCallGeneration | undefined;
}

export interface Candidate {
  readonly content: string;
  readonly reasoning: string;
  readonly end: CandidateEnd;
  readonly usage?: TokenUsage | undefined;
  readonly finishReason?: string | undefined;
  readonly timing?: ResponseTiming | undefined;
  readonly billing?: ToolBilling | undefined;
  readonly citations?: readonly Citation[] | undefined;
  readonly toolCalls?: readonly ToolCallRecord[] | undefined;
  readonly sentEstimate?: number | undefined;
  readonly trimmed?: number | undefined;
  readonly images?: readonly string[] | undefined;
  readonly revision?: CandidateRevision | undefined;
  readonly expression?: string | undefined;
}

export interface CandidateRevision {
  readonly base: number;
  readonly instruction: string;
}

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  readonly id: string;
  readonly role: MessageRole;
  readonly candidates: readonly Candidate[];
  readonly selected: number;
  readonly instruction?: PlaybookInstruction | undefined;
}

export type PromptRole = 'system' | 'user' | 'assistant';

export type PromptMarker =
  | 'chatHistory'
  | 'currentInput'
  | 'additionalInfo'
  | 'personaDescription'
  | 'charDescription'
  | 'charPersonality'
  | 'scenario'
  | 'dialogueExamples';

export type PromptPosition =
  | { readonly kind: 'relative' }
  | { readonly kind: 'depth'; readonly depth: number; readonly order: number };

export interface PromptItem {
  readonly id: string;
  readonly name: string;
  readonly role: PromptRole;
  readonly marker: PromptMarker | null;
  readonly content: string;
  readonly enabled: boolean;
  readonly position: PromptPosition;
}

export interface PromptComposition {
  readonly items: readonly PromptItem[];
  readonly prefill: { readonly content: string; readonly enabled: boolean };
  readonly usePresetOverrides: boolean;
  readonly loreFraming?: LoreFraming | undefined;
}

export interface LoreFraming {
  readonly prefix: string;
  readonly suffix: string;
}

export interface Persona {
  readonly name: string;
  readonly description: string;
}

export interface UnitLink {
  readonly id: string;
  readonly name: string;
}

export interface ChatVariable {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly restore?: true;
}

export interface CharacterFields {
  readonly name: string;
  readonly description: string;
  readonly personality: string;
  readonly scenario: string;
  readonly mesExample: string;
  readonly firstMes: string;
  readonly alternateGreetings: readonly string[];
  readonly creatorNotes: string;
  readonly systemPrompt: string;
  readonly postHistoryInstructions: string;
  readonly variables?: readonly ChatVariable[] | undefined;
}

export interface Avatar {
  readonly id: string;
  readonly name: string;
  readonly image: Blob;
  readonly hash: string;
  readonly createdAt: number;
}

export interface Preset {
  readonly id: string;
  readonly name: string;
  readonly fields: CharacterFields;
  readonly imageId: string | null;
  readonly lorebooks: readonly OwnLorebook[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ChatExpressionChoice {
  readonly label: string;
  readonly after: string | null;
}

export interface Chat {
  readonly name: string;
  readonly prompt: PromptComposition;
  readonly preset: UnitLink | null;
  readonly character: CharacterFields | null;
  readonly persona: Persona | null;
  readonly messages: readonly ChatMessage[];
  readonly summary?: ChatSummary | undefined;
  readonly playbook?: ChatPlaybookRef | undefined;
  readonly lorebooks?: readonly OwnLorebook[] | undefined;
  readonly imageId?: string | null | undefined;
  readonly expression?: ChatExpressionChoice | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ChatSummary {
  readonly content: string;
  readonly upTo: string;
  readonly response?: ResponseRecord | undefined;
}

export type ChatPlace =
  | { readonly kind: 'browser' }
  | { readonly kind: 'comfy'; readonly baseUrl: string }
  | { readonly kind: 'both'; readonly baseUrl: string };

export const BROWSER_PLACE: ChatPlace = { kind: 'browser' };

export function inBrowser(place: ChatPlace): boolean {
  return place.kind !== 'comfy';
}

export function comfyUrlOf(place: ChatPlace): string | null {
  return place.kind === 'browser' ? null : place.baseUrl;
}

export function placeFrom(browser: boolean, comfyUrl: string | null): ChatPlace {
  if (comfyUrl === null) return BROWSER_PLACE;
  return browser ? { kind: 'both', baseUrl: comfyUrl } : { kind: 'comfy', baseUrl: comfyUrl };
}

export interface ChatMeta {
  readonly id: string;
  readonly name: string;
  readonly head: string;
  readonly size: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ConnectionProfile {
  readonly id: string;
  readonly baseUrl: string;
  readonly keyRequired: boolean;
  readonly defaultModel: string;
}

const RELATIVE: PromptPosition = { kind: 'relative' };

function marker(id: PromptMarker, role: PromptRole = 'system'): PromptItem {
  return { id, name: '', role, marker: id, content: '', enabled: true, position: RELATIVE };
}

export const MAIN_PROMPT_ID = 'main';
export const POST_HISTORY_ID = 'jailbreak';
export const ADDITIONAL_INFO_ID = 'additionalInfo';

export function defaultComposition(): PromptComposition {
  return {
    items: [marker(ADDITIONAL_INFO_ID), marker('chatHistory'), marker('currentInput', 'user')],
    prefill: { content: '', enabled: false },
    usePresetOverrides: true,
  };
}

export const EMPTY_CHAT: Chat = {
  name: '',
  prompt: defaultComposition(),
  preset: null,
  character: null,
  persona: null,
  messages: [],
  createdAt: 0,
  updatedAt: 0,
};

export interface SystemPromptTemplate {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly params: GenerationParams;
  readonly createdAt: number;
  readonly updatedAt: number;
}
