import { describe, expect, it } from 'vitest';

import { DetectConflictsUseCase } from '../../../src/application/use-cases/detect-conflicts.js';
import { DocumentAlreadyExistsError } from '../../../src/application/errors/document-already-exists-error.js';
import { SaveDocumentUseCase } from '../../../src/application/use-cases/save-document.js';
import { SuggestLinksUseCase } from '../../../src/application/use-cases/suggest-links.js';
import { ValidateLinksUseCase } from '../../../src/application/use-cases/validate-links.js';
import type { DomainClassifier } from '../../../src/application/ports/domain-classifier.js';
import type { IndexCatalog } from '../../../src/application/ports/index-catalog.js';
import type { DocumentRepository } from '../../../src/application/ports/document-repository.js';
import type {
  DocumentSummaryGenerator,
  DocumentSummaryResult,
} from '../../../src/application/ports/document-summary-generator.js';
import type {
  SemanticConflictAnalysis,
  SemanticConflictDetector,
} from '../../../src/application/ports/semantic-conflict-detector.js';
import { DocumentMetadata } from '../../../src/domain/wiki/document-metadata.js';
import { Domain } from '../../../src/domain/wiki/domain.js';
import { IndexEntry } from '../../../src/domain/wiki/index-entry.js';
import { Status } from '../../../src/domain/wiki/status.js';
import { Title } from '../../../src/domain/wiki/title.js';
import { WikiDocument } from '../../../src/domain/wiki/document.js';

class FakeDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, WikiDocument>();

  async save(document: WikiDocument): Promise<void> {
    this.documents.set(document.title.toSlug(), document);
  }

  async findByTitle(title: Title): Promise<WikiDocument | null> {
    return this.documents.get(title.toSlug()) ?? null;
  }

  async findById(id: string): Promise<WikiDocument | null> {
    return this.documents.get(id) ?? null;
  }

  async findAll(): Promise<WikiDocument[]> {
    return [...this.documents.values()];
  }

  async delete(id: string): Promise<void> {
    this.documents.delete(id);
  }

  async exists(slug: string): Promise<boolean> {
    return this.documents.has(slug);
  }

  count(): number {
    return this.documents.size;
  }
}

class FakeIndexCatalog implements IndexCatalog {
  private readonly entries = new Map<string, IndexEntry>();

  async upsert(entry: IndexEntry): Promise<void> {
    this.entries.set(entry.title, entry);
  }

  async list(): Promise<IndexEntry[]> {
    return [...this.entries.values()].sort(IndexEntry.compareByTitle);
  }

  async remove(id: string): Promise<void> {
    this.entries.delete(id);
  }
}

class FakeDocumentSummaryGenerator implements DocumentSummaryGenerator {
  public callCount = 0;

  constructor(private readonly generatedSummary: string) {}

  async generate(input: {
    title: string;
    content: string;
    tags?: string[];
  }): Promise<DocumentSummaryResult> {
    this.callCount += 1;
    return {
      summary: `${this.generatedSummary}:${input.title}`,
      domain: null,
      confidence: 1.0,
    };
  }
}

class FakeDomainClassifier implements DomainClassifier {
  public callCount = 0;
  public lastInput: { content: string; title: string } | null = null;

  constructor(private readonly result: Domain | null) {}

  async classify(content: string, title: string): Promise<Domain | null> {
    this.callCount += 1;
    this.lastInput = { content, title };
    return this.result;
  }
}

class ThrowingDomainClassifier implements DomainClassifier {
  public callCount = 0;

  async classify(): Promise<Domain | null> {
    this.callCount += 1;
    throw new Error('classifier exploded');
  }
}

class FakeSemanticConflictDetector implements SemanticConflictDetector {
  public calls: Array<{
    target: WikiDocument;
    candidates: readonly WikiDocument[];
  }> = [];

  constructor(private readonly result: SemanticConflictAnalysis[]) {}

  async detectConflicts(
    targetDocument: WikiDocument,
    candidatesInSameDomain: readonly WikiDocument[],
  ): Promise<SemanticConflictAnalysis[]> {
    this.calls.push({ target: targetDocument, candidates: candidatesInSameDomain });
    return this.result;
  }
}

