'use strict';

/* ==========================================================================
   RARE VISION — checkout.js
   Requires js/shared.js loaded first (CONFIG, GOVERNORATES, cart storage,
   formatters). Loaded as an ES module so it can talk to Firestore directly
   (live catalog, Firestore-backed promo codes, dual-save order write).

   Sections:
   1. STATE + DOM refs
   2. INIT
   3. GOVERNORATE DROPDOWN
   4. ORDER SUMMARY (items, discount code, totals)
   5. GOOGLE MAPS PIN LOCATION
   6. FORM VALIDATION + DUAL-SAVE SUBMISSION (Firestore + Telegram relay)
   7. UTILITIES
   ========================================================================== */

import {
  db, collection, addDoc, getDocs, query, where, limit, serverTimestamp, getCurrentUser,
} from './firebase-init.js';
import { getAllProducts } from './products-data.js';

/* --------------------------------------------------------------------------
   1. STATE + DOM REFS
   -------------------------------------------------------------------------- */
const state = {
  cart: [],
  products: [],
  mapPin: null,      // { lat, lng, mapsUrl } | null
  discount: null,    // { code, type: 'percent'|'shipping', value } | null
  isSubmitting: false,
};

const dom = {
  form: document.getElementById('checkoutPageForm'),
  firstName: document.getElementById('firstName'),
  lastName: document.getElementById('lastName'),
  phone: document.getElementById('phone'),
  customerEmail: document.getElementById('customerEmail'),
  fullAddress: document.getElementById('fullAddress'),
  governorate: document.getElementById('governorate'),
  orderNotes: document.getElementById('orderNotes'),

  pinLocationBtn: document.getElementById('pinLocationBtn'),
  pinLocationBtnText: document.getElementById('pinLocationBtnText'),
  pinLocationStatus: document.getElementById('pinLocationStatus'),

  shippingMethodPrice: document.getElementById('shippingMethodPrice'),

  formError: document.getElementById('checkoutFormError'),
  completeOrderBtn: document.getElementById('completeOrderBtn'),
  checkoutThankYou: document.getElementById('checkoutThankYou'),

  summaryItems: document.getElementById('summaryItems'),
  discountToggle: document.getElementById('discountToggle'),
  discountForm: document.getElementById('discountForm'),
  discountInput: document.getElementById('discountInput'),
  applyDiscountBtn: document.getElementById('applyDiscountBtn'),
  discountMessage: document.getElementById('discountMessage'),

  summarySubtotal: document.getElementById('summarySubtotal'),
  summaryDiscountRow: document.getElementById('summaryDiscountRow'),
  summaryDiscountLabel: document.getElementById('summaryDiscountLabel'),
  summaryDiscountAmount: document.getElementById('summaryDiscountAmount'),
  summaryShipping: document.getElementById('summaryShipping'),
  summaryTotal: document.getElementById('summaryTotal'),

  mapModalOverlay: document.getElementById('mapModalOverlay'),
  mapModal: document.getElementById('mapModal'),
  mapModalClose: document.getElementById('mapModalClose'),
  mapModalCancel: document.getElementById('mapModalCancel'),
  mapModalConfirm: document.getElementById('mapModalConfirm'),
  mapCanvas: document.getElementById('mapCanvas'),

  toast: document.getElementById('checkoutToast'),
};

/* --------------------------------------------------------------------------
   2. INIT
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  state.cart = loadCart();

  // Nothing to check out — send shoppers back rather than showing an empty page.
  if (state.cart.length === 0) {
    window.location.href = 'index.html#shop';
    return;
  }

  // Picks up a code already applied in the cart drawer on index.html (or a
  // previous visit to this page) — see CONFIG.DISCOUNT_STORAGE_KEY.
  state.discount = loadDiscount();

  populateGovernorates();
  dom.shippingMethodPrice.textContent = formatEGP(CONFIG.FLAT_SHIPPING_RATE);
  dom.summaryShipping.textContent = formatEGP(CONFIG.FLAT_SHIPPING_RATE);
  bindEvents();

  if (state.discount) {
    dom.discountInput.value = state.discount.code;
    dom.discountForm.hidden = false;
    const message =
      state.discount.type === 'shipping'
        ? `Code "${state.discount.code}" applied — free shipping.`
        : `Code "${state.discount.code}" applied.`;
    showDiscountMessage(message, false);
  }

  try {
    state.products = await getAllProducts();
  } catch (err) {
    console.error('Failed to load products from Firestore. Is js/firebase-init.js configured?', err);
  }

  renderSummary();
}

function findProduct(id) {
  return state.products.find((p) => p.id === id);
}

/* --------------------------------------------------------------------------
   3. GOVERNORATE DROPDOWN
   -------------------------------------------------------------------------- */
