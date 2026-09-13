/* ==========================================================================
   RARE VISION — js/product.js
   Standalone Product Detail Page (product.html) — core layout, image
   gallery + lightbox, color/size variant engine, quantity stepper,
   waitlist ("Notify Me") flow, Complete the Look / We Recommend rails,
   and the four content accordions (Description, Product Details,
   Delivery, Returns & Exchanges).

   Loaded as type="module" from product.html, AFTER js/firebase-config.js
   and js/firebase-data.js (see those files' own header comments on load
   order). Reads window.RareVisionFirebase, set up by firebase-data.js,
   for every Firestore read/write — this file never talks to Firestore
   directly, keeping firebase-data.js the single source of truth for
   collection access.

   Product identity: product.html?id=<Firestore doc id> (also accepts
   ?pid=). Falls back to the first published product if no id is present
   (handy while wiring up links from other pages), and shows the
   "not found" state if the id doesn't resolve to a real document.

   Cart integration: if the site's shared cart module is present on the
   page as window.RareVisionCart.addItem(), this defers to it. Otherwise
   it falls back to a small localStorage-based cart (key: rareVisionCart)
   so "ADD TO BAG" still works stand-alone. Swap ADD_TO_BAG below to call
   your real cart module directly if its API differs from addItem().
   ========================================================================== */

import { auth } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

const params = new URLSearchParams(window.location.search);
const requestedId = params.get('id') || params.get('pid');

// Tracks the signed-in user's email (if any) so the "Report this product"
// modal can pre-fill it. Firebase Auth resolves asynchronously, so this
// starts empty and is kept up to date as auth state changes.
let currentUserEmail = '';
onAuthStateChanged(auth, (user) => {
  currentUserEmail = user?.email || '';
});

const el = (id) => document.getElementById(id);

/* ---- DOM refs ---------------------------------------------------------- */
const loadingState  = el('pdpLoading');
const notFoundState = el('pdpNotFound');
const content       = el('pdpContent');

const sliderEl     = el('pdpSlider');
const sliderTrack  = el('pdpSliderTrack');
const sliderDots   = el('pdpDots');
const prevBtn      = el('pdpPrev');
const nextBtn      = el('pdpNext');
const expandBtn    = el('pdpExpand');

const badgeEl       = el('pdpBadge');
const titleEl       = el('pdpTitle');
const priceOldEl    = el('pdpPriceOld');
const priceActiveEl = el('pdpPriceActive');
const ratingRow     = el('pdpRatingRow');
const starsEl       = el('pdpStars');
const ratingValueEl = el('pdpRatingValue');
const ratingCountEl = el('pdpRatingCount');

const featuresBlock = el('pdpFeaturesBlock');
const featuresText  = el('pdpFeaturesText');
const learnMoreBtn  = el('pdpLearnMore');

const colorBlock  = el('pdpColorBlock');
const colorNameEl = el('pdpColorName');
const colorRow    = el('pdpColorRow');

const categoryCol   = el('pdpCategoryCol');
const categoryPill  = el('pdpCategoryPill');

const qtyValueEl  = el('pdpQtyValue');
const qtyMinusBtn = el('pdpQtyMinus');
const qtyPlusBtn  = el('pdpQtyPlus');

const sizeBlock = el('pdpSizeBlock');
const sizeGrid  = el('pdpSizeGrid');

const ctaBtn = el('pdpCta');

const completeLookSection = el('completeLookSection');
const completeLookScroll  = el('completeLookScroll');

const reviewsAvgStars      = el('reviewsAvgStars');
const reviewsAvgValue      = el('reviewsAvgValue');
const reviewsCountText     = el('reviewsCountText');
const ratingBarsEl         = el('ratingBars');
const ratingsCalcToggle    = el('ratingsCalcToggle');
const ratingsCalcCopy      = el('ratingsCalcCopy');
const reviewsCountryHeading = el('reviewsCountryHeading');
const reviewsSortSelect    = el('reviewsSortSelect');
const reviewCardsGrid      = el('reviewCardsGrid');
const reviewPagination     = el('reviewPagination');
const writeReviewBtn       = el('writeReviewBtn');

const descriptionText = el('pdpDescriptionText');
const detailsText     = el('pdpDetailsText');
const accordionGroup  = el('pdpAccordionGroup');
const reportBtn       = el('reportProductBtn');

const recommendSection = el('recommendSection');
const recommendGrid    = el('recommendGrid');

