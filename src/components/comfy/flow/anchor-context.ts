import { createContext } from 'react';

import type { NodeId } from '@/graph/types';
import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';

export const AnchorContext = createContext<AnchorRegistry | null>(null);

export const PANEL_ANCHOR_KEY = 'panel';

export const VIEWPORT_ANCHOR_KEY = 'viewport';

export const FLOW_VIEWPORT_ANCHOR_KEY = 'flowviewport';

export const APP_VIEWPORT_ANCHOR_KEY = 'appviewport';

export function appCardAnchorKey(groupKey: string): string {
  return `appcard:${groupKey}`;
}

export function appSourceAnchorKey(nodeId: NodeId, widgetName: string): string {
  return `appsrc:${nodeId}:${widgetName}`;
}

export function appTargetAnchorKey(nodeId: NodeId, widgetName: string): string {
  return `appdst:${nodeId}:${widgetName}`;
}

export function appGridAnchorKey(groupKey: string): string {
  return `appgrid:${groupKey}`;
}

export function cardAnchorKey(nodeId: NodeId): string {
  return `card:${nodeId}`;
}

export function groupAnchorKey(groupKey: string): string {
  return `group:${groupKey}`;
}

export function bodyAnchorKey(nodeId: NodeId): string {
  return `body:${nodeId}`;
}

export function outputAnchorKey(nodeId: NodeId): string {
  return `out:${nodeId}`;
}

export function outputChipAnchorKey(nodeId: NodeId, slot: number): string {
  return `outchip:${nodeId}:${slot}`;
}

export function inputAnchorKey(nodeId: NodeId, inputName: string): string {
  return `in:${nodeId}:${inputName}`;
}

export function variableAnchorKey(variableKey: string): string {
  return `var:${variableKey}`;
}
