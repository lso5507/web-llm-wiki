import { describe, expect, it } from 'vitest';

import {
  DocumentMetadata,
  InvalidDocumentMetadataError,
} from '../../../src/domain/wiki/document-metadata.js';

describe('DocumentMetadata', () => {
  it('applies default values when no input is given', () => {
    const metadata = DocumentMetadata.from({});

    expect(metadata.status.value).toBe('draft');
    expect(metadata.domain).toBeNull();
    expect(metadata.tags).toEqual([]);
    expect(metadata.conflict).toBe(false);
    expect(metadata.conflictWith).toEqual([]);
  });

  it('applies the same defaults when called with no argument at all', () => {
    const metadata = DocumentMetadata.from();

    expect(metadata.status.value).toBe('draft');
    expect(metadata.domain).toBeNull();
    expect(metadata.tags).toEqual([]);
    expect(metadata.conflict).toBe(false);
    expect(metadata.conflictWith).toEqual([]);
  });

  it('accepts status as a string and wraps it in a Status value object', () => {
    const metadata = DocumentMetadata.from({ status: 'review' });

    expect(metadata.status.value).toBe('review');
  });

  it('accepts domain as a string and wraps it in a Domain value object', () => {
    const metadata = DocumentMetadata.from({ domain: 'tech-stack' });

    expect(metadata.domain).not.toBeNull();
    expect(metadata.domain?.value).toBe('tech-stack');
  });

  it('treats explicit null domain as absent', () => {
    const metadata = DocumentMetadata.from({ domain: null });

    expect(metadata.domain).toBeNull();
  });

  it('accepts tags and exposes them in declaration order', () => {
    const metadata = DocumentMetadata.from({ tags: ['orenz', 'wiki'] });

    expect(metadata.tags).toEqual(['orenz', 'wiki']);
  });

  it('accepts conflict and conflictWith fields together', () => {
    const metadata = DocumentMetadata.from({
      conflict: true,
      conflictWith: ['doc-1', 'doc-2'],
    });

    expect(metadata.conflict).toBe(true);
    expect(metadata.conflictWith).toEqual(['doc-1', 'doc-2']);
  });

  it('rejects invalid status values via the Status factory', () => {
    expect(() => DocumentMetadata.from({ status: 'archived' })).toThrow();
  });

  it('rejects invalid domain values via the Domain factory', () => {
    expect(() => DocumentMetadata.from({ domain: 'TechStack' })).toThrow();
  });

  it('rejects empty or whitespace-only tags', () => {
    expect(() => DocumentMetadata.from({ tags: [''] })).toThrow(
      InvalidDocumentMetadataError,
    );
    expect(() => DocumentMetadata.from({ tags: ['valid', '   '] })).toThrow(
      InvalidDocumentMetadataError,
    );
  });

  it('rejects empty or whitespace-only ids in conflictWith', () => {
    expect(() => DocumentMetadata.from({ conflictWith: [''] })).toThrow(
      InvalidDocumentMetadataError,
    );
    expect(() => DocumentMetadata.from({ conflictWith: ['ok', '   '] })).toThrow(
      InvalidDocumentMetadataError,
    );
  });

  it('keeps tag and conflictWith collections immutable', () => {
    const metadata = DocumentMetadata.from({
      tags: ['orenz'],
      conflictWith: ['doc-1'],
    });

    expect(() => {
      (metadata.tags as Array<string>).push('extra');
    }).toThrow();
    expect(() => {
      (metadata.conflictWith as Array<string>).push('extra');
    }).toThrow();
  });

  it('does not leak external array mutations into the value object', () => {
    const tags = ['orenz'];
    const conflictWith = ['doc-1'];

    const metadata = DocumentMetadata.from({ tags, conflictWith });

    tags.push('mutated');
    conflictWith.push('mutated');

    expect(metadata.tags).toEqual(['orenz']);
    expect(metadata.conflictWith).toEqual(['doc-1']);
  });

  it('accepts semantic conflict analyses and copies them defensively', () => {
    const conflicts = [
      {
        conflictingDocumentSlug: 'shipping-policy',
        conflictingDocumentTitle: 'Shipping Policy',
        explanation: 'Different Korea shipping fee',
        confidence: 'high' as const,
      },
    ];

    const metadata = DocumentMetadata.from({ semanticConflicts: conflicts });
    conflicts[0].explanation = 'mutated';

    expect(metadata.semanticConflicts).toEqual([
      {
        conflictingDocumentSlug: 'shipping-policy',
        conflictingDocumentTitle: 'Shipping Policy',
        explanation: 'Different Korea shipping fee',
        confidence: 'high',
      },
    ]);
  });

  it('creates a copy with replaced semantic conflicts', () => {
    const metadata = DocumentMetadata.from({ tags: ['shipping'] });

    const updated = metadata.withSemanticConflicts([
      {
        conflictingDocumentSlug: 'fees',
        conflictingDocumentTitle: 'Fees',
        explanation: 'Different fee',
        confidence: 'medium',
      },
    ]);

    expect(updated.tags).toEqual(['shipping']);
    expect(updated.semanticConflicts).toHaveLength(1);
    expect(metadata.semanticConflicts).toEqual([]);
  });

  it('is itself frozen as a value object', () => {
    const metadata = DocumentMetadata.from({});

    expect(Object.isFrozen(metadata)).toBe(true);
  });
});