const alsoLikeSection    = el('alsoLikeSection');
const alsoLikeGrid       = el('alsoLikeGrid');
const bestSellersSection = el('bestSellersSection');
const bestSellersGrid    = el('bestSellersGrid');

const stickyBar   = el('pdpStickyBar');
const stickyThumb = el('pdpStickyThumb');
const stickyName  = el('pdpStickyName');
const stickyPrice = el('pdpStickyPrice');
const stickyCta   = el('pdpStickyCta');

const lightboxOverlay = el('lightboxOverlay');
const lightboxModal   = el('lightboxModal');
const lightboxImage   = el('lightboxImage');
const lightboxClose   = el('lightboxClose');
const lightboxPrev    = el('lightboxPrev');
const lightboxNext    = el('lightboxNext');

const waitlistOverlay    = el('waitlistOverlay');
const waitlistModal      = el('waitlistModal');
const waitlistClose      = el('waitlistClose');
const waitlistForm       = el('waitlistForm');
const waitlistEmailInput = el('waitlistEmail');
const waitlistError      = el('waitlistError');
const waitlistSub        = el('waitlistSub');
const waitlistSubmit     = el('waitlistSubmit');
const waitlistSuccess    = el('waitlistSuccess');

const reportOverlay      = el('reportOverlay');
const reportModal        = el('reportModal');
const reportClose        = el('reportClose');
const reportForm         = el('reportForm');
const reportEmailInput   = el('reportEmail');
const reportMessageInput = el('reportMessage');
const reportError        = el('reportError');
const reportSubmit       = el('reportSubmit');
const reportSuccess      = el('reportSuccess');

const navToggle = el('navToggle');
const mainNav   = el('mainNav');
const cartBadge = el('cartBadge');

/* ---- Formatting helpers ------------------------------------------------ */
function formatMoney(amount, currency) {
  const value = Number(amount) || 0;
  return `${currency || 'LE'} ${value.toFixed(2)}`;
}

