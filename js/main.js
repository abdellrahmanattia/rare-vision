'use strict';

/* ==========================================================================
   RARE VISION — main.js
   Vanilla JS only. No build step, no dependencies.

   Sections:
   1. CONFIG            — things YOU must edit before going live
   2. STATE + DOM refs
   3. INIT / DATA LOADING
   4. SEARCH + CATEGORY + GENDER FILTERING
   5. RENDERING PRODUCT CARDS
   6. PRODUCT DETAIL MODAL (gallery nav, dynamic sizing, dynamic pricing)
   7. CART (localStorage backed, size-aware line items)
   8. CART PANEL UI (open/close)
   9. CHECKOUT -> TELEGRAM
   10. UTILITIES (toast, format, escape, debounce, markdown-lite, stars)
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. CONFIG
   -------------------------------------------------------------------------- */
const CONFIG = {
  // Create a bot with @BotFather on Telegram, copy the token it gives you.
  TELEGRAM_BOT_TOKEN: '8628571545:AAE-aYI0nTra7T_k1WfcKNOm-bfS0CBZEmQ',

  // The chat ID that should RECEIVE new orders (your personal chat, or a
  // group/channel the bot has been added to). See README.md for how to find it.
  TELEGRAM_CHAT_ID: '6472884024',

  PRODUCTS_URL: 'data/products.json',
  CURRENCY: '$',
  CART_STORAGE_KEY: 'rareVisionCart',
  STORE_NAME: 'Rare Vision',
};

/* --------------------------------------------------------------------------
   2. STATE + DOM REFS
   -------------------------------------------------------------------------- */
const state = {
  products: [],
  filtered: [],
  activeCategory: 'all', // matches product.productType
  activeGender: 'all',   // matches product.gender
  searchTerm: '',
  cart: [],              // [{id, size /* string|null */, qty}]
  isSubmitting: false,

  // Product detail modal
  modalProduct: null,
  modalSelectedImage: '',
  modalSelectedSize: null,
  modalQty: 1,
};

const dom = {
  productsGrid: document.getElementById('productsGrid'),
  emptyState: document.getElementById('emptyState'),
  loadingState: document.getElementById('loadingState'),
  resultsMeta: document.getElementById('resultsMeta'),
  searchInput: document.getElementById('searchInput'),
  searchClear: document.getElementById('searchClear'),
  categoryChips: document.getElementById('categoryChips'),
  genderFilter: document.getElementById('genderFilter'),
  resetFilters: document.getElementById('resetFilters'),

  cartToggle: document.getElementById('cartToggle'),
  cartClose: document.getElementById('cartClose'),
  cartOverlay: document.getElementById('cartOverlay'),
  cartPanel: document.getElementById('cartPanel'),
  cartBadge: document.getElementById('cartBadge'),
  cartItems: document.getElementById('cartItems'),
  cartEmpty: document.getElementById('cartEmpty'),
  cartEmptyShop: document.getElementById('cartEmptyShop'),
  cartTotal: document.getElementById('cartTotal'),
  cartFooter: document.getElementById('cartFooter'),
  checkoutBtn: document.getElementById('checkoutBtn'),

  checkoutForm: document.getElementById('checkoutForm'),
  checkoutBack: document.getElementById('checkoutBack'),
  checkoutSubmit: document.getElementById('checkoutSubmit'),
  formError: document.getElementById('formError'),
  custName: document.getElementById('custName'),
  custPhone: document.getElementById('custPhone'),
  custAddress: document.getElementById('custAddress'),
  custNote: document.getElementById('custNote'),

  thankYou: document.getElementById('thankYou'),
  thankYouClose: document.getElementById('thankYouClose'),

  navToggle: document.getElementById('navToggle'),
  mainNav: document.getElementById('mainNav'),

  modalOverlay: document.getElementById('modalOverlay'),
  productModal: document.getElementById('productModal'),
  modalClose: document.getElementById('modalClose'),
  modalContent: document.getElementById('modalContent'),

  toast: document.getElementById('toast'),
  year: document.getElementById('year'),
};

