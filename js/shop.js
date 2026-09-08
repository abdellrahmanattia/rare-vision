'use strict';

/* ==========================================================================
   RARE VISION — shop.js
   Powers shop.html: the full catalog / "View all" gallery. Reads its
   initial filters from the URL (?category=, ?gender=, ?search=,
   ?filter=new|bestsellers) so links from the homepage, header search bar,
   and footer all land pre-filtered — then behaves like a normal in-page
   filter UI from there. Requires js/shared.js loaded first.
   ========================================================================== */

import { getAllProducts, getNewArrivals, getBestSellers } from './products-data.js';
import { initCartDrawer } from './cart.js';

const dom = {};
const state = { products: [], activeCategory: 'all', activeGender: 'all', searchTerm: '' };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  [
    'productsGrid', 'emptyState', 'loadingState', 'resultsMeta',
    'searchInput', 'searchClear', 'categoryPills', 'resetFilters',
    'genderDropdown', 'genderDropdownBtn', 'genderDropdownLabel', 'genderDropdownMenu',
    'shopPageTitle',
  ].forEach((id) => { dom[id] = document.getElementById(id); });

  initCartDrawer();

  const params = new URLSearchParams(window.location.search);
  const urlCategory = params.get('category');
  const urlGender = params.get('gender');
  const urlSearch = params.get('search');
  const urlFilter = params.get('filter'); // 'new' | 'bestsellers'

  if (urlSearch) { dom.searchInput.value = urlSearch; state.searchTerm = urlSearch.toLowerCase(); dom.searchClear.hidden = false; }
  if (urlGender) { setActiveGender(urlGender); }
  if (urlCategory) { setActiveCategory(urlCategory); }

  if (urlFilter === 'new') dom.shopPageTitle.textContent = 'New Arrivals';
  else if (urlFilter === 'bestsellers') dom.shopPageTitle.textContent = 'Best Sellers';
  else if (urlCategory) dom.shopPageTitle.textContent = urlCategory;
  else if (urlGender) dom.shopPageTitle.textContent = urlGender;

  try {
    if (urlFilter === 'new') {
      state.products = await getNewArrivals(24);
    } else if (urlFilter === 'bestsellers') {
      state.products = await getBestSellers(24);
    } else {
      state.products = await getAllProducts();
    }
  } catch (err) {
    console.warn('Could not load products from Firestore:', err);
    dom.loadingState.innerHTML = '<p>Could not load products. Make sure js/firebase-init.js has your Firebase config (see README.md).</p>';
    return;
  }
  dom.loadingState.hidden = true;

  bindStaticEvents();
  applyFilters();
}

function isProductAvailable(p) {
  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  if (sizes.length > 0) return sizes.some((s) => s.stockStatus === 'In Stock');
  return p.inStock !== false;
}

function productMatchesCategory(p, category) {
  if (category === 'all') return true;
  return (p.category || '').toLowerCase() === category.toLowerCase();
}

function applyFilters() {
  let list = state.products;
  if (state.activeCategory !== 'all') list = list.filter((p) => productMatchesCategory(p, state.activeCategory));
  if (state.activeGender !== 'all') list = list.filter((p) => p.targetCategory === state.activeGender || p.targetCategory === 'All Genders');
  if (state.searchTerm) {
    const q = state.searchTerm;
    list = list.filter((p) => (p.name || '').toLowerCase().includes(q)
      || (p.brand || '').toLowerCase().includes(q)
      || (p.styleName || '').toLowerCase().includes(q));
  }
  renderGrid(list);
}

function renderGrid(list) {
  dom.resultsMeta.textContent = `${list.length} result${list.length === 1 ? '' : 's'}`;
  if (list.length === 0) {
    dom.productsGrid.innerHTML = '';
    dom.emptyState.hidden = false;
    return;
  }
  dom.emptyState.hidden = true;
  dom.productsGrid.innerHTML = list.map((p) => shopProductCardHtml(p)).join('');
}

