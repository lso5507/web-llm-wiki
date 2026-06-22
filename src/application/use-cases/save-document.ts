import type { SaveDocumentInput } from '../dto/save-document.input.js';
import { ContentRequiredForSummaryGenerationError } from '../errors/content-required-for-summary-generation-error.js';
import type { DocumentRepository } from '../ports/document-repository.js';
import type { DocumentSummaryGenerator } from '../ports/document-summary-generator.js';
import type { IndexCatalog } from '../ports/index-catalog.js';
import { Frontmatter } from '../../domain/wiki/frontmatter.js';
import { IndexEntry } from '../../domain/wiki/index-entry.js';
import { Title } from '../../domain/wiki/title.js';
import { WikiDocument } from '../../domain/wiki/document.js';

export type SaveDocumentResult = {
  document: WikiDocument;
  summary: string;
  status: 'completed';
};

export class SaveDocumentUseCase {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly indexCatalog: IndexCatalog,
    private readonly documentSummaryGenerator: DocumentSummaryGenerator,
  ) {}

  async execute(input: SaveDocumentInput): Promise<SaveDocumentResult> {
    const title = Title.create(input.title);
    const summary = await this.resolveSummary(input, title.value);
    const document = WikiDocument.create({
      title,
      frontmatter: Frontmatter.create({ tags: input.tags }),
      content: input.content ?? '',
    });
    const indexEntry = IndexEntry.create({
      title: title.value,
      summary,
      sourceCount: document.frontmatter.sources.length,
    });

    await this.documentRepository.save(document);
    await this.indexCatalog.upsert(indexEntry);

    return {
      document,
      summary,
      status: 'completed',
    };
  }

  private async resolveSummary(input: SaveDocumentInput, title: string): Promise<string> {
    if (input.summary !== undefined) {
      return input.summary;
    }

    if (!input.content?.trim()) {
      throw new ContentRequiredForSummaryGenerationError();
    }

    return this.documentSummaryGenerator.generate({
      title,
      content: input.content,
      tags: input.tags,
    });
  }
}
