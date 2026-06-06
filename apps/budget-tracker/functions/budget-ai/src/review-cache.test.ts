import { describe, expect, it } from 'vitest';
import type { Category } from '@transformotion/budget-domain';
import { REVIEW_CACHE_SCHEMA_VERSION, buildReviewTransactionsHash } from './review-cache';

const categories: Category[] = [
  {
    categoryId: 'cat-food',
    name: 'Groceries',
    type: 'regular',
    displayOrder: 1,
    subcategories: [
      { subcategoryId: 'sub-supermarket', name: 'Supermarket', displayOrder: 1 },
      { subcategoryId: 'sub-butcher', name: 'Butcher', displayOrder: 2 },
    ],
  },
];

describe('buildReviewTransactionsHash', () => {
  it('is stable for equivalent normalized transaction input', () => {
    const a = buildReviewTransactionsHash({
      transactions: [{ index: 0, description: ' Woolworths   Market ', amount: '-42.1' }],
      categories,
      settings: { confidenceThreshold: 'medium' },
    });
    const b = buildReviewTransactionsHash({
      transactions: [{ index: 0, description: 'woolworths market', amount: '-42.10' }],
      categories,
      settings: { confidenceThreshold: 'medium' },
    });

    expect(a).toBe(b);
  });

  it('changes when transaction input changes', () => {
    const a = buildReviewTransactionsHash({
      transactions: [{ index: 0, description: 'Woolworths', amount: '-42.10' }],
      categories,
    });
    const b = buildReviewTransactionsHash({
      transactions: [{ index: 0, description: 'Coles', amount: '-42.10' }],
      categories,
    });

    expect(a).not.toBe(b);
  });

  it('changes when category inputs change', () => {
    const a = buildReviewTransactionsHash({
      transactions: [{ index: 0, description: 'Woolworths', amount: '-42.10' }],
      categories,
    });
    const b = buildReviewTransactionsHash({
      transactions: [{ index: 0, description: 'Woolworths', amount: '-42.10' }],
      categories: [{ ...categories[0], name: 'Food' }],
    });

    expect(a).not.toBe(b);
  });

  it('uses an explicit provider-agnostic schema version', () => {
    expect(REVIEW_CACHE_SCHEMA_VERSION).toContain('provider-agnostic');
  });
});
