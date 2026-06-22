import type { IndexCatalog } from '../../../application/ports/index-catalog.js';
import { IndexEntry } from '../../../domain/wiki/index-entry.js';

export class InMemoryIndexCatalog implements IndexCatalog {
  private readonly entries = new Map<string, IndexEntry>();

  async upsert(entry: IndexEntry): Promise<void> {
    this.entries.set(entry.title, entry);
  }

  async list(): Promise<IndexEntry[]> {
    return [...this.entries.values()].sort(IndexEntry.compareByTitle);
  }
}
