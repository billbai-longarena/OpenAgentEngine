import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import { access, appendFile, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';
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

interface WorldInvite {
  inviteId: string;
  parentWorldId: string;
  momentId: string;
  createdAt: string;
  expiresAt: string | null;
  maxRedemptions: number;
  redemptionCount: number;
  forkOnRedeem: boolean;
  seedContext: string;
  lastRedeemedAt: string | null;
}

interface InviteStore {
  readonly kind: string;
  load(inviteId: string): Promise<WorldInvite | null>;
  persist(invite: WorldInvite): Promise<void>;
  withRedeemLock?<T>(inviteId: string, action: () => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

const worldClientsByWorld = new Map<string, Set<WorldClient>>();
const inviteRedeemLocks = new Map<string, Promise<void>>();
const worldDeltaLogDir = process.env.WORLD_DELTA_LOG_DIR ?? '.runtime-data/world-delta-log';
const worldMetadataDir = process.env.WORLD_METADATA_DIR ?? '.runtime-data/world-metadata';
const defaultWorldId = process.env.DEFAULT_WORLD_ID ?? 'world-0001';
const inviteStoreDriver = (process.env.WORLD_INVITE_STORE_DRIVER ?? 'file').trim().toLowerCase();
const inviteStoreDir = process.env.WORLD_INVITE_STORE_DIR ?? join(worldMetadataDir, 'invites');
const inviteStorePostgresUrl = process.env.WORLD_INVITE_STORE_POSTGRES_URL ?? process.env.DATABASE_URL ?? '';
const inviteStorePostgresPoolMax = parsePositiveInt(process.env.WORLD_INVITE_STORE_POSTGRES_POOL_MAX, 10, 200);
const inviteStoreAdvisoryNamespace = 22022;
const inviteRedeemLockDir = process.env.WORLD_INVITE_LOCK_DIR ?? join(inviteStoreDir, 'locks');
const inviteRedeemLockTimeoutMs = parsePositiveInt(process.env.WORLD_INVITE_LOCK_TIMEOUT_MS, 5000, 60000);
const inviteRedeemLockStaleMs = parsePositiveInt(process.env.WORLD_INVITE_LOCK_STALE_MS, 30000, 300000);
const inviteRedeemRaceDelayMs = parsePositiveInt(process.env.WORLD_INVITE_REDEEM_RACE_DELAY_MS, 0, 30000);

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

function worldInvitePath(inviteId: string): string {
  return join(inviteStoreDir, `${inviteId}.json`);
}

function inviteRedeemLockPath(inviteId: string): string {
  return join(inviteRedeemLockDir, `${inviteId}.lock`);
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

function parsePositiveInt(input: unknown, fallback: number, max = 100000): number {
  const parsed = parseTickInput(input);
  if (parsed === null || parsed <= 0) return fallback;
  return Math.min(parsed, max);
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

function isWorldInvite(input: unknown): input is WorldInvite {
  if (typeof input !== 'object' || input === null) return false;
  const candidate = input as Partial<WorldInvite>;
  return (
    typeof candidate.inviteId === 'string' &&
    typeof candidate.parentWorldId === 'string' &&
    typeof candidate.momentId === 'string' &&
    typeof candidate.createdAt === 'string' &&
    (typeof candidate.expiresAt === 'string' || candidate.expiresAt === null) &&
    typeof candidate.maxRedemptions === 'number' &&
    typeof candidate.redemptionCount === 'number' &&
    typeof candidate.forkOnRedeem === 'boolean' &&
    typeof candidate.seedContext === 'string' &&
    (typeof candidate.lastRedeemedAt === 'string' || candidate.lastRedeemedAt === null)
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

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const parentDir = dirname(filePath);
  await mkdir(parentDir, { recursive: true });
  const tempPath = join(parentDir, `${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, content, 'utf8');
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

function createInviteStore(): InviteStore {
  if (inviteStoreDriver === 'file' || inviteStoreDriver === 'filesystem') {
    return {
      kind: 'file',
      async load(inviteId: string): Promise<WorldInvite | null> {
        let content = '';
        try {
          content = await readFile(worldInvitePath(inviteId), 'utf8');
        } catch {
          return null;
        }

        try {
          const parsed = JSON.parse(content);
          return isWorldInvite(parsed) ? parsed : null;
        } catch {
          return null;
        }
      },
      async persist(invite: WorldInvite): Promise<void> {
        await writeFileAtomic(worldInvitePath(invite.inviteId), `${JSON.stringify(invite, null, 2)}\n`);
      }
    };
  }

  if (inviteStoreDriver === 'postgres') {
    if (!inviteStorePostgresUrl) {
      throw new Error(
        'WORLD_INVITE_STORE_DRIVER=postgres requires WORLD_INVITE_STORE_POSTGRES_URL or DATABASE_URL.'
      );
    }

    const pool = new Pool({
      connectionString: inviteStorePostgresUrl,
      max: inviteStorePostgresPoolMax
    });

    let ready: Promise<void> | null = null;
    const ensureReady = async (): Promise<void> => {
      if (!ready) {
        ready = pool
          .query(`
            CREATE TABLE IF NOT EXISTS world_invites (
              invite_id TEXT PRIMARY KEY,
              payload JSONB NOT NULL,
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
          `)
          .then(() => undefined)
          .catch((error: unknown) => {
            ready = null;
            throw error;
          });
      }
      await ready;
    };

    const parseStoredInvite = (stored: unknown): WorldInvite | null => {
      if (isWorldInvite(stored)) return stored;
      if (typeof stored === 'string') {
        try {
          const parsed = JSON.parse(stored);
          return isWorldInvite(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
      return null;
    };

    return {
      kind: 'postgres',
      async load(inviteId: string): Promise<WorldInvite | null> {
        await ensureReady();
        const result = await pool.query<{ payload: unknown }>(
          'SELECT payload FROM world_invites WHERE invite_id = $1',
          [inviteId]
        );
        if (result.rowCount === 0) return null;
        return parseStoredInvite(result.rows[0]?.payload ?? null);
      },
      async persist(invite: WorldInvite): Promise<void> {
        await ensureReady();
        await pool.query(
          `
            INSERT INTO world_invites (invite_id, payload, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (invite_id)
            DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
          `,
          [invite.inviteId, JSON.stringify(invite)]
        );
      },
      async withRedeemLock<T>(inviteId: string, action: () => Promise<T>): Promise<T> {
        await ensureReady();
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SET LOCAL lock_timeout = '${inviteRedeemLockTimeoutMs}ms'`);
          await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2));', [
            inviteStoreAdvisoryNamespace,
            inviteId
          ]);
          const result = await action();
          await client.query('COMMIT');
          return result;
        } catch (error) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // ignore rollback failures
          }
          throw error;
        } finally {
          client.release();
        }
      },
      async close(): Promise<void> {
        await pool.end();
      }
    };
  }

  throw new Error(
    `Unsupported WORLD_INVITE_STORE_DRIVER=${inviteStoreDriver}. Supported drivers: file, filesystem, postgres.`
  );
}

