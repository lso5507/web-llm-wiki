import { describe, expect, it } from 'vitest';

import type { DomainDefinition } from '../../../../src/domain/wiki/taxonomy/domain-taxonomy.js';
import {
  classifyByKeyword,
  DOMAIN_CATALOG,
  getAllDomainIds,
  getDomainDefinition,
  KOREAN_TO_CANONICAL,
} from '../../../../src/domain/wiki/taxonomy/domain-taxonomy.js';

describe('domain-taxonomy', () => {
  describe('DOMAIN_CATALOG', () => {
    it('includes all expected top-level domains', () => {
      const ids = DOMAIN_CATALOG.map((def) => def.id);
      expect(ids).toContain('shipping');
      expect(ids).toContain('payment');
      expect(ids).toContain('refund');
      expect(ids).toContain('product');
      expect(ids).toContain('customer');
      expect(ids).toContain('order');
      expect(ids).toContain('inventory');
      expect(ids).toContain('marketing');
      expect(ids).toContain('support');
      expect(ids).toContain('tech-stack');
      expect(ids).toContain('operations');
      expect(ids).toContain('policy');
      expect(ids).toContain('other');
    });

    it('has unique IDs', () => {
      const ids = DOMAIN_CATALOG.map((def) => def.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('has Korean labels for all domains', () => {
      DOMAIN_CATALOG.forEach((def: DomainDefinition) => {
        expect(def.label).toBeTruthy();
        expect(def.label).toMatch(/^[가-힣]/);
      });
    });
  });

  describe('KOREAN_TO_CANONICAL', () => {
    it('maps "배송" variants to shipping domain', () => {
      expect(KOREAN_TO_CANONICAL.get('배송')).toBe('shipping');
      expect(KOREAN_TO_CANONICAL.get('배송비용')).toBe('shipping');
      expect(KOREAN_TO_CANONICAL.get('배송료')).toBe('shipping');
      expect(KOREAN_TO_CANONICAL.get('배송시간')).toBe('shipping');
      expect(KOREAN_TO_CANONICAL.get('배송방법')).toBe('shipping');
    });

    it('maps "결제" variants to payment domain', () => {
      expect(KOREAN_TO_CANONICAL.get('결제')).toBe('payment');
      expect(KOREAN_TO_CANONICAL.get('결제수단')).toBe('payment');
      expect(KOREAN_TO_CANONICAL.get('결제방법')).toBe('payment');
    });

    it('maps "환불" variants to refund domain', () => {
      expect(KOREAN_TO_CANONICAL.get('환불')).toBe('refund');
      expect(KOREAN_TO_CANONICAL.get('환불정책')).toBe('refund');
      expect(KOREAN_TO_CANONICAL.get('반품')).toBe('refund');
      expect(KOREAN_TO_CANONICAL.get('교환')).toBe('refund');
    });
  });

  describe('classifyByKeyword', () => {
    it('classifies "배송" variants to shipping domain', () => {
      expect(classifyByKeyword('배송 안내')).toBe('shipping');
      expect(classifyByKeyword('배송비용 정보')).toBe('shipping');
      expect(classifyByKeyword('최신 배송비용 업데이트')).toBe('shipping');
      expect(classifyByKeyword('배송종류 선택')).toBe('shipping');
      expect(classifyByKeyword('배송시간 확인')).toBe('shipping');
    });

    it('classifies "결제" variants to payment domain', () => {
      expect(classifyByKeyword('결제 방법')).toBe('payment');
      expect(classifyByKeyword('결제수단 안내')).toBe('payment');
      expect(classifyByKeyword('카드결제 절차')).toBe('payment');
    });

    it('classifies "상품" variants to product domain', () => {
      expect(classifyByKeyword('상품 상세정보')).toBe('product');
      expect(classifyByKeyword('제품 설명')).toBe('product');
    });

    it('returns null for unclassifiable text', () => {
      expect(classifyByKeyword('hello world')).toBeNull();
      expect(classifyByKeyword('알 수 없는 내용')).toBeNull();
    });

    it('normalizes whitespace and case before matching', () => {
      expect(classifyByKeyword('배  송')).toBe('shipping');
      expect(classifyByKeyword('  배송  ')).toBe('shipping');
    });
  });

  describe('getDomainDefinition', () => {
    it('returns definition for valid ID', () => {
      const def = getDomainDefinition('shipping');
      expect(def).not.toBeNull();
      expect(def?.id).toBe('shipping');
      expect(def?.label).toBe('배송');
    });

    it('returns null for invalid ID', () => {
      const def = getDomainDefinition('invalid' as any);
      expect(def).toBeNull();
    });
  });

  describe('getAllDomainIds', () => {
    it('returns all domain IDs', () => {
      const ids = getAllDomainIds();
      expect(ids).toHaveLength(13);
      expect(ids).toContain('shipping');
      expect(ids).toContain('payment');
      expect(ids).toContain('other');
    });
  });
});
