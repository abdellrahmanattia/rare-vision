'use strict';

/* ==========================================================================
   RARE VISION — shared.js
   Config, cart storage, and formatting helpers shared between the
   storefront (index.html + js/main.js) and the checkout page
   (checkout.html + js/checkout.js). Load this file BEFORE main.js or
   checkout.js — both rely on the globals defined here.
   ========================================================================== */

const CONFIG = {
  // Telegram order notifications now go through functions/api/send-order.js
  // (a Cloudflare Pages Function) so the bot token never ships in client
  // code. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID as environment
  // variables on your Cloudflare Pages project (Settings → Environment
  // variables) — see README.md, "Telegram order notifications".

  // Required only for the "Pin Location" map on the checkout page. Get a
  // free key at console.cloud.google.com (enable the "Maps JavaScript API").
  // See README.md, "Setting up Pin Location (Google Maps)".
  GOOGLE_MAPS_API_KEY: 'YOUR_GOOGLE_MAPS_API_KEY_HERE',

  // Legacy one-time seed file — the live catalog now lives in the Firestore
  // `products` collection (see js/products-data.js and the admin
  // dashboard's "Import legacy catalog" button, which reads this file
  // once to populate Firestore). Nothing on the live site fetches this
  // URL directly anymore.
  PRODUCTS_URL: 'data/products.json',
  CURRENCY: 'LE',           // used across the storefront (product cards, cart drawer)
  CHECKOUT_CURRENCY: 'E£',  // used on the checkout page's line items, per spec
  CART_STORAGE_KEY: 'rareVisionCart',
  STORE_NAME: 'Rare Vision',
  FLAT_SHIPPING_RATE: 85, // EGP, flat rate across Egypt

  // Powers the cart drawer's "Add N more items for Free Shipping" progress
  // bar. Once the cart's total item count (sum of quantities, not distinct
  // products) reaches this number, shipping becomes genuinely free — both
  // the bar's message on index.html AND the actual shipping line on
  // checkout.html read this same number, so the promise the bar makes is
  // always honored at checkout. Set to 0 (or delete the line) to turn the
  // whole feature off — the bar simply stops rendering.
  FREE_SHIPPING_ITEM_THRESHOLD: 3,

  // Where an applied discount code is persisted (alongside the cart) so a
  // code entered in the cart drawer on index.html is still applied when the
  // shopper reaches checkout.html, and a code entered on checkout.html is
  // reflected back in the cart drawer — both pages always agree, the same
  // way they already agree on cart contents via CART_STORAGE_KEY.
  DISCOUNT_STORAGE_KEY: 'rareVisionDiscount',

  // Promo codes are now managed from the admin dashboard and stored in the
  // Firestore `promo_codes` collection (see js/cart.js / js/checkout.js
  // validatePromoCode()) instead of being hardcoded here.
};

// The 27 governorates of Egypt, in the exact order the checkout page's
// dropdown must display them (Cairo and Giza first, per spec).
const GOVERNORATES = [
  'Cairo', 'Giza', 'Al Beheira', 'Al Dakahlia', 'Al Faiyum', 'Al Gharbia',
  'Al Ismailia', 'Al Minya', 'Al Monufia', 'Al Qalyubia', 'Al Sharqia',
  'Alexandria', 'Aswan', 'Asyut', 'Beni Suef', 'Damietta', 'Kafr El Sheikh',
  'Luxor', 'Matrouh', 'New Valley', 'North Sinai', 'Port Said', 'Qena',
  'Red Sea', 'Sohag', 'South Sinai', 'Suez',
];

/* --------------------------------------------------------------------------
   CART STORAGE (localStorage, shared across both pages on the same origin)
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

function saveCart(cart) {
  try {
    localStorage.setItem(CONFIG.CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (err) {
    console.warn('Could not save cart to localStorage', err);
  }
}

// Total item count across the cart (sum of quantities) — used by the
// "Free Shipping" progress bar and the matching checkout shipping logic.
function cartItemCount(cart) {
  return (cart || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
}

// Whether the cart has enough items to unlock free shipping. Shared by the
// cart drawer (index.html) and the checkout page so the bar's promise is
// always kept — see CONFIG.FREE_SHIPPING_ITEM_THRESHOLD above.
function qualifiesForFreeShipping(cart) {
  const threshold = CONFIG.FREE_SHIPPING_ITEM_THRESHOLD;
  if (!threshold || threshold <= 0) return false;
  return cartItemCount(cart) >= threshold;
}

/* --------------------------------------------------------------------------
   DISCOUNT STORAGE (localStorage, shared across both pages, same pattern
   as CART STORAGE above)
   -------------------------------------------------------------------------- */
function loadDiscount() {
  try {
    const raw = localStorage.getItem(CONFIG.DISCOUNT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Could not read discount from localStorage', err);
    return null;
  }
}

function saveDiscount(discount) {
  try {
    if (discount) {
      localStorage.setItem(CONFIG.DISCOUNT_STORAGE_KEY, JSON.stringify(discount));
    } else {
      localStorage.removeItem(CONFIG.DISCOUNT_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('Could not save discount to localStorage', err);
  }
}

/* --------------------------------------------------------------------------
   FORMATTING
   -------------------------------------------------------------------------- */
// Storefront price format, e.g. "LE 690.00" (product cards, cart drawer).
function formatPrice(amount) {
  const n = Number(amount) || 0;
  return `${CONFIG.CURRENCY} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Checkout page line-item format, e.g. "E£85.00" (no space, per spec).
function formatEGP(amount) {
  const n = Number(amount) || 0;
  return `${CONFIG.CHECKOUT_CURRENCY}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Checkout page Total-line format, e.g. "EGP 1,234.00" (per spec, distinct
// from the E£ notation used on the Subtotal/Shipping lines above it).
function formatTotalEGP(amount) {
  const n = Number(amount) || 0;
  return `EGP ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* --------------------------------------------------------------------------
   STARS + MARKDOWN-LITE (shared by main.js, shop.js, product.js)
   -------------------------------------------------------------------------- */
function renderStars(rating) {
  const rounded = Math.round(Number(rating) || 0);
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="star ${i <= rounded ? 'filled' : ''}">★</span>`;
  }
  return html;
}

// A deliberately small, dependency-free Markdown subset renderer. Supports
// **bold**, *italic*, [text](url) links, "- " bullets, "1. " numbered
// lists, and paragraphs. Source text is HTML-escaped first.
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
    if (trimmed === '') { flushParagraph(); i++; continue; }
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

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
