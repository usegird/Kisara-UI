import { createContext } from 'react';

import type { NodeId } from '@/graph/types';

export type AddEntrance = (nodeId: NodeId, widgetName: string) => void;

export const EntranceContext = createContext<AddEntrance | null>(null);
