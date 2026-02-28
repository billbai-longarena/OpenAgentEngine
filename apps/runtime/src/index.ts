import { createDefaultWorldState, type SignalEvent } from '@openagentengine/world-model';
import type { WorldDelta } from '@openagentengine/signal-schema';
import WebSocket from 'ws';

const world = createDefaultWorldState();
let tick = 0;
const gatewayRuntimeWsUrl = process.env.GATEWAY_RUNTIME_WS_URL ?? 'ws://127.0.0.1:3001/ws/runtime';
let runtimeSocket: WebSocket | null = null;

function emitRuntimeTick(): SignalEvent {
  tick += 1;
  return {
    id: `tick-${tick}`,
    source: 'runtime',
    weight: 5,
    context: 'runtime.loop',
    createdAt: new Date().toISOString()
  };
}

function connectRuntimeSocket(): void {
  runtimeSocket = new WebSocket(gatewayRuntimeWsUrl);
  runtimeSocket.on('open', () => {
    console.log('[runtime] connected to gateway runtime ws');
  });
  runtimeSocket.on('message', (message) => {
    console.log('[runtime] gateway message', message.toString());
  });
  runtimeSocket.on('close', () => {
    console.log('[runtime] gateway runtime ws closed, retrying');
    setTimeout(connectRuntimeSocket, 1000);
  });
  runtimeSocket.on('error', (error) => {
    console.error('[runtime] gateway runtime ws error', error);
  });
}

connectRuntimeSocket();

setInterval(() => {
  const signal = emitRuntimeTick();
  const delta: WorldDelta = {
    type: 'world.delta',
    worldId: world.worldId,
    tick,
    signal
  };
  if (runtimeSocket?.readyState === WebSocket.OPEN) {
    runtimeSocket.send(JSON.stringify(delta));
  }
  console.log('[runtime]', world.worldId, signal.id, signal.context);
}, 1000);
