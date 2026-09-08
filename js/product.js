'use strict';

/* ==========================================================================
   RARE VISION — product.js
   Powers product.html end-to-end (SRS Phase 3 + Phase 5). Requires
   js/shared.js loaded first (CONFIG, formatters, renderStars,
   renderMarkdownLite, escapeHtml).
   ========================================================================== */

import {
  db, auth, storage, collection, addDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, onAuthChange, getCurrentUser,
  ref, uploadBytes, getDownloadURL,
} from './firebase-init.js';
import {
  getProductById, getSimilarCategoryProducts, getHighVolumeProducts, getBestSellerInCategory,
} from './products-data.js';
import { addToCart, initCartDrawer } from './cart.js';
import { showToast } from './site-common.js';

const dom = {};
const ID_LIST = [
  'pdpRoot', 'pdpLoading', 'pdpNotFound',
  'galleryTrack', 'galleryPrev', 'galleryNext', 'galleryExpand', 'galleryDots',
  'pdpBadges', 'pdpTitle', 'pdpPriceRow', 'pdpRatingRow', 'pdpFeatures', 'pdpLearnMore',
  'pdpSwatchesBlock', 'pdpColorName', 'pdpSwatches',
  'pdpTargetPill', 'pdpQtyDec', 'pdpQtyInc', 'pdpQtyValue',
  'pdpSizeBlock', 'pdpSizeGrid', 'pdpCtaBtn', 'pdpAccordions', 'reportProductBtn',
  'recoWeRecommend', 'recoWeRecommendGrid', 'recoHighVolume', 'recoHighVolumeGrid',
  'recoBestSeller', 'recoBestSellerGrid',
  'reviewsSection', 'reviewsAvgStars', 'reviewsAvgNum', 'reviewsCountLine', 'ratingBars',
  'writeReviewBtn', 'reviewLockedNote', 'reviewsSort', 'reviewsFeedGrid', 'reviewsEmptyNote', 'reviewsPagination',
  'lightboxOverlay', 'lightboxTrack', 'lightboxClose', 'lightboxPrev', 'lightboxNext',
  'notifyModalOverlay', 'notifyModalClose', 'notifyModalForm', 'notifyEmailInput', 'notifyFormError', 'notifySubmitBtn', 'notifyModalSuccess',
  'reportModalOverlay', 'reportModalClose', 'reportModalForm', 'reportEmailInput', 'reportDescriptionInput', 'reportFormError', 'reportSubmitBtn', 'reportModalSuccess',
  'reviewModalOverlay', 'reviewModalClose',
  'reviewStep1', 'reviewStarPicker', 'reviewStep1Next',
  'reviewStep2', 'reviewContentInput', 'reviewTitleInput', 'reviewStep2Back', 'reviewStep2Next',
  'reviewStep3', 'reviewUploadBox', 'reviewPhotoInput', 'reviewPhotoPreview', 'reviewStep3Skip', 'reviewStep3Back', 'reviewStep3Next',
  'reviewStep4', 'reviewStep4Close',
  'stickyAtb', 'stickyAtbImg', 'stickyAtbName', 'stickyAtbPrice', 'stickyAtbBtn',
  'pageTitle', 'pageDescription',
];

const state = {
  product: null,
  images: [],          // current gallery image list (depends on selected variant)
  activeImageIndex: 0,
  selectedVariantIndex: 0,
  selectedSize: null,
  qty: 1,
  pendingNotifySize: null,
  reviews: [],
  reviewsSort: 'recent',
  reviewsPage: 1,
  reviewDraft: { stars: 0, title: '', content: '', photoFile: null, photoDataUrl: null },
  currentUser: null,
};
const REVIEWS_PER_PAGE = 4;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  ID_LIST.forEach((id) => { dom[id] = document.getElementById(id); });
  initCartDrawer();
  onAuthChange((user) => { state.currentUser = user; refreshWriteReviewButton(); });

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) { showNotFound(); return; }

  try {
    const product = await getProductById(id);
    if (!product) { showNotFound(); return; }
    state.product = product;
  } catch (err) {
    console.warn('Could not load product from Firestore:', err);
    showNotFound();
    return;
  }

  dom.pdpLoading.hidden = true;
  dom.pdpRoot.hidden = false;
  document.getElementById('pageTitle').textContent = `${state.product.name} | Rare Vision`;
  document.getElementById('pageDescription').setAttribute('content', state.product.shortDescription || state.product.name);

  renderBadgesAndTitle();
  renderGalleryForVariant(0);
  renderSwatches();
  renderTargetAndQty();
  renderSizes();
  renderAccordions();
  bindGalleryEvents();
  bindLightbox();
  bindQtyEvents();
  bindSizeEvents();
  bindCtaEvents();
  bindReportModal();
  bindNotifyModal();
  bindStickyBar();
  loadRecommendations();
  loadReviews();
  bindReviewModal();
}

