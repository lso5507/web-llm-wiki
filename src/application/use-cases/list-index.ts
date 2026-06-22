import type { IndexCatalog } from '../ports/index-catalog.js';
import { IndexEntry } from '../../domain/wiki/index-entry.js';

export class ListIndexUseCase {
  constructor(private readonly indexCatalog: IndexCatalog) {}

  async execute(): Promise<IndexEntry[]> {
    return (await this.indexCatalog.list()).sort(IndexEntry.compareByTitle);
  }
}
