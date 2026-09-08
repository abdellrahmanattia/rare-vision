'use strict';

/* ==========================================================================
   RARE VISION — cart.js
   The cart drawer, extracted so index.html / shop.html / product.html can
   all share one implementation instead of three copies. Relies on globals
   from js/shared.js (CONFIG, loadCart, saveCart, formatPrice, etc.) which
   must be loaded BEFORE this file, and on the matching cart-panel markup
   existing in the page (see any page's "CART OVERLAY + PANEL" block).
   Loaded as an ES module.
   ========================================================================== */

import {
  db, collection, query, where, getDocs, limit,
} from './firebase-init.js';
import { getProductById } from './products-data.js';

const CART_PANEL_HTML = `
<div class="overlay" id="cartOverlay"></div>
<aside class="cart-panel" id="cartPanel" aria-label="Shopping cart">
  <div class="cart-header">
    <h3>Your Cart</h3>
    <button class="icon-btn" id="cartClose" aria-label="Close cart">&times;</button>
  </div>
  <div class="cart-body" id="cartBody">
    <div class="free-shipping-bar" id="freeShippingBar" hidden>
      <p class="free-shipping-text" id="freeShippingText"></p>
      <div class="free-shipping-track"><div class="free-shipping-fill" id="freeShippingFill"></div></div>
    </div>
    <div class="cart-subtotal-block" id="cartSubtotalBlock" hidden>
      <div class="cart-subtotal-row"><span>Subtotal</span><span id="cartSubtotalAmount">LE 0.00</span></div>
      <div class="cart-subtotal-row cart-subtotal-row--muted"><span>Free Shipping</span><span id="cartSubtotalShippingNote">Add 2 items</span></div>
    </div>
    <div class="cart-items" id="cartItems"></div>
    <div class="cart-empty" id="cartEmpty">
      <p>Your cart is empty.</p>
      <a href="shop.html" class="btn-select-size" id="cartEmptyShop" style="display:inline-block;width:auto;padding:12px 28px;">Browse Products</a>
    </div>
    <div class="cart-accordion" id="shippingAccordion">
      <button type="button" class="accordion-trigger" id="shippingAccordionTrigger" aria-expanded="false" aria-controls="shippingAccordionPanel">
        <span>Shipping</span>
        <svg class="accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="accordion-panel" id="shippingAccordionPanel" hidden>
        <p>Delivery:<br>Standard shipping: 1-5 Working Days Excluding Friday!<br>Flat Rate: 85 EGP across Egypt.</p>
      </div>
    </div>
    <div class="cart-accordion" id="discountAccordion">
      <button type="button" class="accordion-trigger" id="discountAccordionTrigger" aria-expanded="false" aria-controls="discountAccordionPanel">
        <span>Discount</span>
        <svg class="accordion-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>
      </button>
      <div class="accordion-panel" id="discountAccordionPanel" hidden>
        <div class="discount-form">
          <input type="text" id="cartDiscountInput" placeholder="Discount code">
          <button type="button" class="btn-apply-discount" id="cartApplyDiscountBtn">Apply</button>
        </div>
        <p class="discount-message" id="cartDiscountMessage" hidden></p>
        <div class="cart-total-row cart-discount-row" id="cartDiscountRow" hidden>
          <span id="cartDiscountRowLabel">Discount</span>
          <span id="cartDiscountRowAmount">-LE 0.00</span>
        </div>
      </div>
    </div>
  </div>
  <div class="cart-footer" id="cartFooter">
    <div class="cart-total-row"><span>Total</span><span id="cartTotal">LE 0.00</span></div>
    <button class="btn-select-size" id="checkoutBtn" disabled>Complete Order</button>
  </div>
</aside>
`;
document.body.insertAdjacentHTML('beforeend', CART_PANEL_HTML);

const dom = {};
function grab() {
  [
    'cartToggle', 'cartClose', 'cartOverlay', 'cartPanel', 'cartBadge',
    'cartItems', 'cartEmpty', 'cartEmptyShop', 'cartTotal', 'cartFooter', 'checkoutBtn',
    'shippingAccordion', 'shippingAccordionTrigger', 'shippingAccordionPanel',
    'discountAccordion', 'discountAccordionTrigger', 'discountAccordionPanel',
    'cartDiscountInput', 'cartApplyDiscountBtn', 'cartDiscountMessage',
    'cartDiscountRow', 'cartDiscountRowLabel', 'cartDiscountRowAmount',
    'freeShippingBar', 'freeShippingText', 'freeShippingFill',
    'cartSubtotalBlock', 'cartSubtotalAmount', 'cartSubtotalShippingNote',
  ].forEach((id) => { dom[id] = document.getElementById(id); });
}