function starsMarkup(rating) {
  const filled = Math.round(Number(rating) || 0);
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="star${i <= filled ? ' filled' : ''}">★</span>`;
  }
  return html;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/* ---- State -------------------------------------------------------------- */
let product = null;
let activeColorIndex = 0;
let activeSlideIndex = 0;
let selectedSize = null;
let quantity = 1;
let pendingWaitlistSize = null;
let lightboxImages = [];
let lightboxIndex = 0;

/* ==========================================================================
   INIT
   ========================================================================== */
wireStaticInteractions();
init();

async function init() {
  try {
    const fb = window.RareVisionFirebase;
    if (!fb || typeof fb.fetchProductById !== 'function') {
      throw new Error('RareVisionFirebase.fetchProductById is not available.');
    }

    if (requestedId) {
      product = await fb.fetchProductById(requestedId);
    }

    if (!product && typeof fb.fetchProducts === 'function') {
      // No ?id= supplied — fall back to the first published product so the
      // page still renders something useful (e.g. while wiring up links).
      const all = await fb.fetchProducts();
      product = all[0] || null;
    }

    if (!product) {
      showNotFound();
      return;
    }

    renderProduct(product);
    loadRelatedProducts(product);
  } catch (err) {
    console.error('[product.js] Failed to load product:', err);
    showNotFound();
  }
}

function showNotFound() {
  loadingState.hidden = true;
  notFoundState.hidden = false;
}

/* ==========================================================================
   RENDER — product info, gallery, variant engine
   ========================================================================== */
function renderProduct(p) {
  loadingState.hidden = true;
  content.hidden = false;

  document.title = `${p.name || p.styleName || 'Product'} | Rare Vision`;

  if (p.badgeText) {
    badgeEl.textContent = p.badgeText;
    badgeEl.hidden = false;
  } else {
    badgeEl.hidden = true;
  }

  titleEl.textContent = p.name || p.styleName || '';

  renderPrice(p);
  renderRating(p);
  renderFeatures(p);

  activeColorIndex = 0;
  renderColors(p);
  renderCategory(p);
  renderQuantity();
  renderSizesForActiveColor();
  updateCta();

  renderDescriptionAndDetails(p);
  renderReviewsSummary(p);
  renderStaticReviewCards();

  updateStickyBar();
  watchStickyBar();
}

function renderPrice(p) {
  const hasDiscount = p.compareAtPrice && Number(p.compareAtPrice) > Number(p.price);
  if (hasDiscount) {
    priceOldEl.textContent = formatMoney(p.compareAtPrice, p.currency);
    priceOldEl.hidden = false;
  } else {
    priceOldEl.hidden = true;
  }
  priceActiveEl.textContent = formatMoney(p.price, p.currency);
}

function renderRating(p) {
  if (p.reviewsAvgRating == null) {
    ratingRow.hidden = true;
    return;
  }
  ratingRow.hidden = false;
  starsEl.innerHTML = starsMarkup(p.reviewsAvgRating);
  ratingValueEl.textContent = Number(p.reviewsAvgRating).toFixed(1);
  ratingCountEl.textContent = `(${p.reviewsCount || 0})`;
}

function renderFeatures(p) {
  const text = p.description || '';
  if (!text) {
    featuresBlock.hidden = true;
    return;
  }
  featuresBlock.hidden = false;
  featuresText.textContent = `FEATURES • ${text}`;
  featuresText.classList.add('clamped');
  learnMoreBtn.textContent = 'Learn more';
  learnMoreBtn.setAttribute('aria-expanded', 'false');
}

function renderColors(p) {
  const colors = Array.isArray(p.colors) ? p.colors : [];
  if (!colors.length) {
    colorBlock.hidden = true;
    renderGallery([]);
    return;
  }

  colorBlock.hidden = false;
  colorRow.innerHTML = '';

  colors.forEach((color, index) => {
    const thumb = (color.images && color.images[0]) || '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pdp-color-swatch' + (index === activeColorIndex ? ' active' : '');
    btn.setAttribute('aria-label', color.name || `Color ${index + 1}`);
    btn.setAttribute('aria-pressed', String(index === activeColorIndex));
    btn.innerHTML = thumb ? `<img src="${escapeAttr(thumb)}" alt="${escapeAttr(color.name || '')}">` : '';
    btn.addEventListener('click', () => selectColor(index));
    colorRow.appendChild(btn);
  });

  colorNameEl.textContent = colors[activeColorIndex]?.name || '';
  renderGallery(colors[activeColorIndex]?.images || []);
}

function selectColor(index) {
  if (!product) return;
  activeColorIndex = index;
  selectedSize = null;

  [...colorRow.children].forEach((child, i) => {
    child.classList.toggle('active', i === index);
    child.setAttribute('aria-pressed', String(i === index));
  });

  const colors = product.colors || [];
  colorNameEl.textContent = colors[index]?.name || '';
  renderGallery(colors[index]?.images || []);
  renderSizesForActiveColor();
  updateCta();
  updateStickyBar();
}

function renderCategory(p) {
  const cat = p.targetCategory || (Array.isArray(p.categories) ? p.categories[0] : '') || '';
  if (!cat) {
    categoryCol.hidden = true;
    return;
  }
  categoryCol.hidden = false;
  categoryPill.textContent = cat;
}

function renderQuantity() {
  quantity = 1;
  qtyValueEl.textContent = String(quantity);
}

function renderSizesForActiveColor() {
  if (product && product.hasSizes === false) {
    sizeBlock.hidden = true;
    selectedSize = 'N/A';
    return;
  }

  const color = product?.colors?.[activeColorIndex];
  const sizes = color && Array.isArray(color.sizes) ? color.sizes : [];

  if (!sizes.length) {
    sizeBlock.hidden = true;
    return;
  }

  sizeBlock.hidden = false;
  sizeGrid.innerHTML = '';

  sizes.forEach((size) => {
    const inStock = size.inStock !== false;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pdp-size-btn' + (inStock ? '' : ' unavailable');
    btn.innerHTML = `
      <span class="pdp-size-label">${escapeHtml(size.label)}</span>
      <span class="pdp-size-strike" aria-hidden="true"></span>
      <span class="pdp-size-mail" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/></svg>
      </span>`;

    if (inStock) {
      btn.addEventListener('click', () => selectSize(size.label, btn));
    } else {
      btn.setAttribute('aria-label', `${size.label} — out of stock, notify me when available`);
      btn.addEventListener('click', () => openWaitlistModal(size.label));
    }

    sizeGrid.appendChild(btn);
  });
}

function selectSize(label, btnEl) {
  selectedSize = label;
  [...sizeGrid.children].forEach((child) => child.classList.remove('selected'));
  btnEl.classList.add('selected');
  updateCta();
  updateStickyBar();
}

function updateCta() {
  const ready = Boolean(selectedSize);
  ctaBtn.disabled = !ready;
  ctaBtn.textContent = ready ? 'ADD TO BAG' : 'SELECT A SIZE';
  stickyCta.disabled = !ready;
  stickyCta.textContent = ready ? 'ADD TO BAG' : 'SELECT A SIZE';
}

/* ==========================================================================
   GALLERY / SLIDER / LIGHTBOX
   ========================================================================== */
function renderGallery(images) {
  const list = Array.isArray(images) ? images.filter(Boolean) : [];
  sliderTrack.innerHTML = '';
  sliderDots.innerHTML = '';
  activeSlideIndex = 0;

  if (!list.length) {
    sliderTrack.innerHTML = '<div class="pdp-slide"></div>';
    return;
  }

  list.forEach((src, i) => {
    const slide = document.createElement('div');
    slide.className = 'pdp-slide';
    slide.innerHTML = `<img src="${escapeAttr(src)}" alt="${escapeAttr(titleEl.textContent)} — view ${i + 1}">`;
    slide.addEventListener('click', () => openLightbox(list, i));
    sliderTrack.appendChild(slide);

    const dot = document.createElement('span');
    dot.className = i === 0 ? 'active' : '';
    dot.addEventListener('click', () => goToSlide(i));
    sliderDots.appendChild(dot);
  });

  updateSliderPosition();
}

function updateSliderPosition() {
  sliderTrack.style.transform = `translateX(-${activeSlideIndex * 100}%)`;
  [...sliderDots.children].forEach((dot, i) => dot.classList.toggle('active', i === activeSlideIndex));
}

function goToSlide(i) {
  const count = sliderTrack.children.length;
  if (!count) return;
  activeSlideIndex = ((i % count) + count) % count;
  updateSliderPosition();
}

function openLightbox(images, index) {
  if (!images.length) return;
  lightboxImages = images;
  lightboxIndex = index;
  updateLightboxImage();
  lightboxOverlay.classList.add('show');
  lightboxModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightboxOverlay.classList.remove('show');
  lightboxModal.classList.remove('open');
  document.body.style.overflow = '';
}

function updateLightboxImage() {
  lightboxImage.src = lightboxImages[lightboxIndex] || '';
  lightboxImage.alt = titleEl.textContent || '';
}

/* ==========================================================================
   ADD TO BAG
   ========================================================================== */
function addToBag() {
  if (!selectedSize || !product) return;

  const color = product.colors?.[activeColorIndex];
  const item = {
    productId: product.id,
    name: product.name || product.styleName || '',
    image: color?.images?.[0] || '',
    color: color?.name || '',
    size: selectedSize,
    qty: quantity,
    price: Number(product.price) || 0,
  };

  if (window.RareVisionCart && typeof window.RareVisionCart.addItem === 'function') {
    // Defer to the site's shared cart module if it's present on this page.
    window.RareVisionCart.addItem(item);
  } else {
    addToLocalCartFallback(item);
  }

  const previousLabel = ctaBtn.textContent;
  ctaBtn.textContent = 'ADDED ✓';
  stickyCta.textContent = 'ADDED ✓';
  setTimeout(() => {
    ctaBtn.textContent = previousLabel;
    stickyCta.textContent = previousLabel;
  }, 1400);
}

function addToLocalCartFallback(item) {
  const key = 'rareVisionCart';
  let cart = [];
  try {
    cart = JSON.parse(localStorage.getItem(key)) || [];
  } catch (e) {
    cart = [];
  }

  const existing = cart.find(
    (c) => c.productId === item.productId && c.color === item.color && c.size === item.size
  );
  if (existing) {
    existing.qty += item.qty;
  } else {
    cart.push(item);
  }

  localStorage.setItem(key, JSON.stringify(cart));
  updateCartBadgeFromLocalCart(cart);
}

function updateCartBadgeFromLocalCart(cart) {
  const count = cart.reduce((sum, c) => sum + (c.qty || 1), 0);
  cartBadge.textContent = String(count);
  cartBadge.classList.toggle('show', count > 0);
}

function initHeaderCartBadge() {
  // Only reflects the localStorage fallback cart; if window.RareVisionCart
  // is present it's expected to manage this badge itself elsewhere.
  if (window.RareVisionCart) return;
  try {
    const cart = JSON.parse(localStorage.getItem('rareVisionCart')) || [];
    updateCartBadgeFromLocalCart(cart);
  } catch (e) {
    /* ignore malformed localStorage data */
  }
}

/* ==========================================================================
   WAITLIST ("NOTIFY ME") MODAL
   ========================================================================== */
function openWaitlistModal(sizeLabel) {
  pendingWaitlistSize = sizeLabel;
  waitlistSub.textContent = `We'll email you the moment size ${sizeLabel} is back in stock.`;
  waitlistForm.hidden = false;
  waitlistSuccess.hidden = true;
  waitlistError.hidden = true;
  waitlistEmailInput.value = '';
  waitlistOverlay.classList.add('show');
  waitlistModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => waitlistEmailInput.focus(), 50);
}

