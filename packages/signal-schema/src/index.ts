export type SignalSource = 'runtime' | 'inhabitant' | 'presence' | 'gateway';

export interface SignalEvent {
  id: string;
  source: SignalSource;
  weight: number;
  context: string;
  createdAt: string;
}

export interface WorldDelta {
  type: 'world.delta';
  worldId: string;
  tick: number;
  signal: SignalEvent;
}

export function isSignalEvent(input: unknown): input is SignalEvent {
  if (typeof input !== 'object' || input === null) return false;
  const candidate = input as Partial<SignalEvent>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.weight === 'number' &&
    typeof candidate.context === 'string' &&
    typeof candidate.createdAt === 'string'
  );
}

export function isWorldDelta(input: unknown): input is WorldDelta {
  if (typeof input !== 'object' || input === null) return false;
  const candidate = input as Partial<WorldDelta>;
  return (
    candidate.type === 'world.delta' &&
    typeof candidate.worldId === 'string' &&
    typeof candidate.tick === 'number' &&
    isSignalEvent(candidate.signal)
  );
}
