import type { WsHandlers } from './ws-handlers';

let wsHandlers: WsHandlers | null = null;

export function setContext(handlers: WsHandlers): void {
  wsHandlers = handlers;
}

export function getWsHandlers(): WsHandlers {
  if (!wsHandlers) throw new Error('WsHandlers not initialized');
  return wsHandlers;
}