function closeWaitlistModal() {
  waitlistOverlay.classList.remove('show');
  waitlistModal.classList.remove('open');
  document.body.style.overflow = '';
}

async function handleWaitlistSubmit(e) {
  e.preventDefault();
  const email = waitlistEmailInput.value.trim();

  if (!email || !email.includes('@')) {
    waitlistError.textContent = 'Please enter a valid email address.';
    waitlistError.hidden = false;
    return;
  }

  waitlistError.hidden = true;
  waitlistSubmit.disabled = true;
  waitlistSubmit.textContent = 'Submitting…';

  try {
    const fb = window.RareVisionFirebase;
    if (!fb || typeof fb.joinWaitlist !== 'function') {
      throw new Error('RareVisionFirebase.joinWaitlist is not available.');
    }
    await fb.joinWaitlist({
      productId: product.id,
      color: product.colors?.[activeColorIndex]?.name || '',
      size: pendingWaitlistSize,
      email,
    });
    waitlistForm.hidden = true;
    waitlistSuccess.hidden = false;
  } catch (err) {
    console.error('[product.js] Waitlist submission failed:', err);
    waitlistError.textContent = 'Something went wrong — please try again.';
    waitlistError.hidden = false;
  } finally {
    waitlistSubmit.disabled = false;
    waitlistSubmit.textContent = 'Notify Me';
  }
}

