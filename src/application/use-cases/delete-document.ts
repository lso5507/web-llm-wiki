import type { DocumentRepository } from '../ports/document-repository.js';
import type { IndexCatalog } from '../ports/index-catalog.js';

export type DeleteDocumentInput = {
  id: string;
};

export class DeleteDocumentUseCase {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly indexCatalog: IndexCatalog,
  ) {}

  async execute(input: DeleteDocumentInput): Promise<void> {
    await this.documentRepository.delete(input.id);
    await this.indexCatalog.remove(input.id);
    await this.reconcileReferrers(input.id);
    await this.reparentOrphanedChildren(input.id);
  }

  private async reconcileReferrers(deletedSlug: string): Promise<void> {
    const remaining = await this.documentRepository.findAll();
    for (const doc of remaining) {
      if (!doc.metadata.conflictWith.includes(deletedSlug)) {
        continue;
      }
      const next = doc.metadata.conflictWith.filter((slug) => slug !== deletedSlug);
      await this.documentRepository.save(doc.withConflict(next));
    }
  }

  private async reparentOrphanedChildren(deletedSlug: string): Promise<void> {
    const remaining = await this.documentRepository.findAll();
    for (const doc of remaining) {
      if (doc.parentSlug === deletedSlug) {
        await this.documentRepository.save(doc.withParent(null));
      }
    }
  }
}