function primaryImage(p) {
  if (Array.isArray(p.colorVariants) && p.colorVariants[0]?.images?.[0]) return p.colorVariants[0].images[0];
  return p.image || '';
}

function shopProductCardHtml(p) {
  const onSale = typeof p.compareAtPrice === 'number' && p.compareAtPrice > p.price;
  const available = isProductAvailable(p);
  const badges = Array.isArray(p.badges) ? p.badges : [];
  const displayName = p.styleName && p.styleName.trim() ? p.styleName : p.name;
  const ctaLabel = !available ? 'Out of Stock' : 'Select Size';

  return `
  <article class="shop-card" data-id="${escapeHtml(p.id)}">
    <a class="shop-card-media" href="product.html?id=${encodeURIComponent(p.id)}">
      ${badges.length ? `<div class="shop-badge-stack">${badges.map((b) => `<span class="shop-badge">${escapeHtml(b)}</span>`).join('')}</div>` : ''}
      ${onSale ? '<span class="shop-badge sale">Sale</span>' : ''}
      <img src="${escapeHtml(primaryImage(p))}" alt="${escapeHtml(p.name)}" loading="lazy">
      ${!available ? '<div class="out-of-stock">Out of Stock</div>' : ''}
    </a>
    <div class="shop-card-body">
      <a class="shop-card-title" href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(displayName)}</a>
      <span class="shop-card-brand">.${escapeHtml((p.brand || '').toUpperCase())}</span>
      <p class="shop-card-fullname">${escapeHtml(p.name)}</p>
      <div class="shop-rating-row">
        <span class="rating-count">(${Number(p.reviewCount) || 0})</span>
        <span class="stars" aria-hidden="true">${renderStars(p.averageRating)}</span>
      </div>
      <div class="shop-price-row">
        ${onSale ? `<span class="shop-price-old">${formatPrice(p.compareAtPrice)}</span>` : ''}
        <span class="shop-price ${onSale ? 'sale' : ''}">${formatPrice(p.price)}</span>
      </div>
      <a class="btn-select-size" href="product.html?id=${encodeURIComponent(p.id)}" style="display:flex;align-items:center;justify-content:center;text-decoration:none;">${ctaLabel}</a>
    </div>
  </article>`;
}

function setActiveCategory(category) {
  state.activeCategory = category;
  dom.categoryPills.querySelectorAll('.pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.category === category);
  });
}

function setActiveGender(gender) {
  state.activeGender = gender;
  const label = gender === 'all' ? 'All Genders' : gender;
  dom.genderDropdownLabel.textContent = label;
  dom.genderDropdownMenu.querySelectorAll('li').forEach((li) => {
    li.classList.toggle('selected', li.dataset.value === gender);
  });
}

function bindStaticEvents() {
  dom.categoryPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    setActiveCategory(pill.dataset.category);
    applyFilters();
  });

  dom.genderDropdownBtn.addEventListener('click', () => {
    const open = dom.genderDropdownMenu.hidden;
    dom.genderDropdownMenu.hidden = !open;
    dom.genderDropdownBtn.setAttribute('aria-expanded', String(open));
  });
  dom.genderDropdownMenu.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    setActiveGender(li.dataset.value);
    dom.genderDropdownMenu.hidden = true;
    applyFilters();
  });
  document.addEventListener('click', (e) => {
    if (!dom.genderDropdown.contains(e.target)) dom.genderDropdownMenu.hidden = true;
  });

  let searchDebounce;
  dom.searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.searchTerm = dom.searchInput.value.trim().toLowerCase();
      dom.searchClear.hidden = state.searchTerm.length === 0;
      applyFilters();
    }, 200);
  });
  dom.searchClear.addEventListener('click', () => {
    dom.searchInput.value = '';
    state.searchTerm = '';
    dom.searchClear.hidden = true;
    applyFilters();
  });

  dom.resetFilters.addEventListener('click', () => {
    setActiveCategory('all');
    setActiveGender('all');
    dom.searchInput.value = '';
    state.searchTerm = '';
    dom.searchClear.hidden = true;
    applyFilters();
  });
}
