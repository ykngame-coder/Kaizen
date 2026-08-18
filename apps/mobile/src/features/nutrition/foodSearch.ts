import type { FoodItem } from '@supotsu/core';
import { normalizeOffProduct, normalizeOffSearch, type OffProduct } from '@supotsu/connectors';

/**
 * Open Food Facts network layer. Pure normalization lives in @supotsu/connectors
 * (tested); this file only does the HTTP calls. OFF is free and open — no key.
 */

const FIELDS = 'code,product_name,brands,serving_quantity,nutriments';
const HEADERS = { 'User-Agent': 'Supotsu/0.1 (nutrition tracking)' };

/** A search hit from the Search-a-licious API — same fields as OffProduct, but `brands` is an array. */
interface OffSearchHit extends Omit<OffProduct, 'brands'> {
  brands?: string[];
}

/**
 * Full-text food search (returns already-normalized items). Uses OFF's
 * current Search-a-licious API — the legacy `cgi/search.pl` endpoint this
 * used to call now returns 503 (confirmed via a TestFlight report: barcode
 * lookup, on the still-live v2 product API, kept working throughout).
 */
export async function searchFoods(query: string): Promise<FoodItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url =
    'https://search.openfoodfacts.org/search' +
    `?q=${encodeURIComponent(q)}` +
    `&page_size=20&fields=${FIELDS}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Recherche indisponible (${res.status}).`);
  const data = (await res.json()) as { hits?: OffSearchHit[] };
  // brands comes back as a string[] here vs a comma-joined string from the
  // v2 product API — normalize to what normalizeOffSearch already expects.
  const products: OffProduct[] = (data.hits ?? []).map((h) => ({
    ...h,
    brands: h.brands?.join(', '),
  }));
  return normalizeOffSearch(products);
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
