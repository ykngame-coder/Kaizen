import type { FoodItem } from '@supotsu/core';
import { normalizeOffProduct, normalizeOffSearch } from '@supotsu/connectors';

/**
 * Open Food Facts network layer. Pure normalization lives in @supotsu/connectors
 * (tested); this file only does the HTTP calls. OFF is free and open — no key.
 */

const FIELDS = 'code,product_name,brands,serving_quantity,nutriments';
const HEADERS = { 'User-Agent': 'Supotsu/0.1 (nutrition tracking)' };

/** Full-text food search (returns already-normalized items). */
export async function searchFoods(query: string): Promise<FoodItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url =
    'https://world.openfoodfacts.org/cgi/search.pl' +
    `?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Recherche indisponible (${res.status}).`);
  const data = (await res.json()) as { products?: unknown[] };
  return normalizeOffSearch(data.products as never);
}

/** Look up a single product by its barcode. */
export async function getFoodByBarcode(barcode: string): Promise<FoodItem | null> {
  const code = barcode.replace(/\D/g, '');
  if (!code) return null;
  const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Produit introuvable (${res.status}).`);
  const data = (await res.json()) as { status?: number; product?: unknown };
  if (data.status !== 1) return null;
  return normalizeOffProduct(data.product as never);
}
