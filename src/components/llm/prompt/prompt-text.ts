import type { PromptItem } from '@/chat/types';
import { t, type MessageKey } from '@/i18n';

const ITEM_LABELS: Readonly<Record<string, MessageKey>> = {
  main: 'llm.prompt.items.main',
  tone: 'llm.prompt.items.tone',
  rules: 'llm.prompt.items.rules',
  examples: 'llm.prompt.items.examples',
  task: 'llm.prompt.items.task',
  thinking: 'llm.prompt.items.thinking',
  format: 'llm.prompt.items.format',
  jailbreak: 'llm.prompt.items.jailbreak',
  nsfw: 'llm.prompt.items.nsfw',
  enhanceDefinitions: 'llm.prompt.items.enhanceDefinitions',
  chatHistory: 'llm.prompt.items.chatHistory',
  currentInput: 'llm.prompt.items.currentInput',
  personaDescription: 'llm.prompt.items.personaDescription',
  charDescription: 'llm.prompt.items.charDescription',
  charPersonality: 'llm.prompt.items.charPersonality',
  scenario: 'llm.prompt.items.scenario',
  dialogueExamples: 'llm.prompt.items.dialogueExamples',
  additionalInfo: 'llm.prompt.items.additionalInfo',
};

export function defaultItemLabel(item: PromptItem): string {
  const key = ITEM_LABELS[item.marker ?? item.id];
  return t(key ?? 'llm.prompt.items.untitled');
}

export function itemLabel(item: PromptItem): string {
  const name = item.name.trim();
  return name.length > 0 ? name : defaultItemLabel(item);
}
