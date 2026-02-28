import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { isWorldDelta } from '@openagentengine/signal-schema';

const app = Fastify({ logger: true });
await app.register(websocket);
const worldClients = new Set<{ send: (payload: string) => void }>();

app.get('/health', async () => ({ status: 'ok', service: 'gateway' }));

function broadcastWorldDelta(payload: string): void {
  for (const client of worldClients) {
    try {
      client.send(payload);
    } catch {
      worldClients.delete(client);
    }
  }
}

// Inhabitant-facing stream endpoint.
app.get('/ws/world', { websocket: true }, (connection) => {
  worldClients.add(connection);
  connection.send(JSON.stringify({ type: 'gateway.ready' }));
  connection.on('message', (message) => {
    app.log.info({ message: message.toString() }, 'Gateway WS message');
  });
  connection.on('close', () => {
    worldClients.delete(connection);
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
      broadcastWorldDelta(JSON.stringify(parsed));
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
