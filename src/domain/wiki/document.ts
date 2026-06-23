import { DocumentLinks } from './document-links.js';
import { DocumentMetadata } from './document-metadata.js';
import { Domain } from './domain.js';
import { Frontmatter, type SourceReference } from './frontmatter.js';
import { IndexEntry } from './index-entry.js';
import { Status } from './status.js';
import { Title } from './title.js';

type WikiDocumentInput = {
  title: Title;
  content: string;
  frontmatter?: Frontmatter;
  tags?: readonly string[];
  sources?: readonly SourceReference[];
  metadata?: DocumentMetadata;
  links?: DocumentLinks;
  parentSlug?: string | null;
};

const normalizeParentSlug = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  return trimmed;
};

export class WikiDocument {
  private constructor(
    public readonly title: Title,
    public readonly frontmatter: Frontmatter,
    public readonly content: string,
    public readonly metadata: DocumentMetadata,
    public readonly links: DocumentLinks,
    public readonly parentSlug: string | null,
  ) {
    Object.freeze(this);
  }

  static create(input: WikiDocumentInput): WikiDocument {
    const { frontmatter, metadata } = resolveFrontmatterAndMetadata(input);
    const links = input.links ?? DocumentLinks.empty();
    const parentSlug = resolveParentSlug(input, frontmatter);
    const finalFrontmatter =
      frontmatter.parent === parentSlug
        ? frontmatter
        : Frontmatter.create({
            sources: frontmatter.sources.map((source) => ({ ...source })),
            tags: [...frontmatter.tags],
            conflict: frontmatter.conflict,
            domain: frontmatter.domain,
            parent: parentSlug,
          });
    return new WikiDocument(
      input.title,
      finalFrontmatter,
      input.content,
      metadata,
      links,
      parentSlug,
    );
  }

  withLinks(links: DocumentLinks): WikiDocument {
    return new WikiDocument(
      this.title,
      this.frontmatter,
      this.content,
      this.metadata,
      links,
      this.parentSlug,
    );
  }

  withMetadata(metadata: DocumentMetadata): WikiDocument {
    const newFrontmatter = Frontmatter.create({
      sources: this.frontmatter.sources.map((source) => ({ ...source })),
      tags: [...metadata.tags],
      conflict: metadata.conflict,
      domain: metadata.domain,
      parent: this.parentSlug,
    });
    return new WikiDocument(
      this.title,
      newFrontmatter,
      this.content,
      metadata,
      this.links,
      this.parentSlug,
    );
  }

  withConflict(conflictWith: readonly string[]): WikiDocument {
    const newMetadata = DocumentMetadata.from({
      status: this.metadata.status.value,
      domain: this.metadata.domain ? this.metadata.domain.value : null,
      tags: [...this.metadata.tags],
      conflict: conflictWith.length > 0,
      conflictWith: [...conflictWith],
      semanticConflicts: [...this.metadata.semanticConflicts],
    });
    return this.withMetadata(newMetadata);
  }

  withParent(parentSlug: string | null): WikiDocument {
    const normalized = normalizeParentSlug(parentSlug);
    if (this.parentSlug === normalized) {
      return this;
    }
    const newFrontmatter = Frontmatter.create({
      sources: this.frontmatter.sources.map((source) => ({ ...source })),
      tags: [...this.frontmatter.tags],
      conflict: this.frontmatter.conflict,
      domain: this.frontmatter.domain,
      parent: normalized,
    });
    return new WikiDocument(
      this.title,
      newFrontmatter,
      this.content,
      this.metadata,
      this.links,
      normalized,
    );
  }

  getStatus(): Status {
    return this.metadata.status;
  }

  getDomain(): Domain | null {
    return this.metadata.domain;
  }

  getTags(): readonly string[] {
    return this.metadata.tags;
  }

  toIndexEntry(summary: string): IndexEntry {
    return IndexEntry.create({
      title: this.title.value,
      summary,
      sourceCount: this.frontmatter.sources.length,
    });
  }
}

const resolveFrontmatterAndMetadata = (
  input: WikiDocumentInput,
): { frontmatter: Frontmatter; metadata: DocumentMetadata } => {
  if (input.frontmatter) {
    const frontmatter = input.frontmatter;
    const metadata =
      input.metadata ??
      DocumentMetadata.from({
        tags: [...frontmatter.tags],
        conflict: frontmatter.conflict,
        domain: frontmatter.domain ? frontmatter.domain.value : null,
      });
    return { frontmatter, metadata };
  }

  const metadata =
    input.metadata ??
    DocumentMetadata.from({
      tags: input.tags ? [...input.tags] : [],
    });

  const frontmatter = Frontmatter.create({
    tags: [...metadata.tags],
    sources: input.sources ? [...input.sources] : [],
    conflict: metadata.conflict,
    domain: metadata.domain,
  });

  return { frontmatter, metadata };
};

const resolveParentSlug = (
  input: WikiDocumentInput,
  frontmatter: Frontmatter,
): string | null => {
  if (input.parentSlug !== undefined) {
    return normalizeParentSlug(input.parentSlug);
  }
  return frontmatter.parent;
};
