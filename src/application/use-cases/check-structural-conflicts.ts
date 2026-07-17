import type { DocumentRepository } from '../ports/document-repository.js';
import { Title } from '../../domain/wiki/title.js';

export type StructuralConflictPreview = {
  id: string;
  title: string;
  content: string;
  reasons: Array<'duplicate-title' | 'shared-tags'>;
};

export class CheckStructuralConflictsUseCase {
  constructor(private readonly documentRepository: DocumentRepository) {}

  async execute(input: { title: string; tags?: readonly string[] }): Promise<StructuralConflictPreview[]> {
    const title = Title.create(input.title);
    const slug = title.toSlug();
    const targetTags = new Set(input.tags ?? []);
    const documents = await this.documentRepository.findAll();

    return documents.flatMap((document) => {
      const reasons: StructuralConflictPreview['reasons'] = [];
      if (
        document.title.toSlug() === slug ||
        document.title.value.toLocaleLowerCase() === title.value.toLocaleLowerCase()
      ) {
        reasons.push('duplicate-title');
      }
      const sharedTags = new Set(document.metadata.tags.filter((tag) => targetTags.has(tag)));
      if (sharedTags.size >= 5) reasons.push('shared-tags');
      return reasons.length === 0 ? [] : [{
        id: document.title.toSlug(),
        title: document.title.value,
        content: document.content,
        reasons,
      }];
    });
  }
}