const waitFor = async (predicate: () => boolean | Promise<boolean>): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition was not met');
};

const asyncStoredSemanticConflictExists = (
  repository: FakeDocumentRepository,
  id: string,
): (() => Promise<boolean>) => {
  return async () => {
    const document = await repository.findById(id);
    return (document?.metadata.semanticConflicts.length ?? 0) > 0;
  };
};

describe('SaveDocumentUseCase', () => {
  it('saves a new document and writes one index entry', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const useCase = new SaveDocumentUseCase(repository, indexCatalog, new FakeDocumentSummaryGenerator('unused'));

    await useCase.execute({ title: 'Orenz Test Account', summary: 'Test account credentials' });

    expect(repository.count()).toBe(1);
    const saved = await repository.findByTitle(Title.create('Orenz Test Account'));
    expect(saved).not.toBeNull();
    expect(saved?.metadata.status.value).toBe('published');
    expect(await indexCatalog.list()).toEqual([
      IndexEntry.create({
        title: 'Orenz Test Account',
        summary: 'Test account credentials',
        status: saved!.metadata.status,
        domain: saved!.metadata.domain,
      }),
    ]);
  });

  it('rejects the same title and preserves the original index entry', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const useCase = new SaveDocumentUseCase(repository, indexCatalog, new FakeDocumentSummaryGenerator('unused'));

    await useCase.execute({ title: 'Orenz Test Account', summary: 'old summary' });
    await expect(useCase.execute({
      title: 'Orenz Test Account',
      summary: 'new summary',
    })).rejects.toBeInstanceOf(DocumentAlreadyExistsError);

    expect(repository.count()).toBe(1);
    expect(await indexCatalog.list()).toEqual([
      IndexEntry.create({
        title: 'Orenz Test Account',
        summary: 'old summary',
        status: Status.from('published'),
      }),
    ]);
  });

  it('rejects an empty title and does not mutate state', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const useCase = new SaveDocumentUseCase(repository, indexCatalog, new FakeDocumentSummaryGenerator('unused'));

    await expect(useCase.execute({ title: '   ', summary: 'anything' })).rejects.toThrow('Title must not be empty');

    expect(repository.count()).toBe(0);
    expect(await indexCatalog.list()).toEqual([]);
  });

  it('rejects an empty summary and does not mutate state', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const useCase = new SaveDocumentUseCase(repository, indexCatalog, new FakeDocumentSummaryGenerator('unused'));

    await expect(useCase.execute({ title: 'Valid Title', summary: '   ' })).rejects.toThrow(
      'Index entry summary must not be empty',
    );

    expect(repository.count()).toBe(0);
    expect(await indexCatalog.list()).toEqual([]);
  });

  it('generates a summary when one is not provided', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const summaryGenerator = new FakeDocumentSummaryGenerator('Generated summary');
    const useCase = new SaveDocumentUseCase(repository, indexCatalog, summaryGenerator);

    await useCase.execute({ title: 'Orenz Test Account', content: 'Raw markdown body' });

    expect(summaryGenerator.callCount).toBe(1);
    expect(await indexCatalog.list()).toEqual([
      IndexEntry.create({
        title: 'Orenz Test Account',
        summary: 'Generated summary:Orenz Test Account',
        status: Status.from('published'),
      }),
    ]);
  });

  it('requires content when summary generation is needed', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const useCase = new SaveDocumentUseCase(repository, indexCatalog, new FakeDocumentSummaryGenerator('unused'));

    await expect(useCase.execute({ title: 'Orenz Test Account' })).rejects.toThrow(
      'content is required when summary is omitted',
    );

    expect(repository.count()).toBe(0);
    expect(await indexCatalog.list()).toEqual([]);
  });

  describe('domain auto-classification', () => {
    it('invokes the classifier when no domain is provided and stores its result', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const classifier = new FakeDomainClassifier(Domain.from('tech-stack'));
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('Generated'),
        undefined,
        classifier,
      );

      const result = await useCase.execute({
        title: 'TypeScript Setup Guide',
        content: 'Configure tsconfig and vitest for the project',
      });

      expect(classifier.callCount).toBe(1);
      expect(classifier.lastInput).toEqual({
        content: 'Configure tsconfig and vitest for the project',
        title: 'TypeScript Setup Guide',
      });
      expect(result.document.frontmatter.domain?.value).toBe('tech-stack');
    });

    it('skips the classifier when a manual domain is provided', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const classifier = new FakeDomainClassifier(Domain.from('tech-stack'));
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('Generated'),
        undefined,
        classifier,
      );

      const result = await useCase.execute({
        title: 'API Design',
        content: 'REST endpoints',
        domain: 'api-design',
      });

      expect(classifier.callCount).toBe(0);
      expect(result.document.frontmatter.domain?.value).toBe('api-design');
    });

    it('proceeds without a domain when no classifier is configured', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('Generated'),
      );

      const result = await useCase.execute({
        title: 'Random Note',
        content: 'just a note',
      });

      expect(result.document.frontmatter.domain).toBeNull();
    });

    it('proceeds without a domain when the classifier returns null', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const classifier = new FakeDomainClassifier(null);
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('Generated'),
        undefined,
        classifier,
      );

      const result = await useCase.execute({
        title: 'Ambiguous Note',
        content: 'unclassifiable content',
      });

      expect(classifier.callCount).toBe(1);
      expect(result.document.frontmatter.domain).toBeNull();
      expect(repository.count()).toBe(1);
    });

    it('still saves the document when the classifier throws', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const classifier = new ThrowingDomainClassifier();
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('Generated'),
        undefined,
        classifier,
      );

      const result = await useCase.execute({
        title: 'Resilient Note',
        content: 'content that triggers a classifier failure',
      });

      expect(classifier.callCount).toBe(1);
      expect(result.document.frontmatter.domain).toBeNull();
      expect(repository.count()).toBe(1);
      expect(await indexCatalog.list()).toHaveLength(1);
    });

    it('does not call the classifier when content is empty', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const classifier = new FakeDomainClassifier(Domain.from('tech-stack'));
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('Generated'),
        undefined,
        classifier,
      );

      const result = await useCase.execute({
        title: 'No Content',
        summary: 'manual summary, no content provided',
      });

      expect(classifier.callCount).toBe(0);
      expect(result.document.frontmatter.domain).toBeNull();
    });

    it('auto-creates a domain root document and places classified documents under it', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const classifier = new FakeDomainClassifier(Domain.from('shipping'));
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        classifier,
      );

      const first = await useCase.execute({
        title: '간식 비용',
        summary: '간식 비용 안내',
        content: '새콤달콤 3000원',
      });
      const second = await useCase.execute({
        title: '배송 비용',
        summary: '배송 비용 안내',
        content: '한국 배송 비용은 3000원입니다.',
      });

      expect(classifier.callCount).toBe(2);

      // shipping 도메인 루트 문서가 자동 생성되어야 한다
      const domainRoot = await repository.findById('shipping');
      expect(domainRoot).not.toBeNull();
      expect(domainRoot?.metadata.domain?.value).toBe('shipping');
      expect(domainRoot?.parentSlug).toBeNull();

      // 두 문서 모두 도메인 루트 아래에 위치해야 한다
      expect(first.document.metadata.domain?.value).toBe('shipping');
      expect(first.document.parentSlug).toBe('shipping');
      expect(second.document.metadata.domain?.value).toBe('shipping');
      expect(second.document.parentSlug).toBe('shipping');
    });

    it('does not create a domain root document when the document itself is the domain root', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const classifier = new FakeDomainClassifier(Domain.from('shipping'));
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        classifier,
      );

      const result = await useCase.execute({
        title: 'shipping',
        summary: '배송 도메인',
        content: '배송 관련 문서 모음',
      });

      expect(result.document.parentSlug).toBeNull();
      // 오직 1개 문서만 저장되어야 한다 (도메인 루트가 중복 생성되면 안 된다)
      expect(repository.count()).toBe(1);
    });
  });

  describe('link validation', () => {
    it('populates document.links via the linkValidator when provided', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing Page'),
          content: 'body',
        }),
      );
      const linkValidator = new ValidateLinksUseCase(repository);
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        linkValidator,
      );

      const result = await useCase.execute({
        title: 'New Page',
        summary: 'manual summary',
        content: 'See [[existing-page]] and [[missing-page]].',
      });

      expect([...result.document.links.outbound]).toEqual([
        'existing-page',
        'missing-page',
      ]);
      expect([...result.document.links.broken]).toEqual(['missing-page']);
    });

    it('still saves the document even when broken links are detected', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const linkValidator = new ValidateLinksUseCase(repository);
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        linkValidator,
      );

      const result = await useCase.execute({
        title: 'Has Broken Link',
        summary: 'manual',
        content: 'Reference [[does-not-exist]].',
      });

      expect(result.status).toBe('completed');
      expect(repository.count()).toBe(1);
      expect([...result.document.links.broken]).toEqual(['does-not-exist']);
    });

    it('excludes self-references from the persisted links', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const linkValidator = new ValidateLinksUseCase(repository);
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        linkValidator,
      );

      const result = await useCase.execute({
        title: 'Self Linker',
        summary: 'manual',
        content: 'I link to myself: [[self-linker]].',
      });

      expect([...result.document.links.outbound]).toEqual([]);
      expect([...result.document.links.broken]).toEqual([]);
    });

    it('defaults to empty links when no linkValidator is configured', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
      );

      const result = await useCase.execute({
        title: 'No Validator',
        summary: 'manual',
        content: 'See [[anything]].',
      });

      expect([...result.document.links.outbound]).toEqual([]);
      expect([...result.document.links.broken]).toEqual([]);
    });
  });

  describe('link suggestion integration', () => {
    it('applies link suggestions to content before persisting', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing Page'),
          content: 'body',
        }),
      );
      const linkSuggester = new SuggestLinksUseCase(repository);
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        undefined,
        linkSuggester,
      );

      const result = await useCase.execute({
        title: 'New Page',
        summary: 'manual',
        content: 'See Existing Page for details.',
      });

      expect(result.document.content).toBe('See [[existing-page]] for details.');
    });

    it('runs link suggestion before validation so suggested links are validated', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing Page'),
          content: 'body',
        }),
      );
      const linkSuggester = new SuggestLinksUseCase(repository);
      const linkValidator = new ValidateLinksUseCase(repository);
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        linkValidator,
        linkSuggester,
      );

      const result = await useCase.execute({
        title: 'New Page',
        summary: 'manual',
        content: 'See Existing Page for details.',
      });

      // given suggestion runs before validation, the suggested [[existing-page]]
      // is what the validator sees, so it resolves as a known outbound link
      expect(result.document.content).toBe('See [[existing-page]] for details.');
      expect([...result.document.links.outbound]).toEqual(['existing-page']);
      expect([...result.document.links.broken]).toEqual([]);
    });

    it('still saves the document when link suggestion throws', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const failingSuggester = {
        async execute(): Promise<{ content: string; linksAdded: number }> {
          throw new Error('suggester exploded');
        },
      } as unknown as SuggestLinksUseCase;
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        undefined,
        failingSuggester,
      );

      const result = await useCase.execute({
        title: 'Resilient Page',
        summary: 'manual',
        content: 'See Existing Page for details.',
      });

      expect(result.status).toBe('completed');
      expect(result.document.content).toBe('See Existing Page for details.');
      expect(repository.count()).toBe(1);
    });

    it('leaves content untouched when no linkSuggester is configured', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing Page'),
          content: 'body',
        }),
      );
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
      );

      const result = await useCase.execute({
        title: 'No Suggester',
        summary: 'manual',
        content: 'See Existing Page for details.',
      });

      expect(result.document.content).toBe('See Existing Page for details.');
    });
  });

  describe('conflict detection', () => {
    it('marks the saved document with conflictWith when tag overlap >= 5', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const conflictDetector = new DetectConflictsUseCase();
      const sharedTags = ['t1', 't2', 't3', 't4', 't5'];
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing'),
          content: 'body',
          metadata: DocumentMetadata.from({ tags: sharedTags }),
        }),
      );
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        undefined,
        undefined,
        conflictDetector,
      );

      const result = await useCase.execute({
        title: 'New',
        summary: 'manual',
        tags: sharedTags,
      });

      expect(result.document.metadata.conflict).toBe(true);
      expect([...result.document.metadata.conflictWith]).toEqual(['existing']);
    });

    it('bidirectionally marks the existing document', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const conflictDetector = new DetectConflictsUseCase();
      const sharedTags = ['t1', 't2', 't3', 't4', 't5'];
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing'),
          content: 'body',
          metadata: DocumentMetadata.from({ tags: sharedTags }),
        }),
      );
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        undefined,
        undefined,
        conflictDetector,
      );

      await useCase.execute({ title: 'New', summary: 'manual', tags: sharedTags });

      const existing = await repository.findById('existing');
      expect(existing?.metadata.conflict).toBe(true);
      expect([...(existing?.metadata.conflictWith ?? [])]).toEqual(['new']);
    });

    it('does not mark conflict when no rules match', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const conflictDetector = new DetectConflictsUseCase();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Unrelated'),
          content: 'body',
          metadata: DocumentMetadata.from({ tags: ['unrelated'] }),
        }),
      );
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        undefined,
        undefined,
        conflictDetector,
      );

      const result = await useCase.execute({
        title: 'Clean Doc',
        summary: 'manual',
        tags: ['fresh'],
      });

      expect(result.document.metadata.conflict).toBe(false);
      expect([...result.document.metadata.conflictWith]).toEqual([]);
      const unrelated = await repository.findById('unrelated');
      expect(unrelated?.metadata.conflict).toBe(false);
      expect([...(unrelated?.metadata.conflictWith ?? [])]).toEqual([]);
    });

    it('flags multiple conflicting documents and marks each bidirectionally', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const conflictDetector = new DetectConflictsUseCase();
      const sharedTags = ['t1', 't2', 't3', 't4', 't5'];
      await repository.save(
        WikiDocument.create({
          title: Title.create('Alpha'),
          content: 'body',
          metadata: DocumentMetadata.from({ tags: sharedTags }),
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Beta'),
          content: 'body',
          metadata: DocumentMetadata.from({ tags: sharedTags }),
        }),
      );
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        undefined,
        undefined,
        conflictDetector,
      );

      const result = await useCase.execute({
        title: 'New',
        summary: 'manual',
        tags: sharedTags,
      });

      expect(new Set(result.document.metadata.conflictWith)).toEqual(
        new Set(['alpha', 'beta']),
      );
      const alpha = await repository.findById('alpha');
      const beta = await repository.findById('beta');
      expect([...(alpha?.metadata.conflictWith ?? [])]).toEqual(['new']);
      expect([...(beta?.metadata.conflictWith ?? [])]).toEqual(['new']);
    });

    it('rejects a duplicate title without overwriting the existing document', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const conflictDetector = new DetectConflictsUseCase();
      const sharedTags = ['t1', 't2', 't3', 't4', 't5'];
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing'),
          content: 'body',
          metadata: DocumentMetadata.from({ tags: sharedTags }),
        }),
      );
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        undefined,
        undefined,
        conflictDetector,
      );

      await useCase.execute({ title: 'New', summary: 'manual', content: 'original', tags: sharedTags });

      await expect(useCase.execute({
        title: 'New',
        summary: 'replacement',
        content: 'overwritten',
        tags: sharedTags,
      })).rejects.toBeInstanceOf(DocumentAlreadyExistsError);

      const existing = await repository.findById('existing');
      expect([...(existing?.metadata.conflictWith ?? [])]).toEqual(['new']);
      expect((await repository.findById('new'))?.content).toBe('original');
    });

    it('skips conflict detection when no detector is provided', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const sharedTags = ['t1', 't2', 't3', 't4', 't5'];
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing'),
          content: 'body',
          metadata: DocumentMetadata.from({ tags: sharedTags }),
        }),
      );
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
      );

      const result = await useCase.execute({
        title: 'New',
        summary: 'manual',
        tags: sharedTags,
      });

      expect(result.document.metadata.conflict).toBe(false);
      expect([...result.document.metadata.conflictWith]).toEqual([]);
      const existing = await repository.findById('existing');
      expect(existing?.metadata.conflict).toBe(false);
      expect([...(existing?.metadata.conflictWith ?? [])]).toEqual([]);
    });
  });

  describe('semantic conflict detection', () => {
    it('runs asynchronously against documents in the same domain only and persists the result', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Shipping Policy'),
          content: 'Korea shipping fee is 4000 KRW',
          metadata: DocumentMetadata.from({ domain: 'shipping' }),
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Payment Policy'),
          content: 'Credit card payments settle next day',
          metadata: DocumentMetadata.from({ domain: 'payment' }),
        }),
      );
      const semanticConflictDetector = new FakeSemanticConflictDetector([
        {
          conflictingDocumentSlug: 'shipping-policy',
          conflictingDocumentTitle: 'Shipping Policy',
          explanation: 'Korea shipping fee differs: 3000 KRW vs 4000 KRW.',
          confidence: 'high',
        },
      ]);
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        semanticConflictDetector,
      );

      await useCase.execute({
        title: 'Shipping Fees',
        summary: 'manual',
        content: 'Korea shipping fee is 3000 KRW',
        domain: 'shipping',
      });

      await waitFor(() => semanticConflictDetector.calls.length === 1);
      expect(semanticConflictDetector.calls[0].candidates.map((doc) => doc.title.value)).toEqual([
        'Shipping Policy',
      ]);
      await waitFor(asyncStoredSemanticConflictExists(repository, 'shipping-fees'));
      const reloaded = await repository.findById('shipping-fees');
      expect(reloaded?.metadata.semanticConflicts).toEqual([
        {
          conflictingDocumentSlug: 'shipping-policy',
          conflictingDocumentTitle: 'Shipping Policy',
          explanation: 'Korea shipping fee differs: 3000 KRW vs 4000 KRW.',
          confidence: 'high',
        },
      ]);
    });

    it('skips semantic conflict detection when forceSemanticConflicts is true', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const semanticConflictDetector = new FakeSemanticConflictDetector([]);
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        semanticConflictDetector,
      );

      await useCase.execute({
        title: 'Shipping Fees',
        summary: 'manual',
        content: 'Korea shipping fee is 3000 KRW',
        domain: 'shipping',
        forceSemanticConflicts: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(semanticConflictDetector.calls).toEqual([]);
    });

    it('skips semantic conflict detection when the saved document has no domain', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const semanticConflictDetector = new FakeSemanticConflictDetector([]);
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        semanticConflictDetector,
      );

      await useCase.execute({
        title: 'Uncategorized',
        summary: 'manual',
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(semanticConflictDetector.calls).toEqual([]);
    });
  });

  describe('hierarchy', () => {
    it('saves a document with parentSlug', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Parent Doc'),
          content: 'parent body',
        }),
      );
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
      );

      const result = await useCase.execute({
        title: 'Child Doc',
        summary: 'manual',
        parentSlug: 'parent-doc',
      });

      expect(result.document.parentSlug).toBe('parent-doc');
      const reloaded = await repository.findById('child-doc');
      expect(reloaded?.parentSlug).toBe('parent-doc');
    });

    it('saves with parentSlug null when not provided', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
      );

      const result = await useCase.execute({
        title: 'Root Doc',
        summary: 'manual',
      });

      expect(result.document.parentSlug).toBeNull();
    });

    it('rejects when document is its own parent', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
      );

      await expect(
        useCase.execute({
          title: 'Self',
          summary: 'manual',
          parentSlug: 'self',
        }),
      ).rejects.toThrow(/Circular hierarchy/);
    });

    it('rejects when saving creates a cycle (A.parent=B, save B with parent=A)', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('A'),
          content: 'body',
          parentSlug: 'b',
        }),
      );
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
      );

      await expect(
        useCase.execute({
          title: 'B',
          summary: 'manual',
          parentSlug: 'a',
        }),
      ).rejects.toThrow(/Circular hierarchy/);
    });

    it('allows saving when parent does not exist yet (deferred validation)', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const useCase = new SaveDocumentUseCase(
        repository,
        indexCatalog,
        new FakeDocumentSummaryGenerator('unused'),
      );

      const result = await useCase.execute({
        title: 'Lonely Child',
        summary: 'manual',
        parentSlug: 'future-parent',
      });

      expect(result.document.parentSlug).toBe('future-parent');
    });
  });
});
