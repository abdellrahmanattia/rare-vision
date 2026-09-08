'use strict';

/* ==========================================================================
   RARE VISION — main.js (homepage)
   Requires js/shared.js loaded first (CONFIG, formatters, renderStars).
   Loaded as an ES module — imports Firestore data helpers + the shared cart
   drawer. Product cards now link to product.html?id=... (a real page) —
   the old in-page product modal is gone, see product.html/js/product.js.
   ========================================================================== */

import { getNewArrivals, getBestSellers } from './products-data.js';
import { initCartDrawer } from './cart.js';

const BRAND_LOGOS = [
  { name: 'Louis Vuitton', slug: 'louis-vuitton' },
  { name: 'Gucci', slug: 'gucci' },
  { name: 'Chanel', slug: 'chanel' },
  { name: 'Hermès', slug: 'hermes' },
  { name: 'Zara', slug: 'zara' },
  { name: 'H&M', slug: 'hm' },
  { name: 'Tommy Hilfiger', slug: 'tommy-hilfiger' },
  { name: 'Calvin Klein', slug: 'calvin-klein' },
  { name: 'Nike', slug: 'nike' },
  { name: 'Adidas', slug: 'adidas' },
  { name: 'American Eagle', slug: 'american-eagle' },
  { name: 'Puma', slug: 'puma' },
  { name: 'Lacoste', slug: 'lacoste' },
  { name: 'U.S. Polo Assn.', slug: 'us-polo-assn' },
  { name: 'New Balance', slug: 'new-balance' },
  { name: 'Coach', slug: 'coach' },
  { name: 'Casio', slug: 'casio' },
];

const dom = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  [
    'newArrivalsGrid', 'bestSellersGrid', 'brandTrack',
  ].forEach((id) => { dom[id] = document.getElementById(id); });

  initCartDrawer();
  renderBrandMarquee();

  try {
    const [newArrivals, bestSellers] = await Promise.all([getNewArrivals(3), getBestSellers(3)]);
    dom.newArrivalsGrid.innerHTML = newArrivals.length
      ? newArrivals.map((p) => homeProductCardHtml(p)).join('')
      : '<p style="color:var(--text-muted);font-size:13.5px;">No new arrivals yet — add some in the admin dashboard.</p>';
    dom.bestSellersGrid.innerHTML = bestSellers.length
      ? bestSellers.map((p, i) => homeProductCardHtml(p, i + 1)).join('')
      : '<p style="color:var(--text-muted);font-size:13.5px;">No best sellers yet — add some in the admin dashboard.</p>';
    bindProductGridEvents();
  } catch (err) {
    console.warn('Could not load products from Firestore. Is js/firebase-init.js configured?', err);
    dom.newArrivalsGrid.innerHTML = '<p style="color:var(--text-muted);font-size:13.5px;">Products will appear here once Firebase is configured (see README.md).</p>';
  }
}

function isProductAvailable(p) {
  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  if (sizes.length > 0) return sizes.some((s) => s.stockStatus === 'In Stock');
  return p.inStock !== false;
}

function primaryImage(p) {
  if (Array.isArray(p.colorVariants) && p.colorVariants[0]?.images?.[0]) return p.colorVariants[0].images[0];
  return p.image || '';
}

function homeProductCardHtml(p, rank) {
  const onSale = typeof p.compareAtPrice === 'number' && p.compareAtPrice > p.price;
  const discountPct = onSale ? Math.round(((p.compareAtPrice - p.price) / p.compareAtPrice) * 100) : 0;
  const available = isProductAvailable(p);
  const badges = Array.isArray(p.badges) ? p.badges : [];
  const colors = Array.isArray(p.colors) ? p.colors : [];
  const fitSpec = (p.specifications || []).find((s) => (s.label || '').toLowerCase() === 'fit');
  const subtitle = fitSpec ? fitSpec.value : '';

  const cornerBadge = onSale
    ? `<span class="home-badge sale">${discountPct}% OFF</span>`
    : badges[0] ? `<span class="home-badge">${escapeHtml(badges[0])}</span>` : '';
  const rankBadge = rank ? `<span class="home-rank-badge">#${rank}</span>` : '';
  const ctaLabel = !available ? 'Out of Stock' : 'Choose Options';

  return `
  <article class="home-card" data-id="${escapeHtml(p.id)}">
    <a class="home-card-media" href="product.html?id=${encodeURIComponent(p.id)}">
      <img src="${escapeHtml(primaryImage(p))}" alt="${escapeHtml(p.name)}" loading="lazy">
      ${cornerBadge}${rankBadge}
      ${!available ? '<div class="out-of-stock">Out of Stock</div>' : ''}
      <span class="choose-options-btn" ${!available ? 'disabled' : ''}>${ctaLabel}</span>
    </a>
    <div class="home-card-body">
      ${colors.length ? `<div class="swatch-row">${colors.map((c) => `<span class="swatch-dot" style="background:${escapeHtml(c)}"></span>`).join('')}</div>` : ''}
      <a class="home-card-name" href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a>
      ${subtitle ? `<p class="home-card-subtitle">${escapeHtml(subtitle)}</p>` : ''}
      <div class="home-price-row">
        ${onSale ? `<span class="home-price-old">${formatPrice(p.compareAtPrice)}</span>` : ''}
        <span class="home-price ${onSale ? 'sale' : ''}">${formatPrice(p.price)}</span>
      </div>
      <div class="home-rating-row">
        <span class="stars" aria-hidden="true">${renderStars(p.averageRating)}</span>
        <span class="rating-count">(${Number(p.reviewCount) || 0})</span>
      </div>
    </div>
  </article>`;
}

function bindProductGridEvents() {
  // Reserved for future quick-add wiring on home cards; currently every
  // card action navigates straight to the product page so shoppers pick a
  // size there (avoids silently adding the wrong size to the bag).
}

function renderBrandMarquee() {
  const itemHtml = (b) => `
    <div class="brand-logo-item" data-brand="${escapeHtml(b.name)}">
      <img class="brand-logo" src="assets/logos/${b.slug}.svg" alt="${escapeHtml(b.name)}" loading="lazy">
    </div>`;
  const itemsHtml = BRAND_LOGOS.map(itemHtml).join('');
  dom.brandTrack.innerHTML = itemsHtml + itemsHtml;
  dom.brandTrack.querySelectorAll('.brand-logo').forEach((img) => {
    img.addEventListener('error', () => handleLogoError(img), { once: true });
  });
  dom.brandTrack.addEventListener('click', (e) => {
    const item = e.target.closest('.brand-logo-item');
    if (!item) return;
    window.location.href = `shop.html?search=${encodeURIComponent(item.dataset.brand)}`;
  });
}

function handleLogoError(imgEl) {
  const wrapper = imgEl.closest('.brand-logo-item');
  if (!wrapper) return;
  const fallback = document.createElement('span');
  fallback.className = 'brand-logo-fallback';
  fallback.textContent = wrapper.dataset.brand || '';
  imgEl.replaceWith(fallback);
}
