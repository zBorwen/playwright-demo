import type { StorageService } from '../services/storage';

export type Env = {
  Variables: {
    storage: StorageService;
  };
};
