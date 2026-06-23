/**
 * Canonical top-level domain taxonomy for the wiki.
 *
 * Design principles (Oracle-informed hybrid approach):
 * - DomainId is open string (not closed enum) - runtime registration allowed
 * - LLM returns free-form Korean labels → normalized to canonical IDs
 * - DOMAIN_CATALOG is seed data (13 known domains), not exhaustive list
 * - New domains auto-register through normalization layer
 *
 * Examples:
 * - LLM returns "배송" → normalizes to "shipping"
 * - LLM returns "배송비용" → normalizes to "shipping" (via alias matching)
 * - LLM returns "신규개념" → registers as new canonical "신규개념"
 */

export type DomainId = string;

export interface DomainDefinition {
  readonly id: DomainId;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly description: string;
}

/**
 * Seed catalog of known top-level domains.
 * This is NOT an exhaustive list - new domains can be registered at runtime.
 *
 * When adding seed domains:
 * 1. Add entry to DOMAIN_CATALOG
 * 2. Update KOREAN_TO_CANONICAL map (automatically derived)
 * 3. Update LLM prompt examples in openrouter-document-summary-generator.ts
 */
export const DOMAIN_CATALOG: readonly DomainDefinition[] = [
  {
    id: 'shipping',
    label: '배송',
    aliases: ['배송비용', '배송료', '배송시간', '배송방법', '배송지', '택배'],
    description: '배송, 물류, 운송 관련 정보',
  },
  {
    id: 'payment',
    label: '결제',
    aliases: ['결제수단', '결제방법', '지불', '카드결제', '계좌이체'],
    description: '결제, 지불 수단 및 방법',
  },
  {
    id: 'refund',
    label: '환불',
    aliases: ['환불정책', '환불절차', '반품', '교환', '취소'],
    description: '환불, 반품, 교환, 취소 정책',
  },
  {
    id: 'product',
    label: '상품',
    aliases: ['제품', '상품정보', '제품설명', '아이템'],
    description: '상품, 제품 정보 및 상세',
  },
  {
    id: 'customer',
    label: '고객',
    aliases: ['회원', '사용자', '고객정보', '회원가입', '로그인'],
    description: '고객, 회원 관리 및 인증',
  },
  {
    id: 'order',
    label: '주문',
    aliases: ['주문내역', '주문확인', '주문취소', '주문상태'],
    description: '주문 처리 및 관리',
  },
  {
    id: 'inventory',
    label: '재고',
    aliases: ['재고관리', '입고', '출고', '재고현황'],
    description: '재고, 입출고 관리',
  },
  {
    id: 'marketing',
    label: '마케팅',
    aliases: ['프로모션', '할인', '쿠폰', '이벤트', '광고'],
    description: '마케팅, 프로모션, 이벤트',
  },
  {
    id: 'support',
    label: '고객지원',
    aliases: ['고객센터', '문의', 'FAQ', '도움말', '지원'],
    description: '고객 지원, 문의, FAQ',
  },
  {
    id: 'tech-stack',
    label: '기술스택',
    aliases: ['기술', '개발', '아키텍처', '프레임워크', '라이브러리'],
    description: '기술 스택, 개발 도구',
  },
  {
    id: 'operations',
    label: '운영',
    aliases: ['운영관리', '모니터링', '배포', '인프라'],
    description: '시스템 운영 및 인프라',
  },
  {
    id: 'policy',
    label: '정책',
    aliases: ['이용약관', '개인정보', '규정', '정책'],
    description: '정책, 약관, 규정',
  },
  {
    id: 'other',
    label: '기타',
    aliases: [],
    description: '위 분류에 해당하지 않는 내용',
  },
] as const;

/**
 * Korean label to canonical domain ID mapping.
 * Used for deterministic fallback when LLM classification fails.
 */
export const KOREAN_TO_CANONICAL: ReadonlyMap<string, DomainId> = new Map(
  DOMAIN_CATALOG.flatMap((def) =>
    [def.label, ...def.aliases].map((koreanLabel) => [
      koreanLabel.toLowerCase().replace(/\s+/g, ''),
      def.id,
    ]),
  ),
);

/**
 * Find canonical domain ID from Korean text using keyword matching.
 * Returns null if no match found.
 *
 * Example:
 * - classifyByKeyword("배송비용 안내") → "shipping"
 * - classifyByKeyword("상품 상세정보") → "product"
 */
export function classifyByKeyword(text: string): DomainId | null {
  const normalized = text.toLowerCase().replace(/\s+/g, '');

  for (const [koreanLabel, domainId] of KOREAN_TO_CANONICAL.entries()) {
    if (normalized.includes(koreanLabel)) {
      return domainId;
    }
  }

  return null;
}

/**
 * Get domain definition by ID.
 */
export function getDomainDefinition(id: DomainId): DomainDefinition | null {
  return DOMAIN_CATALOG.find((def) => def.id === id) ?? null;
}

/**
 * Get all valid domain IDs for LLM enum schema.
 */
export function getAllDomainIds(): readonly DomainId[] {
  return DOMAIN_CATALOG.map((def) => def.id);
}