/* --------------------------------------------------------------------------
   3. INIT / DATA LOADING
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  dom.year.textContent = new Date().getFullYear();
  state.cart = loadCart();
  updateCartBadge(); // item count doesn't depend on product data, safe to show immediately
  bindStaticEvents();

  try {
    const res = await fetch(CONFIG.PRODUCTS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    // Decap CMS "files" collections always write an object, so the file
    // looks like { "products": [...] }. We also accept a bare array so this
    // still works if you ever generate products.json some other way.
    state.products = Array.isArray(data) ? data : Array.isArray(data.products) ? data.products : [];
  } catch (err) {
    console.error('Failed to load products.json', err);
    dom.loadingState.innerHTML =
      '<p>تعذّر تحميل المنتجات. تأكد من وجود ملف data/products.json وحاول تحديث الصفحة.</p>';
    renderCart(); // still render whatever cart state we have
    return;
  }

  dom.loadingState.hidden = true;
  buildCategoryChips();
  applyFilters();
  renderCart(); // now product data is available to resolve names/images/prices
}

/* --------------------------------------------------------------------------
   4. SEARCH + CATEGORY + GENDER FILTERING
   -------------------------------------------------------------------------- */
function buildCategoryChips() {
  const types = [];
  const seen = new Set();

  state.products.forEach((p) => {
    if (p.productType && !seen.has(p.productType)) {
      seen.add(p.productType);
      types.push(p.productType);
    }
  });

  const chipsHtml = [
    `<button class="chip active" data-category="all">All</button>`,
    ...types.map((t) => `<button class="chip" data-category="${escapeHtml(t)}">${escapeHtml(t)}</button>`),
  ].join('');

  dom.categoryChips.innerHTML = chipsHtml;

  dom.categoryChips.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      dom.categoryChips.querySelector('.chip.active')?.classList.remove('active');
      chip.classList.add('active');
      state.activeCategory = chip.dataset.category;
      applyFilters();
    });
  });
}

const handleSearchInput = debounce(() => {
  state.searchTerm = dom.searchInput.value.trim().toLowerCase();
  dom.searchClear.hidden = state.searchTerm.length === 0;
  applyFilters();
}, 120);

function applyFilters() {
  const term = state.searchTerm;
  const cat = state.activeCategory;
  const gender = state.activeGender;

  state.filtered = state.products.filter((p) => {
    if (cat !== 'all' && p.productType !== cat) return false;
    if (gender !== 'all' && p.gender !== gender) return false;
    if (!term) return true;
    const haystack = `${p.name} ${p.brand} ${p.productType} ${p.shortDescription || ''}`.toLowerCase();
    return haystack.includes(term);
  });

  renderProducts(state.filtered);
}

/* --------------------------------------------------------------------------
   5. RENDERING PRODUCT CARDS
   -------------------------------------------------------------------------- */
function isProductAvailable(p) {
  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  if (sizes.length > 0) return sizes.some((s) => s.stockStatus === 'In Stock');
  return p.inStock !== false;
}

function renderProducts(list) {
  dom.resultsMeta.textContent = `عدد النتائج: ${list.length}`;

  if (list.length === 0) {
    dom.productsGrid.innerHTML = '';
    dom.emptyState.hidden = false;
    return;
  }
  dom.emptyState.hidden = true;
  dom.productsGrid.innerHTML = list.map((p, i) => productCardHtml(p, i)).join('');
}

function productCardHtml(p, index) {
  const onSale = typeof p.compareAtPrice === 'number' && p.compareAtPrice > p.price;
  const hasSizes = Array.isArray(p.sizes) && p.sizes.length > 0;
  const available = isProductAvailable(p);
  const badges = Array.isArray(p.badges) ? p.badges : [];

  const ctaLabel = !available ? 'Out of Stock' : hasSizes ? 'Select Size' : 'Add to Cart';
  const ctaAction = hasSizes ? 'open-modal' : 'quick-add';

  return `
  <article class="product-card" style="animation-delay:${Math.min(index, 8) * 40}ms" data-id="${escapeHtml(p.id)}">
    <div class="card-media" data-action="open-modal" data-id="${escapeHtml(p.id)}">
      <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">
      ${onSale ? '<span class="card-badge">Sale</span>' : ''}
      ${badges.length ? `<div class="badge-row">${badges.map((b) => `<span class="badge-pill">${escapeHtml(b)}</span>`).join('')}</div>` : ''}
      ${!available ? '<div class="out-of-stock">Out of Stock</div>' : ''}
    </div>
    <div class="card-body">
      <span class="card-brand">${escapeHtml(p.brand)}</span>
      <h3 class="card-name" data-action="open-modal" data-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</h3>
      <div class="card-rating">
        <span class="stars" aria-hidden="true">${renderStars(p.averageRating)}</span>
        <span class="rating-count">(${Number(p.reviewCount) || 0})</span>
      </div>
      <div class="card-price-row">
        <span class="card-price">${formatPrice(p.price)}</span>
        ${onSale ? `<span class="card-price-old">${formatPrice(p.compareAtPrice)}</span>` : ''}
      </div>
      <button class="card-add" data-action="${ctaAction}" data-id="${escapeHtml(p.id)}" ${!available ? 'disabled' : ''}>
        ${ctaLabel}
      </button>
    </div>
  </article>`;
}