const inviteStore = createInviteStore();
app.log.info({ inviteStoreDriver: inviteStore.kind }, 'Invite store driver configured');
app.addHook('onClose', async () => {
  if (inviteStore.close) {
    await inviteStore.close();
  }
});

async function loadWorldInvite(inviteId: string): Promise<WorldInvite | null> {
  return inviteStore.load(inviteId);
}

async function persistWorldInvite(invite: WorldInvite): Promise<void> {
  await inviteStore.persist(invite);
}

function isInviteExpired(invite: WorldInvite, nowEpochMs: number): boolean {
  if (!invite.expiresAt) return false;
  const expiresAtMs = Date.parse(invite.expiresAt);
  return Number.isFinite(expiresAtMs) ? nowEpochMs > expiresAtMs : false;
}

function remainingInviteRedemptions(invite: WorldInvite): number {
  return Math.max(0, invite.maxRedemptions - invite.redemptionCount);
}

class InviteRedeemLockTimeoutError extends Error {
  readonly inviteId: string;

  constructor(inviteId: string) {
    super(`Timed out waiting for invite lock: ${inviteId}`);
    this.name = 'InviteRedeemLockTimeoutError';
    this.inviteId = inviteId;
  }
}

function isPostgresLockTimeoutError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === '55P03';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withDistributedInviteRedeemLock<T>(inviteId: string, action: () => Promise<T>): Promise<T> {
  await mkdir(inviteRedeemLockDir, { recursive: true });
  const lockPath = inviteRedeemLockPath(inviteId);
  const deadline = Date.now() + inviteRedeemLockTimeoutMs;

  while (true) {
    try {
      const lockHandle = await open(lockPath, 'wx');
      try {
        const lockPayload = {
          inviteId,
          pid: process.pid,
          acquiredAt: new Date().toISOString()
        };
        await lockHandle.writeFile(`${JSON.stringify(lockPayload)}\n`, 'utf8');
      } finally {
        await lockHandle.close();
      }
      break;
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError.code !== 'EEXIST') {
        throw error;
      }

      try {
        const lockStats = await stat(lockPath);
        if (Date.now() - lockStats.mtimeMs > inviteRedeemLockStaleMs) {
          await rm(lockPath, { force: true });
          continue;
        }
      } catch {
        // Lock may have been released between checks.
      }

      if (Date.now() > deadline) {
        throw new InviteRedeemLockTimeoutError(inviteId);
      }
      await delay(25);
    }
  }

  try {
    return await action();
  } finally {
    await rm(lockPath, { force: true });
  }
}

