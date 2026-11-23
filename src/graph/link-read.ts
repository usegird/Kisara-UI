import { slotTypeName, type LinkId, type ResolvedLink, type WorkflowLink } from '@/graph/types';

export function readLink(link: WorkflowLink): ResolvedLink | null {
  if (Array.isArray(link)) {
    const [id, originId, originSlot, targetId, targetSlot, type] = link;
    if (typeof id !== 'number' || typeof originId !== 'number' || typeof targetId !== 'number') {
      return null;
    }
    return { id, originId, originSlot, targetId, targetSlot, type: slotTypeName(type) };
  }

  if (typeof link.id !== 'number') return null;
  return {
    id: link.id,
    originId: link.origin_id,
    originSlot: link.origin_slot,
    targetId: link.target_id,
    targetSlot: link.target_slot,
    type: slotTypeName(link.type),
  };
}

export function linkIndex(links: readonly WorkflowLink[]): Map<LinkId, ResolvedLink> {
  const index = new Map<LinkId, ResolvedLink>();
  for (const link of links) {
    const resolved = readLink(link);
    if (resolved) index.set(resolved.id, resolved);
  }
  return index;
}