// Event delegation: one listener handles every card, including cards
// re-rendered after filtering, so nothing needs to be re-bound manually.
function bindProductGridEvents() {
  dom.productsGrid.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const id = target.dataset.id;
    if (!id) return;

    if (target.dataset.action === 'open-modal') {
      openProductModal(id);
    } else if (target.dataset.action === 'quick-add') {
      const result = addToCart(id, null, 1);
      if (result.ok) {
        const product = findProduct(id);
        showToast(`تمت إضافة "${product.name}" إلى السلة`);
        const original = target.textContent;
        target.textContent = 'Added ✓';
        target.classList.add('added');
        setTimeout(() => {
          target.textContent = original;
          target.classList.remove('added');
        }, 1100);
      } else {
        showToast('This item is currently out of stock.');
      }
    }
  });
}

/* --------------------------------------------------------------------------
   6. PRODUCT DETAIL MODAL
   -------------------------------------------------------------------------- */
function openProductModal(id) {
  const product = findProduct(id);
  if (!product) return;

  state.modalProduct = product;
  state.modalSelectedImage = product.image;
  state.modalSelectedSize = null;
  state.modalQty = 1;

  dom.modalContent.innerHTML = modalTemplate(product);
  bindModalEvents(product);

  dom.modalOverlay.classList.add('show');
  dom.productModal.classList.add('open');
  dom.productModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeProductModal() {
  dom.modalOverlay.classList.remove('show');
  dom.productModal.classList.remove('open');
  dom.productModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  state.modalProduct = null;
}

function modalTemplate(p) {
  const onSale = typeof p.compareAtPrice === 'number' && p.compareAtPrice > p.price;
  const hasSizes = Array.isArray(p.sizes) && p.sizes.length > 0;
  const available = isProductAvailable(p);
  const badges = Array.isArray(p.badges) ? p.badges : [];
  const specs = Array.isArray(p.specifications) ? p.specifications : [];
  const thumbs = [p.image, ...(Array.isArray(p.gallery) ? p.gallery : [])];

  return `
    <div class="modal-gallery">
      <div class="modal-main-image">
        <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" id="modalMainImage">
        ${onSale ? '<span class="card-badge">Sale</span>' : ''}
      </div>
      ${
        thumbs.length > 1
          ? `<div class="modal-thumbs" id="modalThumbs">
              ${thumbs
                .map(
                  (src, i) => `
                <button class="modal-thumb ${i === 0 ? 'active' : ''}" data-src="${escapeHtml(src)}">
                  <img src="${escapeHtml(src)}" alt="${escapeHtml(p.name)} view ${i + 1}">
                </button>`
                )
                .join('')}
            </div>`
          : ''
      }
    </div>

    <div class="modal-details">
      <span class="card-brand">${escapeHtml(p.brand)}</span>
      <h2 class="modal-title">${escapeHtml(p.name)}</h2>

      ${badges.length ? `<div class="badge-row static">${badges.map((b) => `<span class="badge-pill">${escapeHtml(b)}</span>`).join('')}</div>` : ''}

      <div class="card-rating">
        <span class="stars" aria-hidden="true">${renderStars(p.averageRating)}</span>
        <span class="rating-count">${(Number(p.averageRating) || 0).toFixed(1)} · ${Number(p.reviewCount) || 0} reviews</span>
      </div>

      <div class="modal-price-row">
        <span class="modal-price">${formatPrice(p.price)}</span>
        ${onSale ? `<span class="card-price-old">${formatPrice(p.compareAtPrice)}</span>` : ''}
      </div>

      <p class="modal-short-desc">${escapeHtml(p.shortDescription || '')}</p>

      ${
        hasSizes
          ? `<div class="size-select" id="sizeSelect">
              <span class="size-select-label">Select a size</span>
              <div class="size-grid" id="sizeGrid">
                ${p.sizes
                  .map(
                    (s) => `
                  <button
                    class="size-btn ${s.stockStatus !== 'In Stock' ? 'unavailable' : ''}"
                    data-size="${escapeHtml(s.size)}"
                    ${s.stockStatus !== 'In Stock' ? 'disabled' : ''}
                    aria-label="Size ${escapeHtml(s.size)}${s.stockStatus !== 'In Stock' ? ', out of stock' : ''}"
                  >${escapeHtml(s.size)}</button>`
                  )
                  .join('')}
              </div>
              <p class="size-error" id="sizeError" hidden>Please select a size before adding to cart.</p>
            </div>`
          : ''
      }

      <div class="qty-select">
        <span class="qty-select-label">Quantity</span>
        <div class="qty-stepper">
          <button class="qty-btn" id="modalQtyDec" type="button" aria-label="Decrease quantity">−</button>
          <span class="qty-value" id="modalQtyValue">1</span>
          <button class="qty-btn" id="modalQtyInc" type="button" aria-label="Increase quantity">+</button>
        </div>
      </div>

      <button class="btn btn-primary btn-block" id="modalAddToCart" ${!available ? 'disabled' : ''}>
        ${available ? 'Add to Cart' : 'Out of Stock'}
      </button>

      ${
        specs.length
          ? `<div class="modal-specs">
              <h3>Specifications</h3>
              <dl class="spec-list">
                ${specs
                  .map(
                    (s) => `
                  <div class="spec-row">
                    <dt>${escapeHtml(s.label)}</dt>
                    <dd>${escapeHtml(s.value)}</dd>
                  </div>`
                  )
                  .join('')}
              </dl>
            </div>`
          : ''
      }

      ${
        p.description
          ? `<div class="modal-description">
              <h3>Product Details</h3>
              ${renderMarkdownLite(p.description)}
            </div>`
          : ''
      }
    </div>
  `;
}

function bindModalEvents(product) {
  // Gallery: clicking a thumbnail swaps the main image, no full re-render.
  const thumbs = document.getElementById('modalThumbs');
  if (thumbs) {
    thumbs.querySelectorAll('.modal-thumb').forEach((btn) => {
      btn.addEventListener('click', () => {
        const src = btn.dataset.src;
        state.modalSelectedImage = src;
        document.getElementById('modalMainImage').src = src;
        thumbs.querySelector('.modal-thumb.active')?.classList.remove('active');
        btn.classList.add('active');
      });
    });
  }

  // Sizes: clicking selects a size (disabled/out-of-stock sizes can't be clicked).
  const sizeGrid = document.getElementById('sizeGrid');
  if (sizeGrid) {
    sizeGrid.querySelectorAll('.size-btn:not(:disabled)').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.modalSelectedSize = btn.dataset.size;
        sizeGrid.querySelector('.size-btn.selected')?.classList.remove('selected');
        btn.classList.add('selected');
        document.getElementById('sizeError').hidden = true;
      });
    });
  }

  // Quantity stepper
  const qtyValueEl = document.getElementById('modalQtyValue');
  document.getElementById('modalQtyDec')?.addEventListener('click', () => {
    state.modalQty = Math.max(1, state.modalQty - 1);
    qtyValueEl.textContent = state.modalQty;
  });
  document.getElementById('modalQtyInc')?.addEventListener('click', () => {
    state.modalQty = Math.min(99, state.modalQty + 1);
    qtyValueEl.textContent = state.modalQty;
  });

  // Add to cart
  document.getElementById('modalAddToCart')?.addEventListener('click', () => {
    const hasSizes = Array.isArray(product.sizes) && product.sizes.length > 0;

    if (hasSizes && !state.modalSelectedSize) {
      const errorEl = document.getElementById('sizeError');
      if (errorEl) errorEl.hidden = false;
      return;
    }

    const result = addToCart(product.id, state.modalSelectedSize, state.modalQty);
    if (result.ok) {
      showToast(`تمت إضافة "${product.name}" إلى السلة`);
      closeProductModal();
      openCart();
    } else if (result.reason === 'out-of-stock') {
      showToast('This item is currently out of stock.');
    }
  });
}

