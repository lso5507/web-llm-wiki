import { Domain } from '../../domain/wiki/domain.js';

export interface DomainClassifier {
  /**
   * Infer a {@link Domain} for the document based on its title and content.
   *
   * Implementations MUST return `null` when the domain cannot be determined
   * (ambiguous content, transport failure, parse failure, etc.) and MUST NOT
   * throw — domain classification is a best-effort enrichment and must never
   * block the caller from saving the document.
   */
  classify(content: string, title: string): Promise<Domain | null>;
}
