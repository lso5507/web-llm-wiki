import { Domain } from '../../domain/wiki/domain.js';
import {
  classifyByKeyword,
  KOREAN_TO_CANONICAL,
} from '../../domain/wiki/taxonomy/domain-taxonomy.js';

export interface ExistingDomain {
  readonly id: string;
  readonly label: string;
  readonly documentCount: number;
}

export interface NormalizationContext {
  readonly title: string;
  readonly content: string;
  readonly existingDomains: readonly ExistingDomain[];
}

export interface NormalizationResult {
  readonly domain: Domain;
  readonly confidence: number;
  readonly isNew: boolean;
  readonly reasoning: string;
}

export interface DomainNormalizer {
  normalize(
    koreanLabel: string,
    context: NormalizationContext,
  ): Promise<NormalizationResult>;
}

export class KeywordBasedDomainNormalizer implements DomainNormalizer {
  async normalize(
    koreanLabel: string,
    context: NormalizationContext,
  ): Promise<NormalizationResult> {
    const normalized = koreanLabel.toLowerCase().replace(/\s+/g, '');

    const directMatch = KOREAN_TO_CANONICAL.get(normalized);
    if (directMatch) {
      return {
        domain: Domain.from(directMatch),
        confidence: 1.0,
        isNew: false,
        reasoning: 'Direct keyword match from catalog',
      };
    }

    const keywordMatch = classifyByKeyword(koreanLabel);
    if (keywordMatch) {
      return {
        domain: Domain.from(keywordMatch),
        confidence: 0.9,
        isNew: false,
        reasoning: 'Keyword match from catalog aliases',
      };
    }

    if (this.isValidKebabCase(koreanLabel)) {
      return {
        domain: Domain.from(koreanLabel),
        confidence: 0.7,
        isNew: true,
        reasoning: 'Valid kebab-case, created as new domain',
      };
    }

    return {
      domain: Domain.from('other'),
      confidence: 0.5,
      isNew: false,
      reasoning: 'No match found, fallback to other',
    };
  }

  private isValidKebabCase(value: string): boolean {
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
  }
}