/* --------------------------------------------------------------------------
   7. CART (localStorage backed, size-aware line items)
   -------------------------------------------------------------------------- */
function cartKey(id, size) {
  return `${id}::${size || 'none'}`;
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CONFIG.CART_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Could not read cart from localStorage', err);
    return [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(CONFIG.CART_STORAGE_KEY, JSON.stringify(state.cart));
  } catch (err) {
    console.warn('Could not save cart to localStorage', err);
  }
}

function findProduct(id) {
  return state.products.find((p) => p.id === id);
}

/**
 * Adds a product (optionally with a chosen size) to the cart.
 * Returns { ok: true } on success, or { ok: false, reason } on failure so
 * callers can decide how/where to surface the error (inline vs. toast).
 */
function addToCart(id, size, qty) {
  const product = findProduct(id);
  if (!product) return { ok: false, reason: 'not-found' };

  const sizes = Array.isArray(product.sizes) ? product.sizes : [];

  if (sizes.length > 0) {
    if (!size) return { ok: false, reason: 'size-required' };
    const sizeEntry = sizes.find((s) => s.size === size);
    if (!sizeEntry || sizeEntry.stockStatus !== 'In Stock') {
      return { ok: false, reason: 'out-of-stock' };
    }
  } else if (product.inStock === false) {
    return { ok: false, reason: 'out-of-stock' };
  }

  const key = cartKey(id, size);
  const existing = state.cart.find((item) => cartKey(item.id, item.size) === key);
  if (existing) {
    existing.qty += qty;
  } else {
    state.cart.push({ id, size: size || null, qty });
  }

  saveCart();
  renderCart();
  updateCartBadge();
  return { ok: true };
}