function showNotFound() {
  dom.pdpLoading.hidden = true;
  dom.pdpNotFound.hidden = false;
}

/* --------------------------------------------------------------------------
   VARIANT / GALLERY NORMALIZATION
   -------------------------------------------------------------------------- */
function getColorVariants(p) {
  if (Array.isArray(p.colorVariants) && p.colorVariants.length) return p.colorVariants;
  // Back-compat with the original flat `colors` + single `image`/`gallery` shape.
  const images = [p.image, ...(Array.isArray(p.gallery) ? p.gallery : [])].filter(Boolean);
  if (Array.isArray(p.colors) && p.colors.length) {
    return p.colors.map((hex, i) => ({ name: `Color ${i + 1}`, swatchImage: images[0] || '', swatchColor: hex, images: images.length ? images : [''] }));
  }
  return [{ name: '', swatchImage: images[0] || '', images: images.length ? images : [''] }];
}

/* --------------------------------------------------------------------------
   BADGES / TITLE / PRICE / RATING
   -------------------------------------------------------------------------- */
function renderBadgesAndTitle() {
  const p = state.product;
  const badges = [];
  if (p.customBadgeText) badges.push(p.customBadgeText);
  dom.pdpBadges.innerHTML = badges.map((b) => `<span class="pdp-badge">${escapeHtml(b)}</span>`).join('');

  dom.pdpTitle.textContent = p.name;

  const onSale = typeof p.compareAtPrice === 'number' && p.compareAtPrice > p.price;
  dom.pdpPriceRow.innerHTML = onSale
    ? `<span class="pdp-price-was">${formatPrice(p.compareAtPrice)}</span><span class="pdp-price-now">${formatPrice(p.price)}</span>`
    : `<span class="pdp-price-now no-sale">${formatPrice(p.price)}</span>`;

  dom.pdpRatingRow.innerHTML = `${renderStars(p.averageRating)} <span>${(Number(p.averageRating) || 0).toFixed(1)}</span> <span class="muted">(${Number(p.reviewCount) || 0})</span>`;

  const features = p.shortDescription || '';
  dom.pdpFeatures.innerHTML = features ? `<strong>FEATURES</strong> • ${escapeHtml(features)}` : '';
  if (p.description) {
    dom.pdpLearnMore.hidden = false;
    dom.pdpLearnMore.addEventListener('click', () => {
      document.getElementById('accDescription')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const acc = document.getElementById('accDescription');
      if (acc && !acc.classList.contains('open')) acc.querySelector('.pdp-accordion-trigger').click();
    });
  }
}

/* --------------------------------------------------------------------------
   GALLERY (per-variant) + LIGHTBOX
   -------------------------------------------------------------------------- */
function renderGalleryForVariant(variantIndex) {
  const variants = getColorVariants(state.product);
  const variant = variants[variantIndex] || variants[0];
  state.selectedVariantIndex = variantIndex;
  state.images = (variant.images && variant.images.length ? variant.images : ['']).filter((x) => x !== undefined);
  state.activeImageIndex = 0;
  paintGalleryTrack();
  if (dom.pdpColorName) dom.pdpColorName.textContent = variant.name || '';
  updateStickyBar();
}

function paintGalleryTrack() {
  dom.galleryTrack.style.transform = `translateX(-${state.activeImageIndex * 100}%)`;
  dom.galleryTrack.innerHTML = state.images.map((src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(state.product.name)}" loading="lazy">`).join('');
  dom.galleryTrack.style.transform = `translateX(-${state.activeImageIndex * 100}%)`;
  dom.galleryDots.innerHTML = state.images.map((_, i) => `<span class="${i === state.activeImageIndex ? 'active' : ''}"></span>`).join('');
}

function goToImage(index) {
  const max = state.images.length - 1;
  state.activeImageIndex = Math.max(0, Math.min(max, index));
  dom.galleryTrack.style.transform = `translateX(-${state.activeImageIndex * 100}%)`;
  dom.galleryDots.querySelectorAll('span').forEach((dot, i) => dot.classList.toggle('active', i === state.activeImageIndex));
}

function bindGalleryEvents() {
  dom.galleryPrev.addEventListener('click', () => goToImage(state.activeImageIndex - 1));
  dom.galleryNext.addEventListener('click', () => goToImage(state.activeImageIndex + 1));
  dom.galleryExpand.addEventListener('click', openLightbox);

  // touch swipe
  let touchStartX = null;
  const mainEl = document.getElementById('galleryMain');
  mainEl.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  mainEl.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) goToImage(state.activeImageIndex + (dx < 0 ? 1 : -1));
    touchStartX = null;
  });

  // simple mouse drag
  let dragStartX = null;
  mainEl.addEventListener('mousedown', (e) => { dragStartX = e.clientX; });
  window.addEventListener('mouseup', (e) => {
    if (dragStartX === null) return;
    const dx = e.clientX - dragStartX;
    if (Math.abs(dx) > 60) goToImage(state.activeImageIndex + (dx < 0 ? 1 : -1));
    dragStartX = null;
  });
}

