import type { DocumentRepository } from '../ports/document-repository.js';
import type { DocumentSummaryGenerator } from '../ports/document-summary-generator.js';
import type { DomainNormalizer } from '../services/domain-normalizer.js';
import { Domain } from '../../domain/wiki/domain.js';

export type PreviewDocumentInput = {
  title: string;
  content: string;
  tags?: string[];
};

export type PreviewDocumentResult = {
  summary: string;
  domain: string | null;
  confidence: number;
  availableDomains: string[];
};

export class PreviewDocumentUseCase {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly documentSummaryGenerator: DocumentSummaryGenerator,
    private readonly domainNormalizer?: DomainNormalizer,
  ) {}

  async execute(input: PreviewDocumentInput): Promise<PreviewDocumentResult> {
    const summaryResult = await this.documentSummaryGenerator.generate({
      title: input.title,
      content: input.content,
      tags: input.tags,
    });

    const existingDomains = await this.getExistingDomains();
    const availableDomains = existingDomains.map((d) => d.id);

    let resolvedDomain: string | null = null;

    if (summaryResult.domain && this.domainNormalizer) {
      try {
        const result = await this.domainNormalizer.normalize(summaryResult.domain, {
          title: input.title,
          content: input.content,
          existingDomains,
        });
        resolvedDomain = result.domain?.value ?? null;
      } catch {
        resolvedDomain = toKebabCase(summaryResult.domain);
      }
    } else if (summaryResult.domain) {
      resolvedDomain = toKebabCase(summaryResult.domain);
    }

    if (resolvedDomain && !availableDomains.includes(resolvedDomain)) {
      availableDomains.push(resolvedDomain);
    }

    return {
      summary: summaryResult.summary,
      domain: resolvedDomain,
      confidence: summaryResult.confidence,
      availableDomains,
    };
  }

  private async getExistingDomains() {
    const documents = await this.documentRepository.findAll();
    const domainMap = new Map<string, number>();

    for (const doc of documents) {
      const domain = doc.metadata.domain;
      if (!domain) continue;
      domainMap.set(domain.value, (domainMap.get(domain.value) ?? 0) + 1);
    }

    return Array.from(domainMap.entries()).map(([id, count]) => ({
      id,
      label: id,
      documentCount: count,
    }));
  }
}

const toKebabCase = (value: string): string => {
  try {
    return Domain.from(value).value;
  } catch {
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }
};