function changeQty(id, size, delta) {
  const key = cartKey(id, size);
  const item = state.cart.find((i) => cartKey(i.id, i.size) === key);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter((i) => cartKey(i.id, i.size) !== key);
  }
  saveCart();
  renderCart();
  updateCartBadge();
}

function removeFromCart(id, size) {
  const key = cartKey(id, size);
  state.cart = state.cart.filter((i) => cartKey(i.id, i.size) !== key);
  saveCart();
  renderCart();
  updateCartBadge();
}

function cartTotal() {
  return state.cart.reduce((sum, item) => {
    const product = findProduct(item.id);
    return product ? sum + product.price * item.qty : sum;
  }, 0);
}

function cartCount() {
  return state.cart.reduce((sum, item) => sum + item.qty, 0);
}

function updateCartBadge() {
  const count = cartCount();
  dom.cartBadge.textContent = count;
  dom.cartBadge.classList.toggle('show', count > 0);
}

function renderCart() {
  const items = state.cart
    .map((item) => ({ item, product: findProduct(item.id) }))
    .filter((x) => x.product);

  if (items.length === 0) {
    dom.cartItems.innerHTML = '';
    dom.cartEmpty.classList.add('show');
    dom.checkoutBtn.disabled = true;
  } else {
    dom.cartEmpty.classList.remove('show');
    dom.checkoutBtn.disabled = false;
    dom.cartItems.innerHTML = items
      .map(({ item, product }) => {
        const idAttr = escapeHtml(item.id);
        const sizeAttr = escapeHtml(item.size || '');
        return `
      <div class="cart-item">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
        <div>
          <p class="cart-item-name">${escapeHtml(product.name)}</p>
          ${item.size ? `<span class="cart-item-size">المقاس: ${escapeHtml(item.size)}</span>` : ''}
          <span class="cart-item-price">${formatPrice(product.price)}</span>
          <div class="cart-item-qty">
            <button class="qty-btn" data-action="dec" data-id="${idAttr}" data-size="${sizeAttr}">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" data-action="inc" data-id="${idAttr}" data-size="${sizeAttr}">+</button>
          </div>
        </div>
        <button class="cart-item-remove" data-action="remove" data-id="${idAttr}" data-size="${sizeAttr}">إزالة</button>
      </div>`;
      })
      .join('');
  }

  dom.cartTotal.textContent = formatPrice(cartTotal());

  dom.cartItems.querySelectorAll('[data-action="inc"]').forEach((b) =>
    b.addEventListener('click', () => changeQty(b.dataset.id, b.dataset.size || null, 1))
  );
  dom.cartItems.querySelectorAll('[data-action="dec"]').forEach((b) =>
    b.addEventListener('click', () => changeQty(b.dataset.id, b.dataset.size || null, -1))
  );
  dom.cartItems.querySelectorAll('[data-action="remove"]').forEach((b) =>
    b.addEventListener('click', () => removeFromCart(b.dataset.id, b.dataset.size || null))
  );
}

