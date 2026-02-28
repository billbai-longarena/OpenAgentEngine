import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isWorldDelta, type WorldDelta } from '@openagentengine/signal-schema';

const app = Fastify({ logger: true });
await app.register(websocket);
type WorldClient = { send: (payload: string) => void };

interface WorldMoment {
  momentId: string;
  worldId: string;
  tick: number;
  createdAt: string;
  seedContext: string;
  sourceSignalId: string;
  sourceContext: string;
}

interface WorldForkLineage {
  worldId: string;
  parentWorldId: string;
  fromMomentId: string;
  fromTick: number;
  createdAt: string;
  seedContext: string;
  inheritedDeltas: number;
}

const worldClientsByWorld = new Map<string, Set<WorldClient>>();
const worldDeltaLogDir = process.env.WORLD_DELTA_LOG_DIR ?? '.runtime-data/world-delta-log';
const worldMetadataDir = process.env.WORLD_METADATA_DIR ?? '.runtime-data/world-metadata';
const defaultWorldId = process.env.DEFAULT_WORLD_ID ?? 'world-0001';

app.get('/health', async () => ({ status: 'ok', service: 'gateway' }));

function resolveWorldId(input: unknown): string {
  if (typeof input === 'string' && input.trim().length > 0) {
    return input.trim();
  }
  return defaultWorldId;
}

function getWorldSubscribers(worldId: string): Set<WorldClient> {
  let bucket = worldClientsByWorld.get(worldId);
  if (!bucket) {
    bucket = new Set<WorldClient>();
    worldClientsByWorld.set(worldId, bucket);
  }
  return bucket;
}

function unsubscribeWorldClient(worldId: string, client: WorldClient): void {
  const bucket = worldClientsByWorld.get(worldId);
  if (!bucket) return;
  bucket.delete(client);
  if (bucket.size === 0) {
    worldClientsByWorld.delete(worldId);
  }
}

function worldDeltaLogPath(worldId: string): string {
  return join(worldDeltaLogDir, `${worldId}.jsonl`);
}

function worldMomentLogPath(worldId: string): string {
  return join(worldMetadataDir, 'moments', `${worldId}.jsonl`);
}