/* ==========================================================================
   REPORT THIS PRODUCT MODAL
   ========================================================================== */
function openReportModal() {
  if (!product) return;

  reportForm.hidden = false;
  reportSuccess.hidden = true;
  reportError.hidden = true;
  reportEmailInput.value = currentUserEmail || '';
  reportMessageInput.value = '';
  reportSubmit.disabled = false;
  reportSubmit.textContent = 'Submit Report';

  reportOverlay.classList.add('show');
  reportModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    (reportEmailInput.value ? reportMessageInput : reportEmailInput).focus();
  }, 50);
}

function closeReportModal() {
  reportOverlay.classList.remove('show');
  reportModal.classList.remove('open');
  document.body.style.overflow = '';
}

async function handleReportSubmit(e) {
  e.preventDefault();
  const email = reportEmailInput.value.trim();
  const message = reportMessageInput.value.trim();

  if (!email || !email.includes('@')) {
    reportError.textContent = 'Please enter a valid email address.';
    reportError.hidden = false;
    return;
  }
  if (!message) {
    reportError.textContent = "Please describe the issue before submitting.";
    reportError.hidden = false;
    return;
  }

  reportError.hidden = true;
  reportSubmit.disabled = true;
  reportSubmit.textContent = 'Submitting…';

  try {
    const fb = window.RareVisionFirebase;
    if (!fb || typeof fb.submitReport !== 'function') {
      throw new Error('RareVisionFirebase.submitReport is not available.');
    }
    await fb.submitReport({
      productId: product.id,
      email,
      message,
    });
    reportForm.hidden = true;
    reportSuccess.hidden = false;
    window.alert("Thanks — your report has been submitted. We'll take a look.");
  } catch (err) {
    console.error('[product.js] Report submission failed:', err);
    reportError.textContent = 'Something went wrong — please try again.';
    reportError.hidden = false;
  } finally {
    reportSubmit.disabled = false;
    reportSubmit.textContent = 'Submit Report';
  }
}

/* ==========================================================================
   DESCRIPTION / PRODUCT DETAILS ACCORDIONS
   ========================================================================== */
function renderDescriptionAndDetails(p) {
  descriptionText.textContent = p.description || 'No description available yet.';

  if (p.productDetails) {
    if (Array.isArray(p.productDetails)) {
      detailsText.innerHTML = `<ul>${p.productDetails.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`;
    } else {
      detailsText.textContent = p.productDetails;
    }
  } else {
    detailsText.textContent = 'Details coming soon.';
  }
}

function wireAccordions() {
  accordionGroup.querySelectorAll('.pdp-accordion').forEach((item) => {
    const trigger = item.querySelector('.accordion-trigger');
    trigger.addEventListener('click', () => item.classList.toggle('open'));
  });
}

