import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_ARTICLES, articlesByPillar, getArticle, relevantArticles } from './knowledge';

describe('knowledge catalog', () => {
  it('has unique ids and non-empty bodies', () => {
    const ids = KNOWLEDGE_ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(KNOWLEDGE_ARTICLES.every((a) => a.body.length > 0 && a.title.length > 0)).toBe(true);
  });

  it('resolves an article by id', () => {
    expect(getArticle('sleep')?.pillar).toBe('sleep');
    expect(getArticle('nope')).toBeUndefined();
  });

  it('groups every article by pillar', () => {
    const total = articlesByPillar().reduce((n, g) => n + g.articles.length, 0);
    expect(total).toBe(KNOWLEDGE_ARTICLES.length);
  });

  it('resolves and dedupes relevant articles, skipping unknowns', () => {
    const arts = relevantArticles(['sleep', 'sleep', undefined, 'acwr', 'ghost']);
    expect(arts.map((a) => a.id)).toEqual(['sleep', 'acwr']);
  });
});
