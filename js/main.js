'use strict';

/* ==========================================================================
   RARE VISION — main.js
   Vanilla JS only. No build step, no dependencies.

   Sections:
   1. CONFIG            — things YOU must edit before going live
   2. STATE + DOM refs
   3. INIT / DATA LOADING
   4. SEARCH + CATEGORY FILTERING
   5. RENDERING PRODUCTS
   6. CART (localStorage backed)
   7. CART PANEL UI (open/close)
   8. CHECKOUT -> TELEGRAM
   9. UTILITIES (toast, format, escape, debounce)
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. CONFIG
   -------------------------------------------------------------------------- */
const CONFIG = {
  // Create a bot with @BotFather on Telegram, copy the token it gives you.
  TELEGRAM_BOT_TOKEN: 'YOUR_BOT_TOKEN_HERE',

  // The chat ID that should RECEIVE new orders (your personal chat, or a
  // group/channel the bot has been added to). See README.md for how to find it.
  TELEGRAM_CHAT_ID: 'YOUR_CHAT_ID_HERE',

  PRODUCTS_URL: 'data/products.json',
  CURRENCY: 'ج.م',
  CART_STORAGE_KEY: 'rareVisionCart',
  STORE_NAME: 'Rare Vision',
};

/* --------------------------------------------------------------------------
   2. STATE + DOM REFS
   -------------------------------------------------------------------------- */
const state = {
  products: [],
  filtered: [],
  activeCategory: 'all',
  searchTerm: '',
  cart: [],           // [{id, qty}]
  isSubmitting: false,
};

const dom = {
  productsGrid: document.getElementById('productsGrid'),
  emptyState: document.getElementById('emptyState'),
  loadingState: document.getElementById('loadingState'),
  resultsMeta: document.getElementById('resultsMeta'),
  searchInput: document.getElementById('searchInput'),
  searchClear: document.getElementById('searchClear'),
  categoryChips: document.getElementById('categoryChips'),
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
    state.products = Array.isArray(data) ? data : [];
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
   4. SEARCH + CATEGORY FILTERING
   -------------------------------------------------------------------------- */
function buildCategoryChips() {
  const categories = [];
  const seen = new Set();

  state.products.forEach((p) => {
    if (!seen.has(p.category)) {
      seen.add(p.category);
      categories.push({ id: p.category, label: p.categoryLabel || p.category });
    }
  });

  const chipsHtml = [
    `<button class="chip active" data-category="all">الكل</button>`,
    ...categories.map(
      (c) => `<button class="chip" data-category="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`
    ),
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

  state.filtered = state.products.filter((p) => {
    const matchesCategory = cat === 'all' || p.category === cat;
    if (!matchesCategory) return false;
    if (!term) return true;
    const haystack = `${p.name} ${p.brand} ${p.categoryLabel || ''}`.toLowerCase();
    return haystack.includes(term);
  });

  renderProducts(state.filtered);
}

/* --------------------------------------------------------------------------
   5. RENDERING PRODUCTS
   -------------------------------------------------------------------------- */
function renderProducts(list) {
  dom.resultsMeta.textContent = `عدد النتائج: ${list.length}`;

  if (list.length === 0) {
    dom.productsGrid.innerHTML = '';
    dom.emptyState.hidden = false;
    return;
  }
  dom.emptyState.hidden = true;

  dom.productsGrid.innerHTML = list
    .map((p, i) => {
      const onSale = p.oldPrice && p.oldPrice > p.price;
      const badge = !p.inStock
        ? ''
        : p.isNew
        ? `<span class="card-badge new">جديد</span>`
        : onSale
        ? `<span class="card-badge">خصم</span>`
        : '';

      return `
      <article class="product-card" style="animation-delay:${Math.min(i, 8) * 40}ms">
        <div class="card-media">
          <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">
          ${badge}
          ${!p.inStock ? '<div class="out-of-stock">غير متوفر حالياً</div>' : ''}
        </div>
        <div class="card-body">
          <span class="card-brand">${escapeHtml(p.brand)}</span>
          <h3 class="card-name">${escapeHtml(p.name)}</h3>
          <div class="card-price-row">
            <span class="card-price">${formatPrice(p.price)}</span>
            ${onSale ? `<span class="card-price-old">${formatPrice(p.oldPrice)}</span>` : ''}
          </div>
          <button class="card-add" data-id="${escapeHtml(p.id)}" ${!p.inStock ? 'disabled' : ''}>
            ${p.inStock ? 'أضف للسلة' : 'غير متوفر'}
          </button>
        </div>
      </article>`;
    })
    .join('');

  dom.productsGrid.querySelectorAll('.card-add').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      addToCart(btn.dataset.id);
      btn.classList.add('added');
      const original = btn.textContent;
      btn.textContent = 'أُضيف ✓';
      setTimeout(() => {
        btn.classList.remove('added');
        btn.textContent = original;
      }, 1100);
    });
  });
}

