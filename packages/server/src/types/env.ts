import type { StorageService } from '../services/storage.js';

export type Env = {
  Variables: {
    storage: StorageService;
  };
};
