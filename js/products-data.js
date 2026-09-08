'use strict';

/* ==========================================================================
   RARE VISION — products-data.js
   Every read of the `products` Firestore collection goes through here so
   the query logic (New Arrivals, Best Sellers, recommendations, etc.) lives
   in exactly one place. Loaded as an ES module.
   ========================================================================== */

import {
  db, collection, doc, getDoc, getDocs, query, where, orderBy, limit,
} from './firebase-init.js';

const PRODUCTS_COL = 'products';
let _cache = null; // simple in-memory cache for a single page view

// Fetches the whole catalog once per page load (fine for a boutique-sized
// catalog; for a very large catalog, swap this for paginated/indexed
// queries per section instead of filtering in memory).
export async function getAllProducts(forceRefresh = false) {
  if (_cache && !forceRefresh) return _cache;
  const snap = await getDocs(collection(db, PRODUCTS_COL));
  _cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return _cache;
}

export async function getProductById(id) {
  const all = await getAllProducts();
  const hit = all.find((p) => p.id === id);
  if (hit) return hit;
  // fall back to a direct doc read in case the id isn't in the cached page
  // (e.g. a brand-new product linked to directly before the cache warmed)
  const snap = await getDoc(doc(db, PRODUCTS_COL, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
}

export async function getNewArrivals(count = 3) {
  const all = await getAllProducts();
  return all
    .filter((p) => Array.isArray(p.badges) && p.badges.includes('New Arrival'))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .slice(0, count);
}

// Best Sellers: admin-set `rank` wins (lower number = higher position);
// products without a rank fall back to review count, matching the
// original site's automatic behavior.
export async function getBestSellers(count = 3) {
  const all = await getAllProducts();
  const eligible = all.filter((p) => Array.isArray(p.badges) && p.badges.includes('Best Seller'));
  eligible.sort((a, b) => {
    const ra = Number.isFinite(a.rank) ? a.rank : Infinity;
    const rb = Number.isFinite(b.rank) ? b.rank : Infinity;
    if (ra !== rb) return ra - rb;
    return (b.reviewCount || 0) - (a.reviewCount || 0);
  });
  return eligible.slice(0, count);
}

export async function getProductsByCategory(category, opts = {}) {
  const all = await getAllProducts();
  let list = all;
  if (category && category !== 'All') {
    list = list.filter((p) => (p.category || '').toLowerCase() === category.toLowerCase());
  }
  if (opts.gender && opts.gender !== 'All Genders') {
    list = list.filter((p) => p.targetCategory === opts.gender || p.targetCategory === 'All Genders');
  }
  if (opts.productType) {
    list = list.filter((p) => p.productType === opts.productType);
  }
  if (opts.search) {
    const q = opts.search.toLowerCase();
    list = list.filter((p) => (p.name || '').toLowerCase().includes(q)
      || (p.brand || '').toLowerCase().includes(q)
      || (p.styleName || '').toLowerCase().includes(q));
  }
  return list;
}

// "WE RECOMMEND": other items in the same category, excluding the current one.
export async function getSimilarCategoryProducts(product, count = 4) {
  const all = await getAllProducts();
  return all
    .filter((p) => p.id !== product.id && p.category === product.category)
    .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0))
    .slice(0, count);
}

// "You might also like": highest sales-volume items overall, excluding the
// current product and anything already used in "We Recommend".
export async function getHighVolumeProducts(excludeIds = [], count = 4) {
  const all = await getAllProducts();
  return all
    .filter((p) => !excludeIds.includes(p.id))
    .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0))
    .slice(0, count);
}

// "Best Seller in this Category": strict priority —
//   1) top-ranked Best Seller product in the SAME category (excluding current)
//   2) if none, top-ranked Best Seller overall
//   3) if still none, top reviewCount products overall (fallback so the
//      section never renders empty on a small catalog)
export async function getBestSellerInCategory(product, count = 3) {
  const all = await getAllProducts();
  const bestSellers = all.filter((p) => p.id !== product.id && Array.isArray(p.badges) && p.badges.includes('Best Seller'));

  const rankSort = (a, b) => {
    const ra = Number.isFinite(a.rank) ? a.rank : Infinity;
    const rb = Number.isFinite(b.rank) ? b.rank : Infinity;
    if (ra !== rb) return ra - rb;
    return (b.reviewCount || 0) - (a.reviewCount || 0);
  };

  const sameCategory = bestSellers.filter((p) => p.category === product.category).sort(rankSort);
  if (sameCategory.length) return sameCategory.slice(0, count);

  const overall = bestSellers.sort(rankSort);
  if (overall.length) return overall.slice(0, count);

  return all
    .filter((p) => p.id !== product.id)
    .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0))
    .slice(0, count);
}

export function invalidateProductsCache() {
  _cache = null;
}