/* --------------------------------------------------------------------------
   6. CART (localStorage backed)
   -------------------------------------------------------------------------- */
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

function addToCart(id) {
  const product = findProduct(id);
  if (!product || !product.inStock) return;

  const existing = state.cart.find((item) => item.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({ id, qty: 1 });
  }
  saveCart();
  renderCart();
  updateCartBadge();
  showToast(`تمت إضافة "${product.name}" إلى السلة`);
}

function changeQty(id, delta) {
  const item = state.cart.find((i) => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter((i) => i.id !== id);
  }
  saveCart();
  renderCart();
  updateCartBadge();
}

function removeFromCart(id) {
  state.cart = state.cart.filter((i) => i.id !== id);
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
      .map(
        ({ item, product }) => `
      <div class="cart-item" data-id="${escapeHtml(product.id)}">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
        <div>
          <p class="cart-item-name">${escapeHtml(product.name)}</p>
          <span class="cart-item-price">${formatPrice(product.price)}</span>
          <div class="cart-item-qty">
            <button class="qty-btn" data-action="dec" data-id="${escapeHtml(product.id)}">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" data-action="inc" data-id="${escapeHtml(product.id)}">+</button>
          </div>
        </div>
        <button class="cart-item-remove" data-action="remove" data-id="${escapeHtml(product.id)}">إزالة</button>
      </div>`
      )
      .join('');
  }

  dom.cartTotal.textContent = formatPrice(cartTotal());

  dom.cartItems.querySelectorAll('[data-action="inc"]').forEach((b) =>
    b.addEventListener('click', () => changeQty(b.dataset.id, 1))
  );
  dom.cartItems.querySelectorAll('[data-action="dec"]').forEach((b) =>
    b.addEventListener('click', () => changeQty(b.dataset.id, -1))
  );
  dom.cartItems.querySelectorAll('[data-action="remove"]').forEach((b) =>
    b.addEventListener('click', () => removeFromCart(b.dataset.id))
  );
}

/* --------------------------------------------------------------------------
   7. CART PANEL UI
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
   8. CHECKOUT -> TELEGRAM
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
      return `• ${p.name} × ${item.qty} — ${formatPrice(p.price * item.qty)}`;
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
   9. UTILITIES
   -------------------------------------------------------------------------- */
function formatPrice(amount) {
  const n = Number(amount) || 0;
  return `${n.toLocaleString('en-US')} ${CONFIG.CURRENCY}`;
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

/* --------------------------------------------------------------------------
   STATIC EVENT BINDINGS
   -------------------------------------------------------------------------- */
function bindStaticEvents() {
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
    dom.categoryChips.querySelector('.chip.active')?.classList.remove('active');
    dom.categoryChips.querySelector('[data-category="all"]')?.classList.add('active');
    applyFilters();
  });

  dom.cartToggle.addEventListener('click', openCart);
  dom.cartClose.addEventListener('click', closeCart);
  dom.cartOverlay.addEventListener('click', closeCart);
  dom.cartEmptyShop.addEventListener('click', closeCart);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCart();
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