function populateGovernorates() {
  dom.governorate.innerHTML = GOVERNORATES.map(
    (g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`
  ).join('');
  dom.governorate.value = 'Cairo'; // default, per spec
}

/* --------------------------------------------------------------------------
   4. ORDER SUMMARY (items, discount code, totals)
   -------------------------------------------------------------------------- */
function cartSubtotal() {
  return state.cart.reduce((sum, item) => {
    const product = findProduct(item.id);
    return product ? sum + product.price * item.qty : sum;
  }, 0);
}

// Returns the discount amount in EGP for the current subtotal — a percent
// discount is computed off the subtotal; a "shipping" discount reduces the
// shipping line instead (handled separately in computeTotals()).
function computeDiscountAmount(subtotal) {
  if (!state.discount || state.discount.type !== 'percent') return 0;
  return subtotal * (state.discount.value / 100);
}

function computeShippingAfterDiscount() {
  const base = CONFIG.FLAT_SHIPPING_RATE;
  if (state.discount && state.discount.type === 'shipping') {
    return base * (1 - state.discount.value / 100);
  }
  // Cart drawer's "Add N more items for Free Shipping" bar promises free
  // shipping once the item count hits CONFIG.FREE_SHIPPING_ITEM_THRESHOLD —
  // honor that promise here too, using the same shared check.
  if (qualifiesForFreeShipping(state.cart)) return 0;
  return base;
}

function computeTotals() {
  const subtotal = cartSubtotal();
  const discountAmount = computeDiscountAmount(subtotal);
  const shipping = computeShippingAfterDiscount();
  const total = Math.max(0, subtotal - discountAmount) + shipping;
  return { subtotal, discountAmount, shipping, total };
}

function renderSummary() {
  const items = state.cart
    .map((item) => ({ item, product: findProduct(item.id) }))
    .filter((x) => x.product);

  dom.summaryItems.innerHTML = items
    .map(({ item, product }) => {
      return `
      <div class="summary-item">
        <div class="summary-item-thumb">
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
          <span class="summary-item-qty">${item.qty}</span>
        </div>
        <div class="summary-item-info">
          <p class="summary-item-name">${escapeHtml(product.name)}</p>
          ${item.size ? `<span class="summary-item-variant">Size: ${escapeHtml(item.size)}</span>` : ''}
        </div>
        <span class="summary-item-price">${formatEGP(product.price * item.qty)}</span>
      </div>`;
    })
    .join('');

  const { subtotal, discountAmount, shipping, total } = computeTotals();

  dom.summarySubtotal.textContent = formatEGP(subtotal);
  dom.summaryShipping.textContent = shipping === 0 ? 'FREE' : formatEGP(shipping);
  dom.summaryTotal.textContent = formatTotalEGP(total);
  dom.shippingMethodPrice.textContent = shipping === 0 ? 'FREE' : formatEGP(shipping);

  if (state.discount && discountAmount > 0) {
    dom.summaryDiscountRow.hidden = false;
    dom.summaryDiscountLabel.textContent = `Discount (${state.discount.code})`;
    dom.summaryDiscountAmount.textContent = `-${formatEGP(discountAmount)}`;
  } else {
    dom.summaryDiscountRow.hidden = true;
  }
}

function toggleDiscountForm() {
  dom.discountForm.hidden = !dom.discountForm.hidden;
  if (!dom.discountForm.hidden) dom.discountInput.focus();
}

async function applyDiscountCode() {
  const code = dom.discountInput.value.trim().toUpperCase();
  if (!code) return;

  dom.applyDiscountBtn.disabled = true;
  dom.applyDiscountBtn.textContent = '...';
  try {
    const q = query(collection(db, 'promo_codes'), where('code', '==', code), limit(1));
    const snap = await getDocs(q);
    const match = (!snap.empty && snap.docs[0].data().active !== false) ? snap.docs[0].data() : null;

    if (!match) {
      state.discount = null;
      saveDiscount(null);
      showDiscountMessage(`"${code}" is not a valid code.`, true);
      renderSummary();
      return;
    }

    state.discount = { code, type: match.type, value: Number(match.value) || 0 };
    saveDiscount(state.discount);
    showDiscountMessage(
      state.discount.type === 'shipping' ? `Code "${code}" applied — free shipping.` : `Code "${code}" applied.`,
      false
    );
    renderSummary();
  } catch (err) {
    console.warn('Promo lookup failed (check Firestore config in js/firebase-init.js):', err);
    showDiscountMessage('Could not check that code right now. Please try again.', true);
  } finally {
    dom.applyDiscountBtn.disabled = false;
    dom.applyDiscountBtn.textContent = 'Apply';
  }
}

function showDiscountMessage(text, isError) {
  dom.discountMessage.textContent = text;
  dom.discountMessage.hidden = false;
  dom.discountMessage.classList.toggle('error', isError);
}

/* --------------------------------------------------------------------------
   5. GOOGLE MAPS PIN LOCATION
   -------------------------------------------------------------------------- */
let mapInstance = null;
let mapMarker = null;
let mapsApiLoading = false;

function openMapModal() {
  dom.mapModalOverlay.classList.add('show');
  dom.mapModal.classList.add('open');
  dom.mapModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  if (!CONFIG.GOOGLE_MAPS_API_KEY || CONFIG.GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY_HERE') {
    dom.mapCanvas.innerHTML =
      '<p class="map-not-configured">Location pinning isn\'t set up yet — add a Google Maps API key in js/shared.js (see README.md, "Setting up Pin Location") to enable this.</p>';
    return;
  }

  if (window.google && window.google.maps) {
    initMap();
  } else if (!mapsApiLoading) {
    loadGoogleMapsScript();
  }
}

function loadGoogleMapsScript() {
  mapsApiLoading = true;
  window.__rareVisionInitMap = initMap;
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CONFIG.GOOGLE_MAPS_API_KEY)}&callback=__rareVisionInitMap`;
  script.async = true;
  script.onerror = () => {
    dom.mapCanvas.innerHTML =
      '<p class="map-not-configured">Could not load Google Maps. Check the API key and your internet connection.</p>';
  };
  document.head.appendChild(script);
}

function initMap() {
  const cairo = { lat: 30.0444, lng: 31.2357 };
  const startPosition = state.mapPin ? { lat: state.mapPin.lat, lng: state.mapPin.lng } : cairo;

  mapInstance = new google.maps.Map(dom.mapCanvas, {
    center: startPosition,
    zoom: 13,
    streetViewControl: false,
    fullscreenControl: false,
  });

  mapMarker = new google.maps.Marker({
    position: startPosition,
    map: mapInstance,
    draggable: true,
  });

  mapInstance.addListener('click', (e) => mapMarker.setPosition(e.latLng));
}

function closeMapModal() {
  dom.mapModalOverlay.classList.remove('show');
  dom.mapModal.classList.remove('open');
  dom.mapModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function confirmMapPin() {
  if (mapMarker) {
    const pos = mapMarker.getPosition();
    const lat = pos.lat();
    const lng = pos.lng();
    state.mapPin = { lat, lng, mapsUrl: `https://www.google.com/maps?q=${lat},${lng}` };
    dom.pinLocationStatus.hidden = false;
    dom.pinLocationBtnText.textContent = 'Location Pinned';
    dom.pinLocationBtn.classList.add('pinned');
  }
  closeMapModal();
}

/* --------------------------------------------------------------------------
   6. FORM VALIDATION + TELEGRAM SUBMISSION
   -------------------------------------------------------------------------- */
function validateForm() {
  const firstName = dom.firstName.value.trim();
  const lastName = dom.lastName.value.trim();
  const phone = dom.phone.value.trim();
  const address = dom.fullAddress.value.trim();
  const email = dom.customerEmail.value.trim();
  const digitsOnly = phone.replace(/\D/g, '');

  if (firstName.length < 2) return 'Please enter your first name.';
  if (lastName.length < 2) return 'Please enter your last name.';
  if (digitsOnly.length < 8) return 'Please enter a valid phone number.';
  if (address.length < 8) return 'Please enter a detailed delivery address.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address, or leave it blank.';
  return null;
}

// Builds the complete Telegram order message for the server relay
// (functions/api/send-order.js). Every field the checkout page collects is
// included: name, phone, full address, governorate, map pin (if set),
// notes, email (if given), itemized cart, subtotal, applied discount code +
// amount (if any), shipping, and final total.
function buildOrderMessage(orderId, orderItems, customerEmail) {
  const firstName = dom.firstName.value.trim();
  const lastName = dom.lastName.value.trim();
  const phone = dom.phone.value.trim();
  const address = dom.fullAddress.value.trim();
  const governorate = dom.governorate.value;
  const notes = dom.orderNotes.value.trim();

  const lines = orderItems
    .map((item) => {
      const sizeLabel = item.size ? ` (Size: ${item.size})` : '';
      return `• ${item.name}${sizeLabel} × ${item.qty} — ${formatEGP(item.price * item.qty)}`;
    })
    .join('\n');

  const { subtotal, discountAmount, shipping, total } = computeTotals();

  return [
    `🛍️ <b>New Order — ${CONFIG.STORE_NAME}</b>`,
    `Order ID: <b>${orderId}</b>`,
    '',
    `👤 Name: ${escapeHtml(firstName)} ${escapeHtml(lastName)}`,
    `📞 Phone: ${escapeHtml(phone)}`,
    customerEmail ? `✉️ Email: ${escapeHtml(customerEmail)}` : null,
    `📍 Address: ${escapeHtml(address)}`,
    `🏛️ Governorate: ${escapeHtml(governorate)}`,
    state.mapPin ? `📌 Pinned Location: ${state.mapPin.mapsUrl}` : null,
    notes ? `📝 Notes: ${escapeHtml(notes)}` : null,
    '',
    `<b>Items:</b>`,
    lines,
    '',
    `Subtotal: ${formatEGP(subtotal)}`,
    state.discount ? `Discount (${escapeHtml(state.discount.code)}): -${formatEGP(discountAmount)}` : null,
    `Shipping: ${formatEGP(shipping)}`,
    `💰 <b>Total: ${formatTotalEGP(total)}</b>`,
    '',
    `💳 Payment: Cash on Delivery (COD)`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

async function submitOrder(e) {
  e.preventDefault();
  if (state.isSubmitting) return;

  const error = validateForm();
  if (error) {
    showFormError(error);
    return;
  }
  hideFormError();
  setSubmitting(true);

  const orderId = 'RV-' + Date.now().toString().slice(-6);
  const { subtotal, discountAmount, shipping, total } = computeTotals();
  const customerEmail = dom.customerEmail.value.trim();
  const user = getCurrentUser();

  const orderItems = state.cart.map((item) => {
    const p = findProduct(item.id);
    return {
      id: item.id,
      name: p ? p.name : item.id,
      size: item.size || null,
      qty: item.qty,
      price: p ? p.price : 0,
    };
  });

  const orderDoc = {
    orderId,
    customer: {
      firstName: dom.firstName.value.trim(),
      lastName: dom.lastName.value.trim(),
      phone: dom.phone.value.trim(),
      address: dom.fullAddress.value.trim(),
      governorate: dom.governorate.value,
      notes: dom.orderNotes.value.trim(),
      mapPin: state.mapPin ? state.mapPin.mapsUrl : null,
    },
    customerEmail: customerEmail || null,
    userId: user ? user.uid : null,
    items: orderItems,
    subtotal, shipping, total,
    discount: state.discount ? { code: state.discount.code, type: state.discount.type, value: state.discount.value, amount: discountAmount } : null,
    orderStatus: 'Pending',
    createdAt: serverTimestamp(),
  };

  // 1) Firestore is the source of truth for order tracking + the review
  //    unlock check — if this fails we stop rather than risk an order that
  //    can never be tracked or marked Delivered.
  try {
    await addDoc(collection(db, 'orders'), orderDoc);
  } catch (err) {
    console.error('Failed to save order to Firestore. Is js/firebase-init.js configured (see README.md)?', err);
    showFormError('Something went wrong saving your order. Please check your connection and try again, or contact us directly.');
    setSubmitting(false);
    return;
  }

  // 2) Best-effort Telegram notification via the server relay (keeps the
  //    bot token out of client code — see functions/api/send-order.js).
  //    The order is already safely in Firestore even if this step fails.
  try {
    const res = await fetch('/api/send-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: buildOrderMessage(orderId, orderItems, customerEmail) }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
  } catch (err) {
    console.warn('Telegram notification failed (order is still saved in Firestore):', err);
  }

  saveCart([]);
  saveDiscount(null);
  dom.form.hidden = true;
  dom.checkoutThankYou.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setSubmitting(false);
}

function showFormError(message) {
  dom.formError.textContent = message;
  dom.formError.hidden = false;
  dom.formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideFormError() {
  dom.formError.hidden = true;
}

function setSubmitting(isSubmitting) {
  state.isSubmitting = isSubmitting;
  dom.completeOrderBtn.disabled = isSubmitting;
  dom.completeOrderBtn.querySelector('.btn-text').hidden = isSubmitting;
  dom.completeOrderBtn.querySelector('.btn-spinner').hidden = !isSubmitting;
}

/* --------------------------------------------------------------------------
   7. UTILITIES
   -------------------------------------------------------------------------- */
function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => dom.toast.classList.remove('show'), 2400);
}

function bindEvents() {
  dom.form.addEventListener('submit', submitOrder);

  dom.discountToggle.addEventListener('click', toggleDiscountForm);
  dom.applyDiscountBtn.addEventListener('click', applyDiscountCode);
  dom.discountInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyDiscountCode();
    }
  });

  dom.pinLocationBtn.addEventListener('click', openMapModal);
  dom.mapModalOverlay.addEventListener('click', closeMapModal);
  dom.mapModalClose.addEventListener('click', closeMapModal);
  dom.mapModalCancel.addEventListener('click', closeMapModal);
  dom.mapModalConfirm.addEventListener('click', confirmMapPin);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dom.mapModal.classList.contains('open')) closeMapModal();
  });
}