function openLightbox() {
  dom.lightboxTrack.innerHTML = state.images.map((src) => `<img src="${escapeHtml(src)}" alt="">`).join('');
  dom.lightboxTrack.style.transform = `translateX(-${state.activeImageIndex * 100}%)`;
  dom.lightboxOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  dom.lightboxOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
function bindLightbox() {
  dom.lightboxClose.addEventListener('click', closeLightbox);
  dom.lightboxOverlay.addEventListener('click', (e) => { if (e.target === dom.lightboxOverlay) closeLightbox(); });
  dom.lightboxPrev.addEventListener('click', () => { goToImage(state.activeImageIndex - 1); dom.lightboxTrack.style.transform = `translateX(-${state.activeImageIndex * 100}%)`; });
  dom.lightboxNext.addEventListener('click', () => { goToImage(state.activeImageIndex + 1); dom.lightboxTrack.style.transform = `translateX(-${state.activeImageIndex * 100}%)`; });
  document.addEventListener('keydown', (e) => {
    if (!dom.lightboxOverlay.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') dom.lightboxPrev.click();
    if (e.key === 'ArrowRight') dom.lightboxNext.click();
  });
  let touchStartX = null;
  dom.lightboxTrack.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  dom.lightboxTrack.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) (dx < 0 ? dom.lightboxNext : dom.lightboxPrev).click();
    touchStartX = null;
  });
}

/* --------------------------------------------------------------------------
   COLOR SWATCHES
   -------------------------------------------------------------------------- */
function renderSwatches() {
  const variants = getColorVariants(state.product);
  if (variants.length <= 1 && !variants[0].name) { dom.pdpSwatchesBlock.hidden = true; return; }
  dom.pdpSwatchesBlock.hidden = false;
  dom.pdpSwatches.innerHTML = variants.map((v, i) => `
    <button class="pdp-swatch ${i === 0 ? 'active' : ''}" data-index="${i}" aria-label="${escapeHtml(v.name || 'Color option')}">
      <img src="${escapeHtml(v.swatchImage || v.images?.[0] || '')}" alt="${escapeHtml(v.name || '')}">
    </button>`).join('');
  dom.pdpSwatches.querySelectorAll('.pdp-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      dom.pdpSwatches.querySelectorAll('.pdp-swatch').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderGalleryForVariant(Number(btn.dataset.index));
    });
  });
}

/* --------------------------------------------------------------------------
   TARGET CATEGORY + QUANTITY
   -------------------------------------------------------------------------- */
function renderTargetAndQty() {
  dom.pdpTargetPill.textContent = state.product.targetCategory || 'Unisex';
  dom.pdpQtyValue.textContent = state.qty;
}
function bindQtyEvents() {
  dom.pdpQtyDec.addEventListener('click', () => { if (state.qty > 1) { state.qty--; dom.pdpQtyValue.textContent = state.qty; updateStickyBar(); } });
  dom.pdpQtyInc.addEventListener('click', () => { state.qty++; dom.pdpQtyValue.textContent = state.qty; updateStickyBar(); });
}

/* --------------------------------------------------------------------------
   SIZES + CTA STATE MACHINE
   -------------------------------------------------------------------------- */
function renderSizes() {
  const sizes = Array.isArray(state.product.sizes) ? state.product.sizes : [];
  if (!sizes.length) { dom.pdpSizeBlock.hidden = true; refreshCta(); return; }
  dom.pdpSizeGrid.innerHTML = sizes.map((s) => {
    const oos = s.stockStatus !== 'In Stock';
    return `<button class="pdp-size-btn ${oos ? 'oos' : ''}" data-size="${escapeHtml(s.size)}" data-oos="${oos}">
      ${escapeHtml(s.size)}
      ${oos ? '<svg class="oos-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="6" width="19" height="13" rx="2"/><path d="M2.5 7l9.5 6 9.5-6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
    </button>`;
  }).join('');
  dom.pdpSizeGrid.querySelectorAll('.pdp-size-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      dom.pdpSizeGrid.querySelectorAll('.pdp-size-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedSize = btn.dataset.size;
      state.pendingNotifySize = btn.dataset.oos === 'true' ? btn.dataset.size : null;
      refreshCta();
    });
  });
  refreshCta();
}

