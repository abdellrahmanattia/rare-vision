'use strict';

/* ==========================================================================
   RARE VISION — marketing.js
   Everything the 15%-off idle popup needs: save the subscriber, make sure a
   WELCOME15 promo code exists, and enqueue a branded HTML welcome email for
   the Google Apps Script hybrid sender to pick up (see
   google-apps-script/EmailAutomation.gs + its README).
   ========================================================================== */

import {
  db, collection, addDoc, getDocs, query, where, limit, serverTimestamp,
} from './firebase-init.js';

const WELCOME_CODE = 'WELCOME15';

async function ensureWelcomePromoExists() {
  const q = query(collection(db, 'promo_codes'), where('code', '==', WELCOME_CODE), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) return;
  await addDoc(collection(db, 'promo_codes'), {
    code: WELCOME_CODE,
    type: 'percent',
    value: 15,
    active: true,
    source: 'idle_popup_auto_created',
    createdAt: serverTimestamp(),
  });
}

function welcomeEmailHtml(email) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;">
    <div style="background:#0b0b0d;padding:28px 24px;text-align:center;">
      <h1 style="color:#ffffff;font-size:20px;letter-spacing:.06em;margin:0;">RARE VISION</h1>
    </div>
    <div style="padding:32px 24px;text-align:center;">
      <p style="font-size:14px;color:#6b6b70;margin:0 0 8px;">Welcome to Rare Vision</p>
      <h2 style="font-size:26px;margin:0 0 16px;color:#14140f;">Here's 15% off your first order</h2>
      <div style="display:inline-block;background:#f2f0ea;border:1px dashed #c9962e;border-radius:10px;padding:14px 28px;font-size:22px;font-weight:700;letter-spacing:.08em;color:#a67a20;margin-bottom:20px;">${WELCOME_CODE}</div>
      <p style="font-size:13px;color:#6b6b70;line-height:1.6;">Enter this code at checkout to take 15% off your subtotal. See you soon.</p>
    </div>
    <div style="background:#0e0e10;color:#8f8d88;text-align:center;padding:16px;font-size:11px;">
      You're receiving this because you requested a discount code on our site. If this wasn't you, you can ignore this email.
    </div>
  </div>`;
}

// Called by the idle popup. Returns the promo code string on success.
export async function subscribeForDiscount(email) {
  await ensureWelcomePromoExists();

  await addDoc(collection(db, 'email_subscribers'), {
    email,
    promoCode: WELCOME_CODE,
    createdAt: serverTimestamp(),
  });

  await addDoc(collection(db, 'email_queue'), {
    to: email,
    subject: 'Here\'s 15% off — welcome to Rare Vision',
    htmlBody: welcomeEmailHtml(email),
    templateType: 'welcome_discount',
    status: 'pending',
    createdAt: serverTimestamp(),
  });

  return WELCOME_CODE;
}

// Used by the admin dashboard's "Restock & Notify" action (Phase 7.6).
export async function enqueueRestockEmails(entries, productName) {
  const jobs = entries.map((entry) => addDoc(collection(db, 'email_queue'), {
    to: entry.email,
    subject: `Back in stock: ${productName}`,
    htmlBody: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#0b0b0d;padding:24px;text-align:center;"><h1 style="color:#fff;font-size:18px;margin:0;">RARE VISION</h1></div>
        <div style="padding:28px 24px;text-align:center;">
          <h2 style="font-size:22px;margin:0 0 12px;">${productName} is back in stock${entry.size ? ` (size ${entry.size})` : ''}</h2>
          <p style="font-size:13px;color:#6b6b70;">Grab it before it sells out again.</p>
        </div>
      </div>`,
    templateType: 'restock_notify',
    status: 'pending',
    createdAt: serverTimestamp(),
  }));
  await Promise.all(jobs);
}