const state = { cart: [], discount: null };

export function cartCount() { return cartItemCount(state.cart); }

export function updateCartBadge() {
  const count = cartCount();
  if (!dom.cartBadge) return;
  dom.cartBadge.textContent = count;
  dom.cartBadge.classList.toggle('show', count > 0);
}

function cartLineTotal() {
  return state.cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
}

function discountAmount(subtotal) {
  if (!state.discount) return 0;
  if (state.discount.type === 'percent') return subtotal * (state.discount.value / 100);
  return 0; // shipping-type discounts are applied to the shipping line at checkout, not here
}

export function openCart() {
  dom.cartOverlay?.classList.add('show');
  dom.cartPanel?.classList.add('open');
}
export function closeCart() {
  dom.cartOverlay?.classList.remove('show');
  dom.cartPanel?.classList.remove('open');
}

export function renderCart() {
  if (!dom.cartItems) return;
  const items = state.cart;
  if (items.length === 0) {
    dom.cartItems.innerHTML = '';
    dom.cartEmpty?.classList.add('show');
    if (dom.checkoutBtn) dom.checkoutBtn.disabled = true;
  } else {
    dom.cartEmpty?.classList.remove('show');
    if (dom.checkoutBtn) dom.checkoutBtn.disabled = false;
    dom.cartItems.innerHTML = items.map((item) => `
      <div class="cart-item">
        <img src="${escapeHtml(item.image || '')}" alt="${escapeHtml(item.name)}">
        <div class="cart-item-info">
          <p class="cart-item-name">${escapeHtml(item.name)}</p>
          ${item.size ? `<p class="cart-item-size">Size: ${escapeHtml(item.size)}</p>` : ''}
          <p class="cart-item-price">${formatPrice(item.price)}</p>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" data-action="dec" data-id="${item.id}" data-size="${item.size || ''}">−</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" data-action="inc" data-id="${item.id}" data-size="${item.size || ''}">+</button>
        </div>
        <button class="cart-item-remove" data-action="remove" data-id="${item.id}" data-size="${item.size || ''}" aria-label="Remove">&times;</button>
      </div>`).join('');

    dom.cartItems.querySelectorAll('[data-action="inc"]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.id, b.dataset.size || null, 1)));
    dom.cartItems.querySelectorAll('[data-action="dec"]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.id, b.dataset.size || null, -1)));
    dom.cartItems.querySelectorAll('[data-action="remove"]').forEach((b) => b.addEventListener('click', () => removeFromCart(b.dataset.id, b.dataset.size || null)));
  }

  const subtotal = cartLineTotal();
  const disc = discountAmount(subtotal);
  const total = Math.max(0, subtotal - disc);
  if (dom.cartTotal) dom.cartTotal.textContent = formatPrice(total);

  if (dom.cartDiscountRow) {
    if (state.discount) {
      dom.cartDiscountRow.hidden = false;
      dom.cartDiscountRowLabel.textContent = `Discount (${state.discount.code})`;
      dom.cartDiscountRowAmount.textContent = `-${formatPrice(disc)}`;
    } else {
      dom.cartDiscountRow.hidden = true;
    }
  }

  if (dom.cartSubtotalBlock) {
    const count = cartCount();
    const threshold = CONFIG.FREE_SHIPPING_ITEM_THRESHOLD;
    if (threshold > 0 && items.length) {
      dom.cartSubtotalBlock.hidden = false;
      dom.cartSubtotalAmount.textContent = formatPrice(subtotal);
      const remaining = Math.max(0, threshold - count);
      dom.cartSubtotalShippingNote.textContent = remaining > 0 ? `Add ${remaining} more item${remaining === 1 ? '' : 's'}` : 'Unlocked!';
    } else {
      dom.cartSubtotalBlock.hidden = true;
    }
  }

  if (dom.freeShippingBar) {
    const threshold = CONFIG.FREE_SHIPPING_ITEM_THRESHOLD;
    if (threshold > 0 && items.length) {
      dom.freeShippingBar.hidden = false;
      const count = cartCount();
      const unlocked = qualifiesForFreeShipping(state.cart);
      dom.freeShippingBar.classList.toggle('unlocked', unlocked);
      const remaining = Math.max(0, threshold - count);
      dom.freeShippingText.innerHTML = unlocked
        ? '<strong>Free shipping unlocked!</strong>'
        : `Add <strong>${remaining}</strong> more item${remaining === 1 ? '' : 's'} for <strong>Free Shipping</strong>`;
      dom.freeShippingFill.style.width = `${Math.min(100, (count / threshold) * 100)}%`;
    } else {
      dom.freeShippingBar.hidden = true;
    }
  }

  updateCartBadge();
}

function changeQty(id, size, delta) {
  const key = cartKey(id, size);
  const item = state.cart.find((it) => cartKey(it.id, it.size) === key);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter((it) => cartKey(it.id, it.size) !== key);
  }
  saveCart(state.cart);
  renderCart();
}

function removeFromCart(id, size) {
  const key = cartKey(id, size);
  state.cart = state.cart.filter((it) => cartKey(it.id, it.size) !== key);
  saveCart(state.cart);
  renderCart();
}

export async function addToCart(product, size, qty, imageOverride) {
  const key = cartKey(product.id, size);
  const existing = state.cart.find((it) => cartKey(it.id, it.size) === key);
  if (existing) {
    existing.qty += qty;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      size: size || null,
      qty,
      image: imageOverride || product.image || (product.colorVariants && product.colorVariants[0]?.images?.[0]) || '',
    });
  }
  saveCart(state.cart);
  renderCart();
  openCart();
}

