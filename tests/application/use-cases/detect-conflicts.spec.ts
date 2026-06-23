import { describe, expect, it } from 'vitest';

import { DetectConflictsUseCase } from '../../../src/application/use-cases/detect-conflicts.js';
import { DocumentLinks } from '../../../src/domain/wiki/document-links.js';
import { DocumentMetadata } from '../../../src/domain/wiki/document-metadata.js';
import { Title } from '../../../src/domain/wiki/title.js';
import { WikiDocument } from '../../../src/domain/wiki/document.js';

const makeDoc = (
  title: string,
  options: {
    tags?: readonly string[];
    outbound?: readonly string[];
  } = {},
): WikiDocument =>
  WikiDocument.create({
    title: Title.create(title),
    content: '',
    metadata: DocumentMetadata.from({
      tags: options.tags ? [...options.tags] : [],
    }),
    links: DocumentLinks.from({
      outbound: options.outbound ? [...options.outbound] : [],
      broken: [],
    }),
  });

describe('DetectConflictsUseCase', () => {
  describe('empty input', () => {
    it('returns an empty array when allDocuments is empty', async () => {
      const useCase = new DetectConflictsUseCase();

      const conflicts = await useCase.execute({
        document: makeDoc('Foo Bar', { tags: ['a', 'b'] }),
        allDocuments: [],
      });

      expect(conflicts).toEqual([]);
    });
  });

  describe('same-slug self-filter', () => {
    it('does not flag the document itself when present by reference in allDocuments', async () => {
      const useCase = new DetectConflictsUseCase();
      const target = makeDoc('Foo Bar', { tags: ['a', 'b', 'c', 'd', 'e', 'f'] });

      const conflicts = await useCase.execute({
        document: target,
        allDocuments: [target],
      });

      expect(conflicts).toEqual([]);
    });

    it('does not flag a different instance that shares the same slug', async () => {
      const useCase = new DetectConflictsUseCase();
      const target = makeDoc('Foo Bar', { tags: ['x'] });
      const sameSlugClone = makeDoc('Foo Bar', { tags: ['y'] });

      const conflicts = await useCase.execute({
        document: target,
        allDocuments: [sameSlugClone],
      });

      expect(conflicts).toEqual([]);
    });
  });

  describe('tag overlap detection', () => {
    it('flags a document that shares exactly five tags', async () => {
      const useCase = new DetectConflictsUseCase();
      const target = makeDoc('Target', {
        tags: ['t1', 't2', 't3', 't4', 't5', 'unique-target'],
      });
      const other = makeDoc('Other', {
        tags: ['t1', 't2', 't3', 't4', 't5', 'unique-other'],
      });

      const conflicts = await useCase.execute({
        document: target,
        allDocuments: [other],
      });

      expect(conflicts).toEqual(['other']);
    });

    it('flags a document that shares more than five tags', async () => {
      const useCase = new DetectConflictsUseCase();
      const target = makeDoc('Target', {
        tags: ['t1', 't2', 't3', 't4', 't5', 't6', 't7'],
      });
      const other = makeDoc('Other', {
        tags: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 'extra'],
      });

      const conflicts = await useCase.execute({
        document: target,
        allDocuments: [other],
      });

      expect(conflicts).toEqual(['other']);
    });

    it('does not flag when only four tags are shared', async () => {
      const useCase = new DetectConflictsUseCase();
      const target = makeDoc('Target', {
        tags: ['t1', 't2', 't3', 't4', 'target-only'],
      });
      const other = makeDoc('Other', {
        tags: ['t1', 't2', 't3', 't4', 'other-only'],
      });

      const conflicts = await useCase.execute({
        document: target,
        allDocuments: [other],
      });

      expect(conflicts).toEqual([]);
    });

    it('does not flag when no tags are shared', async () => {
      const useCase = new DetectConflictsUseCase();
      const target = makeDoc('Target', { tags: ['a', 'b'] });
      const other = makeDoc('Other', { tags: ['x', 'y'] });

      const conflicts = await useCase.execute({
        document: target,
        allDocuments: [other],
      });

      expect(conflicts).toEqual([]);
    });

    it('counts duplicate tags only once when computing overlap', async () => {
      const useCase = new DetectConflictsUseCase();
      // The target has duplicate 't1's. Even if the other doc shares 't1', it should
      // count as one shared tag, not multiple.
      const target = makeDoc('Target', {
        tags: ['t1', 't2', 't3', 't4'],
      });
      const other = makeDoc('Other', {
        tags: ['t1', 't1', 't1', 't1', 't1'],
      });

      const conflicts = await useCase.execute({
        document: target,
        allDocuments: [other],
      });

      expect(conflicts).toEqual([]);
    });

    it('does not flag the document itself based on its own tags overlapping with itself', async () => {
      const useCase = new DetectConflictsUseCase();
      const target = makeDoc('Foo', {
        tags: ['t1', 't2', 't3', 't4', 't5', 't6'],
      });

      const conflicts = await useCase.execute({
        document: target,
        allDocuments: [target],
      });

      expect(conflicts).toEqual([]);
    });
  });

  describe('self-link detection', () => {
    it('flags the document itself when its outbound includes its own slug', async () => {
      const useCase = new DetectConflictsUseCase();
      const target = makeDoc('Target', {
        outbound: ['target'],
      });

      const conflicts = await useCase.execute({
        document: target,
        allDocuments: [],
      });

      expect(conflicts).toEqual(['target']);
    });

    it('does not flag self-link when outbound has only other slugs', async () => {
      const useCase = new DetectConflictsUseCase();
      const target = makeDoc('Target', {
        outbound: ['other-doc', 'another-doc'],
      });

      const conflicts = await useCase.execute({
        document: target,
        allDocuments: [],
      });

      expect(conflicts).toEqual([]);
    });
  });

  describe('deduplication', () => {
    it('returns each conflicting slug only once when multiple rules match the same doc', async () => {
      const useCase = new DetectConflictsUseCase();
      // 'other' matches by tag overlap, AND target also self-links to itself.
      // Each conflict slug should appear only once in the result.
      const target = makeDoc('Target', {
        tags: ['t1', 't2', 't3', 't4', 't5'],
        outbound: ['target'],
      });
      const other = makeDoc('Other', {
        tags: ['t1', 't2', 't3', 't4', 't5'],
      });

      const conflicts = await useCase.execute({
        document: target,
        allDocuments: [other],
      });

      // Two distinct conflict sources: tag overlap (other) and self-link (target).
      // Each appears only once.
      expect(conflicts).toHaveLength(2);
      expect(new Set(conflicts)).toEqual(new Set(['other', 'target']));
    });
  });

  describe('multiple conflicts', () => {
    it('returns all distinct conflicting slugs from different rules', async () => {
      const useCase = new DetectConflictsUseCase();
      const target = makeDoc('Target', {
        tags: ['t1', 't2', 't3', 't4', 't5'],
        outbound: ['target'],
      });
      const tagSibling = makeDoc('Tag Sibling', {
        tags: ['t1', 't2', 't3', 't4', 't5', 'extra'],
      });
      const unrelated = makeDoc('Unrelated', { tags: ['unrelated'] });

      const conflicts = await useCase.execute({
        document: target,
        allDocuments: [tagSibling, unrelated],
      });

      expect(new Set(conflicts)).toEqual(new Set(['tag-sibling', 'target']));
      expect(conflicts).toHaveLength(2);
    });

    it('returns conflicts in a deterministic, stable order', async () => {
      const useCase = new DetectConflictsUseCase();
      const target = makeDoc('Target', {
        tags: ['t1', 't2', 't3', 't4', 't5'],
      });
      const a = makeDoc('Alpha', {
        tags: ['t1', 't2', 't3', 't4', 't5'],
      });
      const b = makeDoc('Beta', {
        tags: ['t1', 't2', 't3', 't4', 't5'],
      });

      const conflicts = await useCase.execute({
        document: target,
        allDocuments: [a, b],
      });

      // Iteration order should match input order
      expect(conflicts).toEqual(['alpha', 'beta']);
    });
  });

  describe('idempotence', () => {
    it('returns the same result when invoked multiple times with the same inputs', async () => {
      const useCase = new DetectConflictsUseCase();
      const target = makeDoc('Target', {
        tags: ['t1', 't2', 't3', 't4', 't5'],
        outbound: ['target'],
      });
      const other = makeDoc('Other', {
        tags: ['t1', 't2', 't3', 't4', 't5'],
      });

      const first = await useCase.execute({
        document: target,
        allDocuments: [other],
      });
      const second = await useCase.execute({
        document: target,
        allDocuments: [other],
      });

      expect(first).toEqual(second);
    });
  });
});
