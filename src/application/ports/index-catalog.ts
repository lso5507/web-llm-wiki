import { IndexEntry } from '../../domain/wiki/index-entry.js';

export interface IndexCatalog {
  upsert(entry: IndexEntry): Promise<void>;
  list(): Promise<IndexEntry[]>;
}
