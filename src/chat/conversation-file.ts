import { leadingSystemText } from '@/chat/prompt';
import type { Candidate, Chat, MessageRole } from '@/chat/types';
import { setOwn } from '@/lib/own-key';

const CONVERSATION_KISARA_VERSION = 1;

export const MS_PER_SECOND = 1000;

const ROOT_ID = 'root';
const SYSTEM_ID = 'system';

interface TreeNode {
  id: string;
  message: Record<string, unknown> | null;
  parent: string | null;
  children: string[];
}

function textMessage(
  id: string,
  role: MessageRole | 'system',
  content: string,
  kisara?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id,
    author: { role },
    create_time: null,
    content: { content_type: 'text', parts: [content] },
    metadata: kisara === undefined ? {} : { kisara },
  };
}

function candidateRecord(messageId: string, candidate: Candidate): Record<string, unknown> {
  return {
    message: messageId,
    end: candidate.end,
    ...(candidate.reasoning.length > 0 ? { reasoning: candidate.reasoning } : {}),
    ...(candidate.usage === undefined ? {} : { usage: candidate.usage }),
    ...(candidate.toolCalls === undefined ? {} : { toolCalls: candidate.toolCalls }),
    ...(candidate.timing === undefined ? {} : { timing: candidate.timing }),
    ...(candidate.billing === undefined ? {} : { billing: candidate.billing }),
    ...(candidate.citations === undefined ? {} : { citations: candidate.citations }),
    ...(candidate.sentEstimate === undefined ? {} : { sentEstimate: candidate.sentEstimate }),
    ...(candidate.trimmed === undefined ? {} : { trimmed: candidate.trimmed }),
    ...(candidate.images === undefined ? {} : { images: candidate.images }),
  };
}

export function toConversation(id: string, chat: Chat): Record<string, unknown> {
  const mapping: Record<string, TreeNode> = {
    [ROOT_ID]: { id: ROOT_ID, message: null, parent: null, children: [] },
  };
  let parent = ROOT_ID;
  const attach = (node: TreeNode): void => {
    setOwn(mapping, node.id, node);
    mapping[node.parent ?? ROOT_ID]?.children.push(node.id);
  };

  const systemPrompt = leadingSystemText(chat);
  if (systemPrompt.trim().length > 0) {
    attach({
      id: SYSTEM_ID,
      message: textMessage(SYSTEM_ID, 'system', systemPrompt),
      parent,
      children: [],
    });
    parent = SYSTEM_ID;
  }
  for (const message of chat.messages) {
    let next = parent;
    message.candidates.forEach((candidate, index) => {
      const nodeId = `${message.id}.${String(index)}`;
      const record = {
        ...candidateRecord(message.id, candidate),
        ...(message.instruction === undefined ? {} : { instruction: message.instruction }),
      };
      attach({
        id: nodeId,
        message: textMessage(nodeId, message.role, candidate.content, record),
        parent,
        children: [],
      });
      if (index === message.selected) next = nodeId;
    });
    parent = next;
  }

  return {
    id,
    conversation_id: id,
    title: chat.name,
    create_time: chat.createdAt / MS_PER_SECOND,
    update_time: chat.updatedAt / MS_PER_SECOND,
    mapping,
    current_node: parent,
    kisara: {
      version: CONVERSATION_KISARA_VERSION,
      prompt: chat.prompt,
      ...(chat.preset === null ? {} : { preset: chat.preset }),
      ...(chat.character === null ? {} : { character: chat.character }),
      ...(chat.persona === null ? {} : { persona: chat.persona }),
      ...(chat.summary === undefined ? {} : { summary: chat.summary }),
      ...(chat.lorebooks === undefined ? {} : { lorebooks: chat.lorebooks }),
      ...(chat.playbook === undefined ? {} : { playbook: chat.playbook }),
      ...(chat.imageId === undefined ? {} : { imageId: chat.imageId }),
    },
  };
}

export function serializeConversations(
  entries: readonly { readonly id: string; readonly chat: Chat }[],
): string {
  return `${JSON.stringify(
    entries.map((entry) => toConversation(entry.id, entry.chat)),
    null,
    2,
  )}\n`;
}