function refreshCta() {
  const sizes = Array.isArray(state.product.sizes) ? state.product.sizes : [];
  const btn = dom.pdpCtaBtn;
  if (!sizes.length) {
    const inStock = state.product.inStock !== false;
    btn.disabled = !inStock;
    btn.className = `pdp-cta-btn ${inStock ? 'ready' : ''}`;
    btn.textContent = inStock ? 'ADD TO BAG' : 'OUT OF STOCK';
    updateStickyBar();
    return;
  }
  if (!state.selectedSize) {
    btn.disabled = true;
    btn.className = 'pdp-cta-btn';
    btn.textContent = 'SELECT A SIZE';
    updateStickyBar();
    return;
  }
  if (state.pendingNotifySize) {
    btn.disabled = false;
    btn.className = 'pdp-cta-btn notify';
    btn.textContent = 'NOTIFY ME';
  } else {
    btn.disabled = false;
    btn.className = 'pdp-cta-btn ready';
    btn.textContent = 'ADD TO BAG';
  }
  updateStickyBar();
}

function bindCtaEvents() {
  dom.pdpCtaBtn.addEventListener('click', handleCtaClick);
  dom.stickyAtbBtn.addEventListener('click', handleCtaClick);
}

async function handleCtaClick() {
  if (state.pendingNotifySize) {
    openNotifyModal();
    return;
  }
  const image = state.images[0];
  await addToCart(state.product, state.selectedSize, state.qty, image);
  showToast('Added to bag');
}

/* --------------------------------------------------------------------------
   NOTIFY ME MODAL
   -------------------------------------------------------------------------- */
function openNotifyModal() {
  dom.notifyModalForm.hidden = false;
  dom.notifyModalSuccess.hidden = true;
  dom.notifyEmailInput.value = '';
  dom.notifyFormError.hidden = true;
  dom.notifyModalOverlay.classList.add('open');
}
function closeNotifyModal() { dom.notifyModalOverlay.classList.remove('open'); }
function bindNotifyModal() {
  dom.notifyModalClose.addEventListener('click', closeNotifyModal);
  dom.notifyModalOverlay.addEventListener('click', (e) => { if (e.target === dom.notifyModalOverlay) closeNotifyModal(); });
  dom.notifySubmitBtn.addEventListener('click', async () => {
    const email = dom.notifyEmailInput.value.trim();
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_RE.test(email)) {
      dom.notifyFormError.textContent = 'Please enter a valid email address.';
      dom.notifyFormError.hidden = false;
      return;
    }
    dom.notifySubmitBtn.disabled = true;
    dom.notifySubmitBtn.textContent = 'Submitting…';
    try {
      await addDoc(collection(db, 'waitlist'), {
        productId: state.product.id,
        productName: state.product.name,
        size: state.pendingNotifySize,
        email,
        notified: false,
        createdAt: serverTimestamp(),
      });
      dom.notifyModalForm.hidden = true;
      dom.notifyModalSuccess.hidden = false;
    } catch (err) {
      console.warn('waitlist write failed', err);
      dom.notifyFormError.textContent = 'Something went wrong. Please try again.';
      dom.notifyFormError.hidden = false;
    } finally {
      dom.notifySubmitBtn.disabled = false;
      dom.notifySubmitBtn.textContent = 'Notify Me';
    }
  });
}

/* --------------------------------------------------------------------------
   ACCORDIONS + REPORT
   -------------------------------------------------------------------------- */
