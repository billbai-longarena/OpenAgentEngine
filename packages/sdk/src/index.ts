import type { SignalEvent } from '@openagentengine/signal-schema';

export interface GatewayClient {
  sendSignal(event: SignalEvent): void;
}

export function createGatewayClient(send: (payload: string) => void): GatewayClient {
  return {
    sendSignal(event) {
      send(JSON.stringify(event));
    }
  };
}