/* ==========================================================================
   REVIEWS SUMMARY (rating bars) + STATIC REVIEW CARDS

   NOTE: the Firestore data contract for this project has no `reviews`
   sub-collection — reviewsAvgRating / reviewsCount are the only review
   fields that live on the product document. The star-breakdown bars
   below are a proportionate visual estimate derived from that single
   average (see estimateStarDistribution), and the review cards are
   placeholder sample content. Swap both for a live query once a real
   reviews collection is added to the contract.
   ========================================================================== */
function renderReviewsSummary(p) {
  const avg = Number(p.reviewsAvgRating) || 0;
  const count = Number(p.reviewsCount) || 0;

  reviewsAvgStars.innerHTML = starsMarkup(avg);
  reviewsAvgValue.textContent = avg.toFixed(1);
  reviewsCountText.textContent = `${count.toLocaleString()} global rating${count === 1 ? '' : 's'}`;
  reviewsCountryHeading.textContent = 'Reviews';

  const distribution = estimateStarDistribution(avg);
  ratingBarsEl.innerHTML = '';
  [5, 4, 3, 2, 1].forEach((star) => {
    const pct = distribution[star] || 0;
    const row = document.createElement('div');
    row.className = 'rating-bar-row';
    row.innerHTML = `
      <span>${star} star</span>
      <span class="rating-bar-track"><span class="rating-bar-fill" style="width:${pct}%"></span></span>
      <span class="rating-bar-pct">${pct}%</span>`;
    ratingBarsEl.appendChild(row);
  });
}

function estimateStarDistribution(avg) {
  // Deterministic weighting skewed toward the average rating — a visual
  // approximation only, not real per-review counts (see note above).
  const weights = [5, 4, 3, 2, 1].map((star) => Math.max(0, 1 - Math.abs(star - avg) / 3));
  const total = weights.reduce((s, v) => s + v, 0) || 1;
  const pct = weights.map((w) => Math.round((w / total) * 100));
  return { 5: pct[0], 4: pct[1], 3: pct[2], 2: pct[3], 1: pct[4] };
}

const SAMPLE_REVIEWS = [
  { rating: 5, date: '09/04/2026', name: 'Anonymous', verified: true, title: 'Great everyday fit', body: 'Comfortable, true to size, and the fabric holds up well after a few washes.' },
  { rating: 4, date: '09/03/2026', name: 'Anonymous', verified: true, title: 'Good quality, runs slightly slim', body: 'Nice material and stitching. Sized up one and it fits perfectly now.' },
  { rating: 5, date: '09/02/2026', name: 'Mona K.', verified: true, title: 'Exactly as pictured', body: 'Color and print matched the photos exactly. Fast delivery too.' },
  { rating: 3, date: '08/30/2026', name: 'Anonymous', verified: true, title: 'Decent, a bit thin', body: 'Looks good but the fabric is thinner than I expected for the price.' },
  { rating: 5, date: '08/28/2026', name: 'Youssef A.', verified: true, title: 'Will buy again', body: 'Second one I bought in a different color — same great fit both times.' },
  { rating: 2, date: '08/25/2026', name: 'Anonymous', verified: true, title: 'Sizing ran small', body: 'Had to exchange for a size up. Support handled it quickly though.' },
];
const REVIEWS_PER_PAGE = 4;
let reviewPage = 1;

function renderStaticReviewCards() {
  const sorted = sortReviews([...SAMPLE_REVIEWS], reviewsSortSelect.value);
  const totalPages = Math.max(1, Math.ceil(sorted.length / REVIEWS_PER_PAGE));
  reviewPage = Math.min(reviewPage, totalPages);
  const start = (reviewPage - 1) * REVIEWS_PER_PAGE;
  const pageItems = sorted.slice(start, start + REVIEWS_PER_PAGE);

  reviewCardsGrid.innerHTML = pageItems.map((r) => `
    <div class="review-card">
      <div class="review-card-top">
        <span class="stars">${starsMarkup(r.rating)}</span>
        <span class="review-card-date">${r.date}</span>
      </div>
      <div class="review-card-user">
        <span class="review-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
        </span>
        <span class="review-username">${escapeHtml(r.name)}</span>
        ${r.verified ? '<span class="verified-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>Verified</span>' : ''}
      </div>
      <p class="review-card-title">${escapeHtml(r.title)}</p>
      <p class="review-card-body">${escapeHtml(r.body)}</p>
    </div>
  `).join('');

  renderReviewPagination(totalPages);
}