async function withInviteRedeemLock<T>(inviteId: string, action: () => Promise<T>): Promise<T> {
  const previous = inviteRedeemLocks.get(inviteId) ?? Promise.resolve();
  let releaseCurrent: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const tail = previous.then(() => current);
  inviteRedeemLocks.set(inviteId, tail);
  await previous;

  try {
    if (inviteStore.withRedeemLock) {
      return await inviteStore.withRedeemLock(inviteId, action);
    }
    return await withDistributedInviteRedeemLock(inviteId, action);
  } catch (error) {
    if (isPostgresLockTimeoutError(error)) {
      throw new InviteRedeemLockTimeoutError(inviteId);
    }
    throw error;
  } finally {
    releaseCurrent();
    if (inviteRedeemLocks.get(inviteId) === tail) {
      inviteRedeemLocks.delete(inviteId);
    }
  }
}

async function listForkLineagesByParent(parentWorldId: string): Promise<WorldForkLineage[]> {
  const lineageDir = join(worldMetadataDir, 'lineage');
  let files: string[] = [];
  try {
    files = await readdir(lineageDir);
  } catch {
    return [];
  }

  const forkLineages: WorldForkLineage[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const worldId = file.slice(0, -'.json'.length);
    const lineage = await loadWorldLineage(worldId);
    if (!lineage) continue;
    if (lineage.parentWorldId === parentWorldId) {
      forkLineages.push(lineage);
    }
  }
  return forkLineages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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

app.get<{
  Params: { worldId: string };
}>('/world/:worldId/forks', async (request) => {
  const parentWorldId = request.params.worldId;
  const forks = await listForkLineagesByParent(parentWorldId);
  return {
    parentWorldId,
    count: forks.length,
    forks
  };
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

app.post<{
  Params: { worldId: string };
  Body: {
    momentId?: string;
    ttlMinutes?: number | string;
    maxRedemptions?: number | string;
    forkOnRedeem?: boolean;
    seedContext?: string;
  };
}>('/world/:worldId/invites', async (request, reply) => {
  const parentWorldId = request.params.worldId;
  const bodySeedContext = parseOptionalText(request.body?.seedContext);
  const requestedMomentId = parseOptionalText(request.body?.momentId);

  let moment: WorldMoment | null = null;
  const moments = await loadWorldMoments(parentWorldId);
  if (requestedMomentId) {
    moment = moments.find((candidate) => candidate.momentId === requestedMomentId) ?? null;
    if (!moment) {
      return reply.code(404).send({
        error: 'moment_not_found',
        message: `Moment ${requestedMomentId} does not exist in world ${parentWorldId}`
      });
    }
  } else {
    moment = moments[moments.length - 1] ?? null;
    if (!moment) {
      moment = await createMomentFromReplay(parentWorldId, null, bodySeedContext);
    }
    if (!moment) {
      return reply.code(404).send({
        error: 'moment_unavailable',
        message: `No replay data available for world ${parentWorldId} to seed invite`
      });
    }
  }

  const ttlMinutes = parsePositiveInt(request.body?.ttlMinutes, 0, 60 * 24 * 30);
  const maxRedemptions = parsePositiveInt(request.body?.maxRedemptions, 1, 1000);
  const now = new Date();
  const expiresAt = ttlMinutes > 0 ? new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString() : null;
  const forkOnRedeem = request.body?.forkOnRedeem !== false;
  const inviteId = `invite-${randomUUID()}`;

  const invite: WorldInvite = {
    inviteId,
    parentWorldId,
    momentId: moment.momentId,
    createdAt: now.toISOString(),
    expiresAt,
    maxRedemptions,
    redemptionCount: 0,
    forkOnRedeem,
    seedContext: bodySeedContext ?? moment.seedContext,
    lastRedeemedAt: null
  };
  await persistWorldInvite(invite);

  return reply.code(201).send({
    ...invite,
    redeemPath: `/invite/${invite.inviteId}/redeem`
  });
});

app.get<{
  Params: { inviteId: string };
}>('/invite/:inviteId', async (request, reply) => {
  const invite = await loadWorldInvite(request.params.inviteId);
  if (!invite) {
    return reply.code(404).send({
      error: 'invite_not_found',
      message: `Invite ${request.params.inviteId} was not found`
    });
  }

  const nowEpochMs = Date.now();
  const expired = isInviteExpired(invite, nowEpochMs);
  const remainingRedemptions = remainingInviteRedemptions(invite);
  return {
    invite,
    expired,
    remainingRedemptions,
    canRedeem: !expired && remainingRedemptions > 0
  };
});

app.post<{
  Params: { inviteId: string };
  Body: { forkWorldId?: string };
}>('/invite/:inviteId/redeem', async (request, reply) => {
  try {
    return await withInviteRedeemLock(request.params.inviteId, async () => {
      const invite = await loadWorldInvite(request.params.inviteId);
      if (!invite) {
        return reply.code(404).send({
          error: 'invite_not_found',
          message: `Invite ${request.params.inviteId} was not found`
        });
      }

      if (inviteRedeemRaceDelayMs > 0) {
        await delay(inviteRedeemRaceDelayMs);
      }

      const now = Date.now();
      if (isInviteExpired(invite, now)) {
        return reply.code(410).send({
          error: 'invite_expired',
          message: `Invite ${invite.inviteId} expired at ${invite.expiresAt}`
        });
      }

      if (remainingInviteRedemptions(invite) <= 0) {
        return reply.code(409).send({
          error: 'invite_exhausted',
          message: `Invite ${invite.inviteId} has no remaining redemptions`
        });
      }

      const moments = await loadWorldMoments(invite.parentWorldId);
      const moment = moments.find((candidate) => candidate.momentId === invite.momentId);
      if (!moment) {
        return reply.code(409).send({
          error: 'invite_invalid',
          message: `Invite ${invite.inviteId} references missing moment ${invite.momentId}`
        });
      }

      let worldId = invite.parentWorldId;
      let inheritedDeltas = 0;
      let forked = false;
      if (invite.forkOnRedeem) {
        const forkWorldId =
          parseOptionalText(request.body?.forkWorldId) ?? `${invite.parentWorldId}-invite-${Date.now().toString(36)}`;
        if (forkWorldId === invite.parentWorldId) {
          return reply.code(400).send({
            error: 'invalid_request',
            message: 'forkWorldId must be different from parent world id'
          });
        }

        if (
          (await fileExists(worldDeltaLogPath(forkWorldId))) ||
          (await fileExists(worldLineagePath(forkWorldId)))
        ) {
          return reply.code(409).send({
            error: 'fork_exists',
            message: `World ${forkWorldId} already exists`
          });
        }

        inheritedDeltas = await seedForkWorldFromMoment(invite.parentWorldId, forkWorldId, moment.tick);
        const lineage: WorldForkLineage = {
          worldId: forkWorldId,
          parentWorldId: invite.parentWorldId,
          fromMomentId: moment.momentId,
          fromTick: moment.tick,
          createdAt: new Date(now).toISOString(),
          seedContext: invite.seedContext,
          inheritedDeltas
        };
        await persistWorldLineage(lineage);
        worldId = forkWorldId;
        forked = true;
      }

      const updatedInvite: WorldInvite = {
        ...invite,
        redemptionCount: invite.redemptionCount + 1,
        lastRedeemedAt: new Date(now).toISOString()
      };
      await persistWorldInvite(updatedInvite);

      return reply.code(201).send({
        inviteId: updatedInvite.inviteId,
        parentWorldId: updatedInvite.parentWorldId,
        momentId: updatedInvite.momentId,
        worldId,
        forked,
        inheritedDeltas,
        redemptionCount: updatedInvite.redemptionCount,
        remainingRedemptions: remainingInviteRedemptions(updatedInvite),
        expiresAt: updatedInvite.expiresAt
      });
    });
  } catch (error) {
    if (error instanceof InviteRedeemLockTimeoutError) {
      return reply.code(503).send({
        error: 'invite_busy',
        message: `Invite ${error.inviteId} is currently being redeemed; retry shortly`
      });
    }
    throw error;
  }
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