function renderAccordions() {
  const p = state.product;
  const specsHtml = (p.specifications || []).map((s) => `<p><strong>${escapeHtml(s.label)}:</strong> ${escapeHtml(s.value)}</p>`).join('') || '<p>No additional details provided.</p>';
  const sections = [
    { id: 'accDescription', label: 'Description', html: renderMarkdownLite(p.description || p.shortDescription || 'No description available.') },
    { id: 'accDetails', label: 'Product Details', html: specsHtml },
    { id: 'accDelivery', label: 'Delivery', html: `
        <p>Standard shipping: 1-5 Working Days (excluding Fridays).</p>
        <p>Orders are processed within 24 hours and handed to our courier partner for delivery across Egypt. You'll receive a tracking update once your order ships — you can also check status any time on our <a href="track-order.html">Track Order</a> page.</p>` },
    { id: 'accReturns', label: 'Returns & Exchanges', html: `
        <p>We accept returns and exchanges within 14 days of delivery, provided the item is unworn, unwashed, and in its original packaging with tags attached.</p>
        <p>To start a return or exchange, contact us at <a href="mailto:rare1vision@gmail.com">rare1vision@gmail.com</a> with your order number. Refunds are issued to the original payment method (or as store credit for Cash on Delivery orders) once the returned item is received and inspected.</p>` },
  ];
  dom.pdpAccordions.innerHTML = sections.map((s) => `
    <div class="pdp-accordion" id="${s.id}">
      <button class="pdp-accordion-trigger" type="button" aria-expanded="false">
        <span>${s.label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="pdp-accordion-panel">${s.html}</div>
    </div>`).join('');
  dom.pdpAccordions.querySelectorAll('.pdp-accordion').forEach((acc) => {
    const trigger = acc.querySelector('.pdp-accordion-trigger');
    trigger.addEventListener('click', () => {
      const open = acc.classList.toggle('open');
      trigger.setAttribute('aria-expanded', String(open));
    });
  });
}

function bindReportModal() {
  dom.reportProductBtn.addEventListener('click', () => {
    dom.reportModalForm.hidden = false;
    dom.reportModalSuccess.hidden = true;
    dom.reportEmailInput.value = '';
    dom.reportDescriptionInput.value = '';
    dom.reportFormError.hidden = true;
    dom.reportModalOverlay.classList.add('open');
  });
  dom.reportModalClose.addEventListener('click', () => dom.reportModalOverlay.classList.remove('open'));
  dom.reportModalOverlay.addEventListener('click', (e) => { if (e.target === dom.reportModalOverlay) dom.reportModalOverlay.classList.remove('open'); });
  dom.reportSubmitBtn.addEventListener('click', async () => {
    const email = dom.reportEmailInput.value.trim();
    const description = dom.reportDescriptionInput.value.trim();
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_RE.test(email) || description.length < 5) {
      dom.reportFormError.textContent = 'Please enter a valid email and a short description.';
      dom.reportFormError.hidden = false;
      return;
    }
    dom.reportSubmitBtn.disabled = true;
    dom.reportSubmitBtn.textContent = 'Submitting…';
    try {
      await addDoc(collection(db, 'reports'), {
        productId: state.product.id,
        productName: state.product.name,
        email, description,
        resolved: false,
        createdAt: serverTimestamp(),
      });
      dom.reportModalForm.hidden = true;
      dom.reportModalSuccess.hidden = false;
    } catch (err) {
      console.warn('report write failed', err);
      dom.reportFormError.textContent = 'Something went wrong. Please try again.';
      dom.reportFormError.hidden = false;
    } finally {
      dom.reportSubmitBtn.disabled = false;
      dom.reportSubmitBtn.textContent = 'Submit Report';
    }
  });
}

/* --------------------------------------------------------------------------
   STICKY ADD-TO-BAG BAR
   -------------------------------------------------------------------------- */
function updateStickyBar() {
  if (!state.product) return;
  dom.stickyAtbImg.src = state.images[0] || '';
  dom.stickyAtbName.textContent = state.product.name;
  dom.stickyAtbPrice.textContent = formatPrice(state.product.price);
  dom.stickyAtbBtn.textContent = dom.pdpCtaBtn.textContent;
  dom.stickyAtbBtn.disabled = dom.pdpCtaBtn.disabled;
}
function bindStickyBar() {
  const target = document.getElementById('pdpCtaBtn');
  const observer = new IntersectionObserver(([entry]) => {
    dom.stickyAtb.classList.toggle('visible', !entry.isIntersecting);
  }, { threshold: 0 });
  observer.observe(target);
}

/* --------------------------------------------------------------------------
   RECOMMENDATIONS
   -------------------------------------------------------------------------- */
function primaryImage(p) {
  const variants = getColorVariants(p);
  return variants[0]?.images?.[0] || p.image || '';
}