function sortReviews(list, mode) {
  if (mode === 'highest') return list.sort((a, b) => b.rating - a.rating);
  if (mode === 'lowest') return list.sort((a, b) => a.rating - b.rating);
  return list; // 'recent' — already newest-first above
}

function renderReviewPagination(totalPages) {
  reviewPagination.innerHTML = '';
  if (totalPages <= 1) return;

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(i);
    btn.className = i === reviewPage ? 'active' : '';
    btn.addEventListener('click', () => {
      reviewPage = i;
      renderStaticReviewCards();
    });
    reviewPagination.appendChild(btn);
  }
}

/* ==========================================================================
   COMPLETE THE LOOK / WE RECOMMEND / YOU MIGHT ALSO LIKE / BEST SELLER
   IN THIS CATEGORY

   All three recommendation grids are derived client-side from the same
   fetchProducts() read (already scoped to the `products` collection,
   excluding status:'hidden') rather than issuing separate Firestore
   queries per grid — combining an inequality filter on `status` with an
   orderBy on a different field (`soldCount`) would need a composite
   index Firestore can't satisfy without an explicit orderBy('status')
   first, so sorting/filtering here keeps this correct without one.
   ========================================================================== */
async function loadRelatedProducts(current) {
  const fb = window.RareVisionFirebase;
  if (!fb || typeof fb.fetchProducts !== 'function') return;

  try {
    const all = await fb.fetchProducts();
    const others = all.filter((item) => item.id !== current.id);

    renderCompleteTheLook(others.slice(0, 8));

    const currentCategories = getProductCategories(current);
    // If the current product itself has no category info to match against,
    // fall back to the full "others" pool so these sections still render
    // something useful instead of coming up empty.
    const sameCategory = currentCategories.length
      ? others.filter((item) => sharesCategory(item, currentCategories))
      : others;

    const byBestSelling = [...others].sort((a, b) => getSoldCount(b) - getSoldCount(a));
    const bestSellersInCategory = [...sameCategory].sort((a, b) => getSoldCount(b) - getSoldCount(a));

    renderProductGrid(recommendSection, recommendGrid, sameCategory.slice(0, 8));
    renderProductGrid(alsoLikeSection, alsoLikeGrid, byBestSelling.slice(0, 8));
    renderProductGrid(bestSellersSection, bestSellersGrid, bestSellersInCategory.slice(0, 8));
  } catch (err) {
    console.error('[product.js] Failed to load related products:', err);
  }
}

function getProductCategories(p) {
  const list = Array.isArray(p.categories) ? p.categories.filter(Boolean) : [];
  if (p.targetCategory) list.push(p.targetCategory);
  return list;
}

function sharesCategory(item, currentCategories) {
  if (!currentCategories.length) return false;
  return getProductCategories(item).some((cat) => currentCategories.includes(cat));
}

function getSoldCount(item) {
  return Number(item.soldCount) || 0;
}

function renderCompleteTheLook(items) {
  if (!items.length) return;
  completeLookSection.hidden = false;
  completeLookScroll.innerHTML = '';

  items.forEach((item) => {
    const img = item.colors?.[0]?.images?.[0] || '';
    const card = document.createElement('a');
    card.href = `product.html?id=${encodeURIComponent(item.id)}`;
    card.className = 'complete-look-card';
    card.innerHTML = `
      <div class="complete-look-media">
        <img src="${escapeAttr(img)}" alt="${escapeAttr(item.name || '')}">
        <span class="complete-look-add" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>
        </span>
      </div>
      <p class="complete-look-name">${escapeHtml(item.name || '')}</p>
      <p class="complete-look-price">${formatMoney(item.price, item.currency)}</p>`;
    completeLookScroll.appendChild(card);
  });
}

