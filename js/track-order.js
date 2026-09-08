'use strict';

/* ==========================================================================
   RARE VISION — track-order.js
   Guest email lookup (Phase 4.4). See firestore.rules for the read-access
   trade-off this relies on ("orders" is readable by anyone who supplies a
   customerEmail, matching this project's existing philosophy of trading a
   little bit of guessability for zero backend infrastructure — see README).
   ========================================================================== */

import {
  db, collection, query, where, getDocs, orderBy, onAuthChange,
} from './firebase-init.js';

const dom = {};
const STEPS = ['Pending', 'Shipped', 'Delivered'];

document.addEventListener('DOMContentLoaded', () => {
  ['trackEmailInput', 'trackLookupBtn', 'trackError', 'trackResults', 'trackEmpty', 'trackLoading', 'trackSubtitle']
    .forEach((id) => { dom[id] = document.getElementById(id); });

  dom.trackLookupBtn.addEventListener('click', () => lookup(dom.trackEmailInput.value.trim()));
  dom.trackEmailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookup(dom.trackEmailInput.value.trim()); });

  // If already signed in, look up their orders automatically by email too
  // (orders are matched on customerEmail, which is simplest given guest
  // checkout doesn't require an account).
  onAuthChange((user) => {
    if (user && user.email) {
      dom.trackEmailInput.value = user.email;
      dom.trackSubtitle.textContent = `Showing orders for ${user.email}`;
      lookup(user.email);
    }
  });
});

async function lookup(email) {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(email)) {
    dom.trackError.textContent = 'Please enter a valid email address.';
    dom.trackError.hidden = false;
    return;
  }
  dom.trackError.hidden = true;
  dom.trackResults.innerHTML = '';
  dom.trackEmpty.hidden = true;
  dom.trackLoading.hidden = false;

  try {
    const q = query(collection(db, 'orders'), where('customerEmail', '==', email), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    dom.trackLoading.hidden = true;
    if (snap.empty) { dom.trackEmpty.hidden = false; return; }
    dom.trackResults.innerHTML = snap.docs.map((d) => orderCardHtml({ id: d.id, ...d.data() })).join('');
  } catch (err) {
    dom.trackLoading.hidden = true;
    console.warn('Order lookup failed:', err);
    dom.trackError.textContent = 'Could not look up orders right now. Please try again in a moment.';
    dom.trackError.hidden = false;
  }
}

function fmtDate(ts) {
  const ms = ts && ts.seconds ? ts.seconds * 1000 : (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0);
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function orderCardHtml(order) {
  const currentIndex = Math.max(0, STEPS.indexOf(order.orderStatus || 'Pending'));
  const stepsHtml = STEPS.map((label, i) => {
    const cls = i < currentIndex ? 'done' : i === currentIndex ? 'current' : '';
    return `<div class="track-step ${cls}"><span class="dot">${i < currentIndex ? '✓' : i + 1}</span><span class="lbl">${label}</span></div>`;
  }).join('');

  const itemsHtml = (order.items || []).map((it) => `<div><span>${escapeHtml(it.name)}${it.size ? ` (${escapeHtml(it.size)})` : ''} × ${it.qty}</span><span>${formatPrice(it.price * it.qty)}</span></div>`).join('');

  return `
  <div class="track-order-card">
    <div class="track-order-head">
      <span>Order ${escapeHtml(order.orderId || order.id)}</span>
      <span class="date">${fmtDate(order.createdAt)}</span>
    </div>
    <div class="track-stepper">${stepsHtml}</div>
    <div class="track-order-items">${itemsHtml}</div>
    <div class="track-order-items" style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">
      <div><strong>Total</strong><strong>${formatPrice(order.total)}</strong></div>
    </div>
  </div>`;
}