function recoCardHtml(p) {
  const onSale = typeof p.compareAtPrice === 'number' && p.compareAtPrice > p.price;
  const discountPct = onSale ? Math.round(((p.compareAtPrice - p.price) / p.compareAtPrice) * 100) : 0;
  const colors = Array.isArray(p.colors) ? p.colors : [];
  return `
  <article class="shop-card" style="position:relative;">
    ${onSale ? `<span class="reco-card-badge">${discountPct}% OFF</span>` : (p.badges?.[0] ? `<span class="reco-card-badge neutral">${escapeHtml(p.badges[0])}</span>` : '')}
    <a class="shop-card-media" href="product.html?id=${encodeURIComponent(p.id)}">
      <img src="${escapeHtml(primaryImage(p))}" alt="${escapeHtml(p.name)}" loading="lazy">
    </a>
    <div class="shop-card-body">
      <a class="shop-card-title" href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a>
      ${colors.length ? `<div class="swatch-row">${colors.map((c) => `<span class="swatch-dot" style="background:${escapeHtml(c)}"></span>`).join('')}</div>` : ''}
      <div class="shop-price-row">
        ${onSale ? `<span class="shop-price-old">${formatPrice(p.compareAtPrice)}</span>` : ''}
        <span class="shop-price ${onSale ? 'sale' : ''}">${formatPrice(p.price)}</span>
      </div>
      <div class="shop-rating-row"><span class="stars">${renderStars(p.averageRating)}</span><span class="rating-count">(${Number(p.reviewCount) || 0})</span></div>
      <a class="btn-select-size" href="product.html?id=${encodeURIComponent(p.id)}" style="display:flex;align-items:center;justify-content:center;text-decoration:none;">Choose Options</a>
    </div>
  </article>`;
}

async function loadRecommendations() {
  try {
    const [similar, highVolumeRaw, bestInCategory] = await Promise.all([
      getSimilarCategoryProducts(state.product, 4),
      getHighVolumeProducts([state.product.id], 8),
      getBestSellerInCategory(state.product, 3),
    ]);
    const usedIds = new Set([state.product.id, ...similar.map((p) => p.id)]);
    const highVolume = highVolumeRaw.filter((p) => !usedIds.has(p.id)).slice(0, 4);

    if (similar.length) {
      dom.recoWeRecommend.hidden = false;
      dom.recoWeRecommendGrid.innerHTML = similar.map(recoCardHtml).join('');
    }
    if (highVolume.length) {
      dom.recoHighVolume.hidden = false;
      dom.recoHighVolumeGrid.innerHTML = highVolume.map(recoCardHtml).join('');
    }
    if (bestInCategory.length) {
      dom.recoBestSeller.hidden = false;
      dom.recoBestSellerGrid.innerHTML = bestInCategory.map(recoCardHtml).join('');
    }
  } catch (err) {
    console.warn('Could not load recommendations:', err);
  }
}

/* --------------------------------------------------------------------------
   REVIEWS
   -------------------------------------------------------------------------- */
async function loadReviews() {
  try {
    const q = query(collection(db, 'reviews'), where('productId', '==', state.product.id), orderBy('createdAt', 'desc'), limit(200));
    const snap = await getDocs(q);
    state.reviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('Could not load reviews (needs a Firestore composite index on productId+createdAt — Firestore will print a direct link to create it the first time this query runs):', err);
    state.reviews = [];
  }
  dom.reviewsSection.hidden = false;
  renderReviewsSummary();
  renderReviewsFeed();
  dom.reviewsSort.addEventListener('change', () => { state.reviewsSort = dom.reviewsSort.value; state.reviewsPage = 1; renderReviewsFeed(); });
}

function renderReviewsSummary() {
  const reviews = state.reviews;
  const count = reviews.length;
  const avg = count ? reviews.reduce((s, r) => s + (Number(r.stars) || 0), 0) / count : (Number(state.product.averageRating) || 0);
  dom.reviewsAvgStars.innerHTML = renderStars(avg);
  dom.reviewsAvgNum.textContent = avg.toFixed(1);
  dom.reviewsCountLine.textContent = `${count || Number(state.product.reviewCount) || 0} global ratings`;

  const buckets = [0, 0, 0, 0, 0]; // index 0 = 1 star ... index 4 = 5 star
  reviews.forEach((r) => { const s = Math.round(Number(r.stars) || 0); if (s >= 1 && s <= 5) buckets[s - 1]++; });
  dom.ratingBars.innerHTML = [5, 4, 3, 2, 1].map((star) => {
    const n = buckets[star - 1];
    const pct = count ? Math.round((n / count) * 100) : 0;
    return `<div class="rating-bar-row"><span class="label">${star} star</span><div class="rating-bar-track"><div class="rating-bar-fill" style="width:${pct}%"></div></div><span class="pct">${pct}%</span></div>`;
  }).join('');
}