async function validatePromoCode(code) {
  const trimmed = (code || '').trim().toUpperCase();
  if (!trimmed) return null;
  try {
    const q = query(collection(db, 'promo_codes'), where('code', '==', trimmed), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const data = snap.docs[0].data();
    if (data.active === false) return null;
    return { code: trimmed, type: data.type, value: Number(data.value) || 0 };
  } catch (err) {
    console.warn('Promo lookup failed (check Firestore config):', err);
    return null;
  }
}

function bindAccordion(trigger, panel, wrapper) {
  trigger?.addEventListener('click', () => {
    const isOpen = wrapper.classList.toggle('open');
    panel.hidden = !isOpen;
    trigger.setAttribute('aria-expanded', String(isOpen));
  });
}

export function initCartDrawer() {
  grab();
  state.cart = loadCart();
  state.discount = loadDiscount();

  dom.cartToggle?.addEventListener('click', openCart);
  dom.cartClose?.addEventListener('click', closeCart);
  dom.cartOverlay?.addEventListener('click', closeCart);
  dom.cartEmptyShop?.addEventListener('click', () => { window.location.href = 'shop.html'; });

  bindAccordion(dom.shippingAccordionTrigger, dom.shippingAccordionPanel, dom.shippingAccordion);
  bindAccordion(dom.discountAccordionTrigger, dom.discountAccordionPanel, dom.discountAccordion);

  dom.cartApplyDiscountBtn?.addEventListener('click', async () => {
    dom.cartApplyDiscountBtn.disabled = true;
    dom.cartApplyDiscountBtn.textContent = '...';
    const result = await validatePromoCode(dom.cartDiscountInput.value);
    dom.cartApplyDiscountBtn.disabled = false;
    dom.cartApplyDiscountBtn.textContent = 'Apply';
    if (!result) {
      dom.cartDiscountMessage.hidden = false;
      dom.cartDiscountMessage.textContent = 'Invalid or expired code.';
      dom.cartDiscountMessage.style.color = 'var(--red)';
      return;
    }
    state.discount = result;
    saveDiscount(result);
    dom.cartDiscountMessage.hidden = false;
    dom.cartDiscountMessage.style.color = '#2c7a3d';
    dom.cartDiscountMessage.textContent = result.type === 'shipping' ? 'Free shipping applied!' : `${result.value}% off applied!`;
    renderCart();
  });

  dom.checkoutBtn?.addEventListener('click', () => { window.location.href = 'checkout.html'; });

  renderCart();
}

// Exposed for pages (like product.html) that add an item then want the
// drawer to reflect it immediately without re-importing everything.
export function getCartState() { return state; }