/* --------------------------------------------------------------------------
   8. CART PANEL UI
   -------------------------------------------------------------------------- */
function openCart() {
  dom.cartPanel.classList.add('open');
  dom.cartOverlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  dom.cartPanel.classList.remove('open');
  dom.cartOverlay.classList.remove('show');
  document.body.style.overflow = '';
  hideCheckoutForm();
}

/* --------------------------------------------------------------------------
   9. CHECKOUT -> TELEGRAM
   -------------------------------------------------------------------------- */
function showCheckoutForm() {
  document.getElementById('cartBody').hidden = true;
  dom.checkoutForm.hidden = false;
  dom.cartFooter.hidden = true;
  dom.formError.hidden = true;
}

function hideCheckoutForm() {
  dom.checkoutForm.hidden = true;
  dom.cartFooter.hidden = false;
  document.getElementById('cartBody').hidden = false;
  dom.thankYou.hidden = true;
}

function validateCheckoutForm() {
  const name = dom.custName.value.trim();
  const phone = dom.custPhone.value.trim();
  const address = dom.custAddress.value.trim();
  const digitsOnly = phone.replace(/\D/g, '');

  if (name.length < 3) return 'من فضلك أدخل اسمك كاملاً.';
  if (digitsOnly.length < 8) return 'من فضلك أدخل رقم هاتف صحيح.';
  if (address.length < 8) return 'من فضلك أدخل عنوان تفصيلي للتوصيل.';
  return null;
}

function buildOrderMessage() {
  const name = dom.custName.value.trim();
  const phone = dom.custPhone.value.trim();
  const address = dom.custAddress.value.trim();
  const note = dom.custNote.value.trim();
  const orderId = 'RV-' + Date.now().toString().slice(-6);

  const lines = state.cart
    .map((item) => {
      const p = findProduct(item.id);
      if (!p) return null;
      const sizeLabel = item.size ? ` (Size: ${item.size})` : '';
      return `• ${p.name}${sizeLabel} × ${item.qty} — ${formatPrice(p.price * item.qty)}`;
    })
    .filter(Boolean)
    .join('\n');

  return [
    `🛍️ <b>طلب جديد — ${CONFIG.STORE_NAME}</b>`,
    `رقم الطلب: <b>${orderId}</b>`,
    '',
    `👤 الاسم: ${escapeHtml(name)}`,
    `📞 الهاتف: ${escapeHtml(phone)}`,
    `📍 العنوان: ${escapeHtml(address)}`,
    note ? `📝 ملاحظات: ${escapeHtml(note)}` : null,
    '',
    `<b>المنتجات:</b>`,
    lines,
    '',
    `💰 <b>الإجمالي: ${formatPrice(cartTotal())}</b>`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

async function submitOrder(e) {
  e.preventDefault();
  if (state.isSubmitting) return;

  const error = validateCheckoutForm();
  if (error) {
    dom.formError.textContent = error;
    dom.formError.hidden = false;
    return;
  }
  dom.formError.hidden = true;

  if (
    CONFIG.TELEGRAM_BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE' ||
    CONFIG.TELEGRAM_CHAT_ID === 'YOUR_CHAT_ID_HERE'
  ) {
    dom.formError.textContent =
      'لم يتم إعداد بوت تيليجرام بعد. الرجاء تعديل TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID في js/main.js (راجع README.md).';
    dom.formError.hidden = false;
    return;
  }

  setSubmitting(true);

  try {
    const message = buildOrderMessage();
    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CONFIG.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.description || 'Telegram API error');
    }

    // Success: clear cart, show thank-you state
    state.cart = [];
    saveCart();
    renderCart();
    updateCartBadge();
    dom.checkoutForm.reset();
    dom.checkoutForm.hidden = true;
    dom.cartFooter.hidden = true;
    document.getElementById('cartBody').hidden = true;
    dom.thankYou.hidden = false;
  } catch (err) {
    console.error('Failed to send order to Telegram', err);
    dom.formError.textContent =
      'حدث خطأ أثناء إرسال الطلب. تأكد من اتصالك بالإنترنت وحاول مرة أخرى، أو تواصل معنا مباشرة.';
    dom.formError.hidden = false;
  } finally {
    setSubmitting(false);
  }
}

