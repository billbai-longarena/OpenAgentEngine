import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { isWorldDelta, type WorldDelta } from '@openagentengine/signal-schema';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const app = Fastify({ logger: true });
await app.register(websocket);
type WorldClient = { send: (payload: string) => void };
const worldClientsByWorld = new Map<string, Set<WorldClient>>();
const worldDeltaLogDir = process.env.WORLD_DELTA_LOG_DIR ?? '.runtime-data/world-delta-log';
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

async function persistWorldDelta(delta: WorldDelta): Promise<void> {
  await mkdir(worldDeltaLogDir, { recursive: true });
  await appendFile(worldDeltaLogPath(delta.worldId), `${JSON.stringify(delta)}\n`, 'utf8');
}

async function loadWorldReplay(worldId: string, sinceTick: number, limit: number): Promise<WorldDelta[]> {
  const filePath = worldDeltaLogPath(worldId);
  let content = '';
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const deltas: WorldDelta[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (isWorldDelta(parsed)) {
        deltas.push(parsed);
      }
    } catch {
      // Skip malformed lines to keep replay resilient.
    }
  }

  return deltas
    .filter((delta) => delta.tick >= sinceTick)
    .sort((a, b) => a.tick - b.tick)
    .slice(0, limit);
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
  const limit = Math.max(1, Math.min(500, Number.parseInt(request.query.limit ?? '100', 10) || 100));
  const deltas = await loadWorldReplay(worldId, sinceTick, limit);
  return {
    worldId,
    sinceTick,
    count: deltas.length,
    deltas
  };
});

// Inhabitant-facing stream endpoint (world-scoped subscription).
app.get<{ Querystring: { worldId?: string } }>('/ws/world', { websocket: true }, (connection, request) => {
  const worldId = resolveWorldId(request.query.worldId);
  getWorldSubscribers(worldId).add(connection);
  connection.send(JSON.stringify({ type: 'gateway.ready', worldId }));
  connection.on('message', (message) => {
    app.log.info({ message: message.toString() }, 'Gateway WS message');
  });
  connection.on('close', () => {
    unsubscribeWorldClient(worldId, connection);
  });
});

// Runtime-facing ingress endpoint.
app.get('/ws/runtime', { websocket: true }, (connection) => {
  connection.send(JSON.stringify({ type: 'runtime.connected' }));
  connection.on('message', (message) => {
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
      app.log.info(
        { worldId: parsed.worldId, tick: parsed.tick },
        'Broadcasted runtime world delta'
      );
    } catch (error) {
      app.log.warn({ error }, 'Failed to parse runtime payload');
    }
  });
});

const port = Number(process.env.GATEWAY_PORT ?? 3001);
app.listen({ port, host: '0.0.0.0' });