function worldLineagePath(worldId: string): string {
  return join(worldMetadataDir, 'lineage', `${worldId}.json`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function clampLimit(input: number): number {
  return Math.max(1, Math.min(5000, input));
}

function parseTickInput(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return Math.max(0, Math.floor(input));
  }
  if (typeof input === 'string') {
    const parsed = Number.parseInt(input, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return null;
}

function parseOptionalText(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isWorldMoment(input: unknown): input is WorldMoment {
  if (typeof input !== 'object' || input === null) return false;
  const candidate = input as Partial<WorldMoment>;
  return (
    typeof candidate.momentId === 'string' &&
    typeof candidate.worldId === 'string' &&
    typeof candidate.tick === 'number' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.seedContext === 'string' &&
    typeof candidate.sourceSignalId === 'string' &&
    typeof candidate.sourceContext === 'string'
  );
}

function isWorldForkLineage(input: unknown): input is WorldForkLineage {
  if (typeof input !== 'object' || input === null) return false;
  const candidate = input as Partial<WorldForkLineage>;
  return (
    typeof candidate.worldId === 'string' &&
    typeof candidate.parentWorldId === 'string' &&
    typeof candidate.fromMomentId === 'string' &&
    typeof candidate.fromTick === 'number' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.seedContext === 'string' &&
    typeof candidate.inheritedDeltas === 'number'
  );
}

async function persistWorldDelta(delta: WorldDelta): Promise<void> {
  await mkdir(worldDeltaLogDir, { recursive: true });
  await appendFile(worldDeltaLogPath(delta.worldId), `${JSON.stringify(delta)}\n`, 'utf8');
}

async function loadJsonLines(filePath: string): Promise<unknown[]> {
  let content = '';
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    return [];
  }

  const parsed: unknown[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // Skip malformed lines to keep replay resilient.
    }
  }
  return parsed;
}

async function loadWorldDeltas(worldId: string): Promise<WorldDelta[]> {
  const rows = await loadJsonLines(worldDeltaLogPath(worldId));
  const deltas: WorldDelta[] = [];
  for (const row of rows) {
    if (isWorldDelta(row)) {
      deltas.push(row);
    }
  }
  return deltas.sort((a, b) => a.tick - b.tick);
}

async function loadWorldMoments(worldId: string): Promise<WorldMoment[]> {
  const rows = await loadJsonLines(worldMomentLogPath(worldId));
  const moments: WorldMoment[] = [];
  for (const row of rows) {
    if (isWorldMoment(row)) {
      moments.push(row);
    }
  }
  return moments.sort((a, b) => a.tick - b.tick);
}

async function persistWorldMoment(moment: WorldMoment): Promise<void> {
  await mkdir(join(worldMetadataDir, 'moments'), { recursive: true });
  await appendFile(worldMomentLogPath(moment.worldId), `${JSON.stringify(moment)}\n`, 'utf8');
}

async function loadWorldLineage(worldId: string): Promise<WorldForkLineage | null> {
  let content = '';
  try {
    content = await readFile(worldLineagePath(worldId), 'utf8');
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(content);
    return isWorldForkLineage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function persistWorldLineage(lineage: WorldForkLineage): Promise<void> {
  await mkdir(join(worldMetadataDir, 'lineage'), { recursive: true });
  await writeFile(worldLineagePath(lineage.worldId), `${JSON.stringify(lineage, null, 2)}\n`, 'utf8');
}

function mapDeltasToForkWorld(sourceDeltas: WorldDelta[], forkWorldId: string): WorldDelta[] {
  const sorted = [...sourceDeltas].sort((a, b) => a.tick - b.tick);
  return sorted.map((delta, index) => ({
    ...delta,
    worldId: forkWorldId,
    tick: index + 1
  }));
}

async function loadWorldReplay(worldId: string, sinceTick: number, limit: number): Promise<WorldDelta[]> {
  const boundedLimit = clampLimit(limit);
  const ownDeltas = await loadWorldDeltas(worldId);
  if (ownDeltas.length > 0) {
    return ownDeltas.filter((delta) => delta.tick >= sinceTick).slice(0, boundedLimit);
  }

  const lineage = await loadWorldLineage(worldId);
  if (!lineage) return [];

  const parentDeltas = await loadWorldDeltas(lineage.parentWorldId);
  if (parentDeltas.length === 0) return [];

  const inherited = parentDeltas.filter((delta) => delta.tick >= lineage.fromTick);
  const mapped = mapDeltasToForkWorld(inherited, worldId);
  return mapped.filter((delta) => delta.tick >= sinceTick).slice(0, boundedLimit);
}

async function createMomentFromReplay(
  worldId: string,
  targetTick: number | null,
  seedContext: string | null
): Promise<WorldMoment | null> {
  const replay = await loadWorldReplay(worldId, 0, 5000);
  if (replay.length === 0) return null;

  const chosenDelta =
    targetTick === null ? replay[replay.length - 1] : replay.find((delta) => delta.tick === targetTick);
  if (!chosenDelta) return null;

  const moment: WorldMoment = {
    momentId: `moment-${randomUUID()}`,
    worldId,
    tick: chosenDelta.tick,
    createdAt: new Date().toISOString(),
    seedContext: seedContext ?? chosenDelta.signal.context,
    sourceSignalId: chosenDelta.signal.id,
    sourceContext: chosenDelta.signal.context
  };
  await persistWorldMoment(moment);
  return moment;
}

async function seedForkWorldFromMoment(
  parentWorldId: string,
  forkWorldId: string,
  fromTick: number
): Promise<number> {
  const parentDeltas = await loadWorldDeltas(parentWorldId);
  const inherited = parentDeltas.filter((delta) => delta.tick >= fromTick);
  const seeded = mapDeltasToForkWorld(inherited, forkWorldId);

  await mkdir(worldDeltaLogDir, { recursive: true });
  if (seeded.length === 0) {
    await writeFile(worldDeltaLogPath(forkWorldId), '', 'utf8');
    return 0;
  }

  const payload = `${seeded.map((delta) => JSON.stringify(delta)).join('\n')}\n`;
  await writeFile(worldDeltaLogPath(forkWorldId), payload, 'utf8');
  return seeded.length;
}

function broadcastWorldDelta(delta: WorldDelta): void {
  const payload = JSON.stringify(delta);
  const subscribers = worldClientsByWorld.get(delta.worldId);
  if (!subscribers) return;
  for (const client of subscribers) {
    try {
      client.send(payload);
    } catch {
      unsubscribeWorldClient(delta.worldId, client);
    }
  }
}

app.get<{
  Params: { worldId: string };
  Querystring: { sinceTick?: string; limit?: string };
}>('/world/:worldId/replay', async (request) => {
  const worldId = request.params.worldId;
  const sinceTick = Math.max(0, Number.parseInt(request.query.sinceTick ?? '0', 10) || 0);
  const limit = clampLimit(Number.parseInt(request.query.limit ?? '100', 10) || 100);
  const deltas = await loadWorldReplay(worldId, sinceTick, limit);
  return {
    worldId,
    sinceTick,
    count: deltas.length,
    deltas
  };
});

app.get<{
  Params: { worldId: string };
  Querystring: { sinceTick?: string; limit?: string };
}>('/world/:worldId/moments', async (request) => {
  const worldId = request.params.worldId;
  const sinceTick = Math.max(0, Number.parseInt(request.query.sinceTick ?? '0', 10) || 0);
  const limit = clampLimit(Number.parseInt(request.query.limit ?? '100', 10) || 100);
  const moments = await loadWorldMoments(worldId);
  const filtered = moments.filter((moment) => moment.tick >= sinceTick).slice(0, limit);
  return {
    worldId,
    sinceTick,
    count: filtered.length,
    moments: filtered
  };
});

app.post<{
  Params: { worldId: string };
  Body: { tick?: number | string; seedContext?: string };
}>('/world/:worldId/moments', async (request, reply) => {
  const worldId = request.params.worldId;
  const targetTick = parseTickInput(request.body?.tick);
  const seedContext = parseOptionalText(request.body?.seedContext);
  const moment = await createMomentFromReplay(worldId, targetTick, seedContext);
  if (!moment) {
    return reply.code(404).send({
      error: 'moment_unavailable',
      message: `No replay data available for world ${worldId} at tick ${targetTick ?? 'latest'}`
    });
  }
  return reply.code(201).send(moment);
});

app.post<{
  Params: { worldId: string };
  Body: { momentId?: string; forkWorldId?: string; seedContext?: string };
}>('/world/:worldId/forks', async (request, reply) => {
  const parentWorldId = request.params.worldId;
  const momentId = parseOptionalText(request.body?.momentId);
  if (!momentId) {
    return reply.code(400).send({
      error: 'invalid_request',
      message: 'momentId is required to fork a world'
    });
  }

  const moments = await loadWorldMoments(parentWorldId);
  const moment = moments.find((candidate) => candidate.momentId === momentId);
  if (!moment) {
    return reply.code(404).send({
      error: 'moment_not_found',
      message: `Moment ${momentId} does not exist in world ${parentWorldId}`
    });
  }

  const forkWorldId =
    parseOptionalText(request.body?.forkWorldId) ?? `${parentWorldId}-fork-${Date.now().toString(36)}`;
  if (forkWorldId === parentWorldId) {
    return reply.code(400).send({
      error: 'invalid_request',
      message: 'forkWorldId must be different from parent world id'
    });
  }

  if ((await fileExists(worldDeltaLogPath(forkWorldId))) || (await fileExists(worldLineagePath(forkWorldId)))) {
    return reply.code(409).send({
      error: 'fork_exists',
      message: `World ${forkWorldId} already exists`
    });
  }

  const inheritedDeltas = await seedForkWorldFromMoment(parentWorldId, forkWorldId, moment.tick);
  const lineage: WorldForkLineage = {
    worldId: forkWorldId,
    parentWorldId,
    fromMomentId: moment.momentId,
    fromTick: moment.tick,
    createdAt: new Date().toISOString(),
    seedContext: parseOptionalText(request.body?.seedContext) ?? moment.seedContext,
    inheritedDeltas
  };
  await persistWorldLineage(lineage);

  return reply.code(201).send({
    forkWorldId,
    parentWorldId,
    fromMomentId: moment.momentId,
    fromTick: moment.tick,
    inheritedDeltas
  });
});

app.get<{
  Params: { worldId: string };
}>('/world/:worldId/lineage', async (request) => {
  const worldId = request.params.worldId;
  const lineage = await loadWorldLineage(worldId);
  return {
    worldId,
    lineage
  };
});

// Inhabitant-facing stream endpoint (world-scoped subscription).
app.get<{ Querystring: { worldId?: string } }>('/ws/world', { websocket: true }, (connection, request) => {
  const worldId = resolveWorldId(request.query.worldId);
  getWorldSubscribers(worldId).add(connection);
  connection.send(JSON.stringify({ type: 'gateway.ready', worldId }));
  connection.on('message', (message: Buffer) => {
    app.log.info({ message: message.toString() }, 'Gateway WS message');
  });
  connection.on('close', () => {
    unsubscribeWorldClient(worldId, connection);
  });
});

// Runtime-facing ingress endpoint.
app.get('/ws/runtime', { websocket: true }, (connection) => {
  connection.send(JSON.stringify({ type: 'runtime.connected' }));
  connection.on('message', (message: Buffer) => {
    try {
      const parsed = JSON.parse(message.toString());
      if (!isWorldDelta(parsed)) {
        app.log.warn({ payload: parsed }, 'Rejected non-world-delta payload');
        return;
      }
      void persistWorldDelta(parsed).catch((error) => {
        app.log.error({ error, worldId: parsed.worldId, tick: parsed.tick }, 'Failed to persist world delta');
      });
      broadcastWorldDelta(parsed);
      app.log.info({ worldId: parsed.worldId, tick: parsed.tick }, 'Broadcasted runtime world delta');
    } catch (error) {
      app.log.warn({ error }, 'Failed to parse runtime payload');
    }
  });
});

const port = Number(process.env.GATEWAY_PORT ?? 3001);
app.listen({ port, host: '0.0.0.0' });
