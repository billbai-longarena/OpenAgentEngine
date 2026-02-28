import type { SignalEvent } from '@openagentengine/signal-schema';

export interface Moment {
  momentId: string;
  worldId: string;
  createdAt: string;
  seedContext: string;
}

export interface Fork {
  forkId: string;
  parentWorldId: string;
  fromMomentId: string;
  createdAt: string;
}

export interface WorldState {
  worldId: string;
  createdAt: string;
  lastSignal?: SignalEvent;
}

export function createDefaultWorldState(worldId = 'world-0001'): WorldState {
  return {
    worldId,
    createdAt: new Date().toISOString()
  };
}

export type { SignalEvent };