function renderReviewsFeed() {
  let list = [...state.reviews];
  if (state.reviewsSort === 'highest') list.sort((a, b) => (b.stars || 0) - (a.stars || 0));
  else if (state.reviewsSort === 'lowest') list.sort((a, b) => (a.stars || 0) - (b.stars || 0));
  else list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

  const totalPages = Math.max(1, Math.ceil(list.length / REVIEWS_PER_PAGE));
  state.reviewsPage = Math.min(state.reviewsPage, totalPages);
  const pageItems = list.slice((state.reviewsPage - 1) * REVIEWS_PER_PAGE, state.reviewsPage * REVIEWS_PER_PAGE);

  if (!list.length) {
    dom.reviewsFeedGrid.innerHTML = '';
    dom.reviewsEmptyNote.hidden = false;
    dom.reviewsPagination.hidden = true;
    return;
  }
  dom.reviewsEmptyNote.hidden = true;
  dom.reviewsFeedGrid.innerHTML = pageItems.map(reviewCardHtml).join('');

  if (totalPages > 1) {
    dom.reviewsPagination.hidden = false;
    let html = '';
    for (let i = 1; i <= totalPages; i++) html += `<button class="${i === state.reviewsPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    dom.reviewsPagination.innerHTML = html;
    dom.reviewsPagination.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { state.reviewsPage = Number(b.dataset.page); renderReviewsFeed(); }));
  } else {
    dom.reviewsPagination.hidden = true;
  }
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
}

function fmtDate(ts) {
  const ms = toMillis(ts);
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

function starsMarkup(n) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += i <= n
      ? '<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.9L6 21l1.6-7L2.2 9.2l7.1-.6L12 2z"/></svg>'
      : '<svg class="empty" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.9L6 21l1.6-7L2.2 9.2l7.1-.6L12 2z"/></svg>';
  }
  return html;
}

function reviewCardHtml(r) {
  return `
  <div class="review-card">
    <div class="review-card-top">
      <span class="stars">${starsMarkup(Math.round(r.stars || 0))}</span>
      <span class="review-card-date">${fmtDate(r.createdAt)}</span>
    </div>
    <div class="review-card-user">${escapeHtml(r.displayName || 'Anonymous')} <span class="review-verified-badge">Verified</span></div>
    ${r.title ? `<p class="review-card-title">${escapeHtml(r.title)}</p>` : ''}
    <p class="review-card-text">${escapeHtml(r.content || '')}</p>
    ${r.photoUrl ? `<img class="review-photo" src="${escapeHtml(r.photoUrl)}" alt="Customer photo">` : ''}
  </div>`;
}

/* --------------------------------------------------------------------------
   WRITE-A-REVIEW BUTTON STATE + 4-STEP MODAL
   -------------------------------------------------------------------------- */
async function refreshWriteReviewButton() {
  const btn = dom.writeReviewBtn;
  const note = dom.reviewLockedNote;
  if (!btn) return;
  if (!state.currentUser) {
    btn.disabled = false;
    btn.textContent = 'Write a review';
    note.hidden = true;
    btn.onclick = () => { window.location.href = `register.html?redirect=${encodeURIComponent(window.location.href)}`; };
    return;
  }
  btn.textContent = 'Write a review';
  btn.disabled = true;
  note.hidden = false;
  note.textContent = 'Checking your order history…';
  const delivered = await hasDeliveredOrderForProduct(state.currentUser, state.product.id);
  if (delivered) {
    btn.disabled = false;
    note.hidden = true;
    btn.onclick = openReviewModal;
  } else {
    btn.disabled = true;
    note.hidden = false;
    note.textContent = 'Review unlocks automatically once the product is delivered';
    btn.onclick = null;
  }
}

async function hasDeliveredOrderForProduct(user, productId) {
  try {
    const q = query(collection(db, 'orders'), where('userId', '==', user.uid), where('orderStatus', '==', 'Delivered'), limit(50));
    const snap = await getDocs(q);
    return snap.docs.some((d) => Array.isArray(d.data().items) && d.data().items.some((i) => i.id === productId));
  } catch (err) {
    console.warn('Could not check delivered orders:', err);
    return false;
  }
}

function resetReviewDraft() {
  state.reviewDraft = { stars: 0, title: '', content: '', photoFile: null, photoDataUrl: null };
  dom.reviewStarPicker.querySelectorAll('svg').forEach((s) => s.classList.remove('filled'));
  dom.reviewStep1Next.disabled = true;
  dom.reviewContentInput.value = '';
  dom.reviewTitleInput.value = '';
  dom.reviewPhotoPreview.hidden = true;
  dom.reviewPhotoPreview.src = '';
  [dom.reviewStep1, dom.reviewStep2, dom.reviewStep3, dom.reviewStep4].forEach((s) => { s.hidden = true; });
  dom.reviewStep1.hidden = false;
}

function openReviewModal() {
  resetReviewDraft();
  document.getElementById('reviewModalProductImg').src = state.images[0] || primaryImage(state.product);
  document.getElementById('reviewModalProductName').textContent = state.product.name;
  dom.reviewModalOverlay.classList.add('open');
}
function closeReviewModal() { dom.reviewModalOverlay.classList.remove('open'); }

function bindReviewModal() {
  dom.reviewModalClose.addEventListener('click', closeReviewModal);
  dom.reviewModalOverlay.addEventListener('click', (e) => { if (e.target === dom.reviewModalOverlay) closeReviewModal(); });

  dom.reviewStarPicker.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = Number(btn.dataset.star);
      state.reviewDraft.stars = n;
      dom.reviewStarPicker.querySelectorAll('button').forEach((b) => {
        b.querySelector('svg').classList.toggle('filled', Number(b.dataset.star) <= n);
      });
      dom.reviewStep1Next.disabled = false;
    });
  });
  dom.reviewStep1Next.addEventListener('click', () => { dom.reviewStep1.hidden = true; dom.reviewStep2.hidden = false; });

  dom.reviewStep2Back.addEventListener('click', () => { dom.reviewStep2.hidden = true; dom.reviewStep1.hidden = false; });
  dom.reviewStep2Next.addEventListener('click', () => {
    const content = dom.reviewContentInput.value.trim();
    if (content.length < 3) { dom.reviewContentInput.focus(); return; }
    state.reviewDraft.content = content;
    state.reviewDraft.title = dom.reviewTitleInput.value.trim();
    dom.reviewStep2.hidden = true; dom.reviewStep3.hidden = false;
  });

  dom.reviewUploadBox.addEventListener('click', () => dom.reviewPhotoInput.click());
  dom.reviewUploadBox.addEventListener('dragover', (e) => { e.preventDefault(); dom.reviewUploadBox.classList.add('dragover'); });
  dom.reviewUploadBox.addEventListener('dragleave', () => dom.reviewUploadBox.classList.remove('dragover'));
  dom.reviewUploadBox.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.reviewUploadBox.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handlePhotoFile(e.dataTransfer.files[0]);
  });
  dom.reviewPhotoInput.addEventListener('change', () => { if (dom.reviewPhotoInput.files[0]) handlePhotoFile(dom.reviewPhotoInput.files[0]); });

  dom.reviewStep3Back.addEventListener('click', () => { dom.reviewStep3.hidden = true; dom.reviewStep2.hidden = false; });
  dom.reviewStep3Skip.addEventListener('click', () => { state.reviewDraft.photoFile = null; submitReview(); });
  dom.reviewStep3Next.addEventListener('click', submitReview);

  dom.reviewStep4Close.addEventListener('click', closeReviewModal);
}

function handlePhotoFile(file) {
  if (!file.type.startsWith('image/')) return;
  state.reviewDraft.photoFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    dom.reviewPhotoPreview.src = reader.result;
    dom.reviewPhotoPreview.hidden = false;
  };
  reader.readAsDataURL(file);
}

async function submitReview() {
  dom.reviewStep3Next.disabled = true;
  dom.reviewStep3Next.textContent = 'Submitting…';
  try {
    let photoUrl = null;
    const user = getCurrentUser();
    if (state.reviewDraft.photoFile && user) {
      const path = `review-photos/${user.uid}/${Date.now()}-${state.reviewDraft.photoFile.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, state.reviewDraft.photoFile);
      photoUrl = await getDownloadURL(fileRef);
    }
    await addDoc(collection(db, 'pending_reviews'), {
      productId: state.product.id,
      productName: state.product.name,
      userId: user ? user.uid : null,
      displayName: (user && user.displayName) || 'Anonymous',
      stars: state.reviewDraft.stars,
      title: state.reviewDraft.title,
      content: state.reviewDraft.content,
      photoUrl,
      createdAt: serverTimestamp(),
    });
    dom.reviewStep3.hidden = true;
    dom.reviewStep4.hidden = false;
  } catch (err) {
    console.warn('review submit failed', err);
    showToast('Something went wrong submitting your review.');
  } finally {
    dom.reviewStep3Next.disabled = false;
    dom.reviewStep3Next.textContent = 'Next';
  }
}
