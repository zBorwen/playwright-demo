import type { WsHandlers } from './ws-handlers';
import type { StorageService } from './services/storage';

let wsHandlers: WsHandlers | null = null;
let storage: StorageService | null = null;

export function setContext(handlers: WsHandlers, store: StorageService): void {
  wsHandlers = handlers;
  storage = store;
}

export function getWsHandlers(): WsHandlers {
  if (!wsHandlers) throw new Error('WsHandlers not initialized');
  return wsHandlers;
}

export function getStorage(): StorageService {
  if (!storage) throw new Error('StorageService not initialized');
  return storage;
}