function setSubmitting(isSubmitting) {
  state.isSubmitting = isSubmitting;
  dom.checkoutSubmit.disabled = isSubmitting;
  dom.checkoutSubmit.querySelector('.btn-text').hidden = isSubmitting;
  dom.checkoutSubmit.querySelector('.btn-spinner').hidden = !isSubmitting;
}

/* --------------------------------------------------------------------------
   10. UTILITIES
   -------------------------------------------------------------------------- */
function formatPrice(amount) {
  const n = Number(amount) || 0;
  return `${CONFIG.CURRENCY}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => dom.toast.classList.remove('show'), 2400);
}

// Renders a fixed 5-star row, filling stars up to the nearest whole number.
// (A simplified alternative to half-star precision — swap in an SVG-based
// renderer later if you want fractional stars.)
function renderStars(rating) {
  const rounded = Math.round(Number(rating) || 0);
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="star ${i <= rounded ? 'filled' : ''}">★</span>`;
  }
  return html;
}

// A deliberately small, dependency-free Markdown subset renderer.
// Supports: **bold**, *italic*, [text](url) links, "- " bullet lists,
// "1. " numbered lists, and paragraphs (blank-line OR list-boundary separated).
// The source text is HTML-escaped BEFORE any tags are added, so this is
// safe to use even if the CMS content ever contains stray angle brackets.
//
// Deliberately line-based rather than blank-line-block-based: CMS authors
// very often type a lead-in line directly above a list with no blank line
// in between (e.g. "Highlights:" followed immediately by "- Feature one"),
// and that lead-in line still needs to render as its own paragraph rather
// than getting swallowed into a non-list block.
function renderMarkdownLite(raw) {
  if (!raw) return '';
  const lines = escapeHtml(raw).split('\n');

  const htmlBlocks = [];
  let paragraphLines = [];

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      htmlBlocks.push(`<p>${inlineMarkdown(paragraphLines.join('<br>'))}</p>`);
      paragraphLines = [];
    }
  }

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed === '') {
      flushParagraph();
      i++;
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      flushParagraph();
      const items = [];
      while (i < lines.length && /^-\s+/.test(lines[i].trim())) {
        items.push(`<li>${inlineMarkdown(lines[i].trim().replace(/^-\s+/, ''))}</li>`);
        i++;
      }
      htmlBlocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(`<li>${inlineMarkdown(lines[i].trim().replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
      }
      htmlBlocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    paragraphLines.push(trimmed);
    i++;
  }
  flushParagraph();

  return htmlBlocks.join('');
}

function inlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

/* --------------------------------------------------------------------------
   STATIC EVENT BINDINGS
   -------------------------------------------------------------------------- */
function bindStaticEvents() {
  bindProductGridEvents();

  dom.searchInput.addEventListener('input', handleSearchInput);
  dom.searchClear.addEventListener('click', () => {
    dom.searchInput.value = '';
    state.searchTerm = '';
    dom.searchClear.hidden = true;
    applyFilters();
  });
  dom.resetFilters.addEventListener('click', () => {
    dom.searchInput.value = '';
    state.searchTerm = '';
    dom.searchClear.hidden = true;
    state.activeCategory = 'all';
    state.activeGender = 'all';
    dom.genderFilter.value = 'all';
    dom.categoryChips.querySelector('.chip.active')?.classList.remove('active');
    dom.categoryChips.querySelector('[data-category="all"]')?.classList.add('active');
    applyFilters();
  });

  dom.genderFilter.addEventListener('change', () => {
    state.activeGender = dom.genderFilter.value;
    applyFilters();
  });

  dom.cartToggle.addEventListener('click', openCart);
  dom.cartClose.addEventListener('click', closeCart);
  dom.cartOverlay.addEventListener('click', closeCart);
  dom.cartEmptyShop.addEventListener('click', closeCart);

  dom.modalOverlay.addEventListener('click', closeProductModal);
  dom.modalClose.addEventListener('click', closeProductModal);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (dom.productModal.classList.contains('open')) {
      closeProductModal();
    } else {
      closeCart();
    }
  });

  dom.checkoutBtn.addEventListener('click', showCheckoutForm);
  dom.checkoutBack.addEventListener('click', hideCheckoutForm);
  dom.checkoutForm.addEventListener('submit', submitOrder);
  dom.thankYouClose.addEventListener('click', closeCart);

  dom.navToggle.addEventListener('click', () => {
    dom.mainNav.classList.toggle('open');
  });
  dom.mainNav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => dom.mainNav.classList.remove('open'))
  );
}