function renderProductGrid(sectionEl, gridEl, items) {
  if (!items.length) {
    sectionEl.hidden = true;
    return;
  }

  sectionEl.hidden = false;
  gridEl.innerHTML = '';

  items.forEach((item) => {
    const img = item.colors?.[0]?.images?.[0] || '';
    const hasDiscount = item.compareAtPrice && Number(item.compareAtPrice) > Number(item.price);
    const pctOff = hasDiscount
      ? Math.round((1 - Number(item.price) / Number(item.compareAtPrice)) * 100)
      : 0;

    const card = document.createElement('a');
    card.href = `product.html?id=${encodeURIComponent(item.id)}`;
    card.className = 'home-card';
    card.innerHTML = `
      <div class="home-card-media">
        <img src="${escapeAttr(img)}" alt="${escapeAttr(item.name || '')}">
        ${hasDiscount ? `<span class="home-badge sale">${pctOff}% OFF</span>` : ''}
        <span class="home-choose-btn" aria-hidden="true">Choose Options</span>
      </div>
      <div class="home-card-body">
        <p class="home-card-name">${escapeHtml(item.name || '')}</p>
        <div class="home-price-row">
          ${hasDiscount ? `<span class="home-price-old">${formatMoney(item.compareAtPrice, item.currency)}</span>` : ''}
          <span class="home-price${hasDiscount ? ' sale' : ''}">${formatMoney(item.price, item.currency)}</span>
        </div>
      </div>`;
    gridEl.appendChild(card);
  });
}

/* ==========================================================================
   STICKY MOBILE ADD-TO-BAG BAR
   ========================================================================== */
function updateStickyBar() {
  if (!product) return;
  const color = product.colors?.[activeColorIndex];
  stickyThumb.src = color?.images?.[0] || '';
  stickyThumb.alt = product.name || '';
  stickyName.textContent = product.name || '';
  stickyPrice.textContent = formatMoney(product.price, product.currency);
}

function watchStickyBar() {
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    ([entry]) => stickyBar.classList.toggle('show', !entry.isIntersecting),
    { rootMargin: '-72px 0px 0px 0px' }
  );
  observer.observe(ctaBtn);
}

/* ==========================================================================
   STATIC INTERACTIONS — wired once at load, independent of product data
   ========================================================================== */
function wireStaticInteractions() {
  initHeaderCartBadge();
  wireAccordions();

  navToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  prevBtn.addEventListener('click', () => goToSlide(activeSlideIndex - 1));
  nextBtn.addEventListener('click', () => goToSlide(activeSlideIndex + 1));
  expandBtn.addEventListener('click', () => {
    const currentColor = product?.colors?.[activeColorIndex];
    openLightbox(currentColor?.images || [], activeSlideIndex);
  });

  let touchStartX = null;
  sliderEl.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  sliderEl.addEventListener('touchend', (e) => {
    if (touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) goToSlide(activeSlideIndex + (dx < 0 ? 1 : -1));
    touchStartX = null;
  });

  learnMoreBtn.addEventListener('click', () => {
    const nowClamped = featuresText.classList.toggle('clamped');
    const expanded = !nowClamped;
    learnMoreBtn.textContent = expanded ? 'Show less' : 'Learn more';
    learnMoreBtn.setAttribute('aria-expanded', String(expanded));
  });

  qtyMinusBtn.addEventListener('click', () => {
    quantity = Math.max(1, quantity - 1);
    qtyValueEl.textContent = String(quantity);
  });
  qtyPlusBtn.addEventListener('click', () => {
    quantity = Math.min(10, quantity + 1);
    qtyValueEl.textContent = String(quantity);
  });

  ctaBtn.addEventListener('click', addToBag);
  stickyCta.addEventListener('click', addToBag);

  lightboxClose.addEventListener('click', closeLightbox);
  lightboxOverlay.addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', () => {
    lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
    updateLightboxImage();
  });
  lightboxNext.addEventListener('click', () => {
    lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
    updateLightboxImage();
  });

  waitlistClose.addEventListener('click', closeWaitlistModal);
  waitlistOverlay.addEventListener('click', closeWaitlistModal);
  waitlistForm.addEventListener('submit', handleWaitlistSubmit);

  reportClose.addEventListener('click', closeReportModal);
  reportOverlay.addEventListener('click', closeReportModal);
  reportForm.addEventListener('submit', handleReportSubmit);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeLightbox();
    closeWaitlistModal();
    closeReportModal();
  });

  ratingsCalcToggle.addEventListener('click', () => {
    const isOpen = ratingsCalcToggle.classList.toggle('open');
    ratingsCalcToggle.setAttribute('aria-expanded', String(isOpen));
    ratingsCalcCopy.hidden = !isOpen;
  });

  reviewsSortSelect.addEventListener('change', () => {
    reviewPage = 1;
    renderStaticReviewCards();
  });

  writeReviewBtn.addEventListener('click', () => {
    writeReviewBtn.textContent = 'Thanks! Review form coming soon';
    writeReviewBtn.disabled = true;
  });

  reportBtn.addEventListener('click', openReportModal);
}
