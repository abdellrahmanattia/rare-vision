'use strict';

/* ==========================================================================
   RARE VISION — site-common.js
   Injects the header, announcement banner, sign-in drawer, and idle popup
   into EVERY page (so that markup lives in exactly one place instead of
   being copy-pasted six times), then wires up the nav/search/account/cart
   icons that are common to all of them. Loaded as an ES module — import
   order matters: load this BEFORE js/shared.js / page-specific scripts so
   the elements they look up already exist in the DOM.

   Each page just needs a single placeholder in <body>:
     <div id="app-header-root"></div>
   ...at the very top, and this script does the rest.
   ========================================================================== */

import { db, doc, getDoc, setDoc, serverTimestamp, onAuthChange, isAdminUser, logoutUser, loginUser, resetPassword } from './firebase-init.js';

const HEADER_HTML = `
<div class="announcement-banner" id="announcementBanner" hidden></div>

<header class="site-header" id="siteHeader">
  <div class="header-inner">
    <div class="header-left">
      <button class="icon-btn nav-toggle" id="navToggle" aria-label="Menu" aria-expanded="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M3 12h18M3 18h18" stroke-linecap="round"/></svg>
      </button>

      <nav class="main-nav" id="mainNav">
        <a href="index.html#new-arrivals">New Arrivals</a>
        <a href="index.html#best-sellers">Best Sellers</a>
        <a href="shop.html">Shop All</a>
        <a href="track-order.html">Track Order</a>
        <a href="index.html#footer">Contact</a>
      </nav>

      <div class="header-searchbar" id="headerSearchbar">
        <div class="header-search-scope" id="headerScopeBtn">
          <span id="headerScopeLabel">All</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <ul class="header-scope-menu" id="headerScopeMenu" hidden>
            <li data-value="all">All</li>
            <li data-value="Clothes">Clothes</li>
            <li data-value="Shoes">Shoes</li>
            <li data-value="Accessories">Accessories</li>
            <li data-value="Brands">Brands</li>
          </ul>
        </div>
        <input type="text" id="headerSearchInput" placeholder="Search Rare Vision" autocomplete="off">
        <button class="header-search-submit" id="headerSearchSubmit" aria-label="Search" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" stroke-linecap="round"/></svg>
        </button>
      </div>
      <button class="icon-btn" id="headerSearchBtn" aria-label="Search" hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" stroke-linecap="round"/></svg>
      </button>
      <button class="icon-btn" id="notifyBtn" aria-label="Notifications">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.7 21a2 2 0 0 1-3.4 0" stroke-linecap="round"/></svg>
        <span class="notify-badge" id="notifyBadge">0</span>
      </button>
    </div>

    <a href="index.html" class="logo-lockup-v2" aria-label="Rare Vision home">
      <img src="assets/logos/rare-vision-logo.png" alt="Rare Vision" width="40" height="40">
    </a>

    <div class="header-right">
      <button class="icon-btn" id="accountToggle" aria-label="Account">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4.5 5-6 8-6s6.5 1.5 8 6" stroke-linecap="round"/></svg>
      </button>
      <button class="icon-btn" id="cartToggle" aria-label="Cart">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="21" r="1.4"/><circle cx="17" cy="21" r="1.4"/></svg>
        <span class="cart-badge" id="cartBadge">0</span>
      </button>
    </div>
  </div>
</header>
`;

const SIGNIN_DRAWER_HTML = `
<div class="overlay" id="signinOverlay"></div>
<aside class="signin-panel" id="signinPanel" role="dialog" aria-modal="true" aria-hidden="true" aria-label="Sign in">
  <div class="signin-panel-header">
    <span class="logo-lockup-v2"><img src="assets/logos/rare-vision-logo.png" alt="Rare Vision" width="34" height="34"></span>
    <button class="icon-btn" id="signinClose" aria-label="Close sign in">&times;</button>
  </div>
  <div class="signin-panel-body">
    <form id="signinForm" class="signin-form" novalidate>
      <h3 class="signin-section-title">Already Have An Account</h3>
      <p class="form-error" id="signinFormError" hidden></p>
      <p class="form-success" id="signinFormSuccess" hidden></p>
      <div class="form-row">
        <label for="signinEmail">Email *</label>
        <input type="email" id="signinEmail" name="email" required autocomplete="email" placeholder="you@example.com">
      </div>
      <div class="form-row">
        <label for="signinPassword">Password *</label>
        <div class="password-field">
          <input type="password" id="signinPassword" name="password" required autocomplete="current-password" placeholder="Enter your password">
          <button type="button" class="password-toggle" id="signinPasswordToggle" aria-label="Show password">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="icon-eye"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2"/></svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="icon-eye-off" hidden><path d="M3 3l18 18" stroke-linecap="round"/><path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.3 4.3M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.4 0 2.6-.3 3.7-.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.9 10a3.2 3.2 0 0 0 4.2 4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
      <button type="button" class="forgot-password-link" id="forgotPasswordBtn">Forgot your password?</button>
      <button type="submit" class="btn-signin" id="signinSubmitBtn">
        <span class="btn-text">Sign In</span>
        <span class="btn-spinner" hidden></span>
      </button>
    </form>
    <div class="signin-divider"></div>
    <div class="signin-new-account">
      <h3 class="signin-section-title">No Account Yet</h3>
      <p class="signin-subtext">Enjoy added benefits and a richer experience by creating a personal account.</p>
      <a href="register.html" class="btn-create-account">Create an account on RAREVISION</a>
    </div>
    <div class="signin-divider"></div>
    <button type="button" class="forgot-password-link" id="signedInLogoutBtn" hidden>Sign out</button>
    <a href="track-order.html" class="btn-create-account" id="signedInOrdersLink" hidden style="display:block;text-align:center;margin-top:10px;">My Orders</a>
  </div>
</aside>
`;

const IDLE_POPUP_HTML = `
<div class="idle-popup-overlay" id="idlePopupOverlay">
  <div class="idle-popup">
    <button class="idle-popup-close" id="idlePopupClose" aria-label="Close">&times;</button>
    <p class="pct">15% OFF</p>
    <h3>Still deciding?</h3>
    <p class="desc">Grab 15% off your first order — we'll email you a code right now.</p>
    <div id="idlePopupFormState">
      <input type="email" id="idlePopupEmail" placeholder="you@example.com">
      <p class="form-error" id="idlePopupError" hidden style="color:var(--red);font-size:12.5px;margin:-6px 0 10px;"></p>
      <button class="btn-submit" id="idlePopupSubmit" type="button">Get My Code</button>
    </div>
    <div id="idlePopupSuccessState" hidden>
      <p class="promo-reveal" id="idlePopupCode">WELCOME15</p>
      <p style="font-size:12.5px;color:var(--text-muted);">We also sent this to your inbox. Use it at checkout.</p>
    </div>
  </div>
</div>
`;

const FOOTER_HTML = `
<footer class="site-footer" id="footer">
  <div class="footer-inner">
    <div class="footer-col">
      <h4>SHOP BY CATEGORY</h4>
      <a href="shop.html?gender=Men">Men</a>
      <a href="shop.html?gender=Women">Women</a>
      <a href="shop.html?gender=Kids">Kids</a>
      <a href="shop.html">All</a>
      <a href="shop.html?category=Clothes">Clothes</a>
      <a href="shop.html?category=Shoes">Shoes</a>
      <a href="shop.html?category=Accessories">Accessories</a>
      <a href="shop.html?category=Brands">Brands</a>
    </div>
    <div class="footer-col">
      <h4>HELP CENTER</h4>
      <a href="shop.html">Search</a>
      <a href="track-order.html">Exchange/Return</a>
      <a href="index.html#footer">FAQ</a>
      <a href="index.html#footer">Contact Info</a>
      <a href="mailto:rare1vision@gmail.com">Contact Us</a>
      <a href="index.html#footer">About Us</a>
      <a href="index.html#footer">AI <span class="coming-soon-badge">Coming Soon</span></a>
    </div>
    <div class="footer-social">
      <div class="social-links">
        <a href="#" aria-label="TikTok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v10.8a3.8 3.8 0 1 1-3.2-3.75"/><path d="M14 3c.35 2.55 2.1 4.4 4.6 4.75"/></svg></a>
        <a href="#" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.6" y="2.6" width="18.8" height="18.8" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg></a>
        <a href="#" aria-label="WhatsApp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.9-1.3A9.5 9.5 0 1 0 12 2.5Z"/><path d="M8.7 8.2c.3-.02.5.15.6.4l.7 1.6c.08.2.05.42-.08.6l-.55.7a.5.5 0 0 0-.02.55c.5.85 1.4 1.75 2.25 2.25a.5.5 0 0 0 .55-.02l.7-.55c.18-.13.4-.16.6-.08l1.6.7c.25.1.42.3.4.6-.03.5-.25 1.1-.7 1.4-.5.35-1.1.45-1.85.25-1.9-.5-3.9-2.4-4.5-3.1-.6-.7-1.5-2.05-1.5-3.35 0-.9.35-1.5.7-1.85.3-.3.75-.5 1.15-.5Z" stroke-width="1.3"/></svg></a>
      </div>
      <p class="footer-contact-label">Contact Email:</p>
      <a href="mailto:rare1vision@gmail.com" class="footer-contact-email">rare1vision@gmail.com</a>
    </div>
  </div>
  <div class="footer-bottom">
    <p>Copyright &copy; <span id="year"></span> Rare Vision. All rights reserved.</p>
    <button class="scroll-top-btn" id="scrollTopBtn" aria-label="Scroll to top">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 15l6-6 6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
</footer>
`;

function injectOnce(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  const frag = document.createDocumentFragment();
  Array.from(wrap.children).forEach((child) => frag.appendChild(child));
  document.body.insertBefore(frag, document.body.firstChild);
}

// Header goes at the very top of <body>; drawer + idle popup are appended
// (position doesn't matter, they're fixed/overlay elements).
injectOnce(HEADER_HTML);
document.body.insertAdjacentHTML('beforeend', FOOTER_HTML);
document.body.insertAdjacentHTML('beforeend', SIGNIN_DRAWER_HTML);
document.body.insertAdjacentHTML('beforeend', IDLE_POPUP_HTML);
document.body.insertAdjacentHTML('beforeend', '<div class="toast" id="toast"></div>');

/* --------------------------------------------------------------------------
   BANNER (settings/site announcement bar)
   -------------------------------------------------------------------------- */
async function loadBanner() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'site'));
    const el = document.getElementById('announcementBanner');
    if (!el) return;
    if (snap.exists() && snap.data().bannerActive && snap.data().bannerText) {
      el.textContent = snap.data().bannerText;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  } catch (err) {
    console.warn('Banner not loaded (Firestore not configured yet?):', err);
  }
}
loadBanner();

/* --------------------------------------------------------------------------
   PRESENCE (lightweight "active visitors right now" heartbeat for the
   admin Analytics tab — see admin/js/admin.js)
   -------------------------------------------------------------------------- */
function initPresence() {
  let sessionId = sessionStorage.getItem('rareVisionSessionId');
  if (!sessionId) {
    sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('rareVisionSessionId', sessionId);
  }
  const ping = () => setDoc(doc(db, 'presence', sessionId), { lastSeen: serverTimestamp(), path: window.location.pathname }).catch(() => {});
  ping();
  setInterval(ping, 25000);
}
initPresence();

/* --------------------------------------------------------------------------
   NAV TOGGLE (mobile hamburger)
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');
  navToggle?.addEventListener('click', () => {
    const open = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });

  /* ---- Header search bar ---- */
  const scopeBtn = document.getElementById('headerScopeBtn');
  const scopeMenu = document.getElementById('headerScopeMenu');
  const scopeLabel = document.getElementById('headerScopeLabel');
  let scopeValue = 'all';
  scopeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    scopeMenu.hidden = !scopeMenu.hidden;
  });
  scopeMenu?.querySelectorAll('li').forEach((li) => {
    li.addEventListener('click', () => {
      scopeValue = li.dataset.value;
      scopeLabel.textContent = li.textContent;
      scopeMenu.hidden = true;
    });
  });
  document.addEventListener('click', () => { if (scopeMenu) scopeMenu.hidden = true; });

  function submitHeaderSearch() {
    const input = document.getElementById('headerSearchInput');
    const term = (input?.value || '').trim();
    const params = new URLSearchParams();
    if (term) params.set('search', term);
    if (scopeValue && scopeValue !== 'all') params.set('category', scopeValue);
    window.location.href = `shop.html?${params.toString()}`;
  }
  document.getElementById('headerSearchSubmit')?.addEventListener('click', submitHeaderSearch);
  document.getElementById('headerSearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitHeaderSearch();
  });

  /* ---- Account icon ---- */
  const accountToggle = document.getElementById('accountToggle');
  const signinOverlay = document.getElementById('signinOverlay');
  const signinPanel = document.getElementById('signinPanel');
  const signinClose = document.getElementById('signinClose');

  function openSignin() {
    signinOverlay?.classList.add('show');
    signinPanel?.classList.add('open');
    signinPanel?.setAttribute('aria-hidden', 'false');
  }
  function closeSignin() {
    signinOverlay?.classList.remove('show');
    signinPanel?.classList.remove('open');
    signinPanel?.setAttribute('aria-hidden', 'true');
  }
  signinOverlay?.addEventListener('click', closeSignin);
  signinClose?.addEventListener('click', closeSignin);

  let currentUser = null;
  accountToggle?.addEventListener('click', () => {
    if (currentUser) {
      if (isAdminUser(currentUser)) { window.location.href = 'admin/index.html'; return; }
      openSignin();
    } else {
      openSignin();
    }
  });

  onAuthChange((user) => {
    currentUser = user;
    const logoutBtn = document.getElementById('signedInLogoutBtn');
    const ordersLink = document.getElementById('signedInOrdersLink');
    if (user) {
      if (logoutBtn) logoutBtn.hidden = false;
      if (ordersLink) ordersLink.hidden = false;
    } else {
      if (logoutBtn) logoutBtn.hidden = true;
      if (ordersLink) ordersLink.hidden = true;
    }
  });
  document.getElementById('signedInLogoutBtn')?.addEventListener('click', async () => {
    await logoutUser();
    window.location.reload();
  });

  /* ---- Sign-in form itself (login + forgot password + show/hide password) ---- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const signinForm = document.getElementById('signinForm');
  const signinEmail = document.getElementById('signinEmail');
  const signinPassword = document.getElementById('signinPassword');
  const signinPasswordToggle = document.getElementById('signinPasswordToggle');
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  const signinFormError = document.getElementById('signinFormError');
  const signinFormSuccess = document.getElementById('signinFormSuccess');
  const signinSubmitBtn = document.getElementById('signinSubmitBtn');

  function clearSigninMessages() {
    signinFormError.hidden = true; signinFormError.textContent = '';
    signinFormSuccess.hidden = true; signinFormSuccess.textContent = '';
  }
  function showSigninError(msg) { signinFormSuccess.hidden = true; signinFormError.textContent = msg; signinFormError.hidden = false; }
  function showSigninSuccess(msg) { signinFormError.hidden = true; signinFormSuccess.textContent = msg; signinFormSuccess.hidden = false; }
  function setSigninLoading(loading) {
    signinSubmitBtn.disabled = loading;
    signinSubmitBtn.querySelector('.btn-text').hidden = loading;
    signinSubmitBtn.querySelector('.btn-spinner').hidden = !loading;
  }

  signinPasswordToggle?.addEventListener('click', () => {
    const showing = signinPassword.type === 'text';
    signinPassword.type = showing ? 'password' : 'text';
    signinPasswordToggle.querySelector('.icon-eye').hidden = !showing;
    signinPasswordToggle.querySelector('.icon-eye-off').hidden = showing;
  });

  signinForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearSigninMessages();
    const email = signinEmail.value.trim();
    const password = signinPassword.value;
    if (!email || !password) { showSigninError('Please fill in both your email and password.'); return; }
    if (!EMAIL_RE.test(email)) { showSigninError('Please enter a valid email address.'); return; }
    setSigninLoading(true);
    const result = await loginUser(email, password);
    setSigninLoading(false);
    if (result.success) {
      const firstName = result.user?.displayName ? result.user.displayName.split(' ')[0] : '';
      showToast(firstName ? `Welcome back, ${firstName}!` : 'Welcome back!');
      signinForm.reset();
      closeSignin();
    } else {
      showSigninError(result.message);
    }
  });

  forgotPasswordBtn?.addEventListener('click', async () => {
    clearSigninMessages();
    const email = signinEmail.value.trim();
    if (!email) { showSigninError('Enter your email above, then tap "Forgot your password?" again.'); return; }
    if (!EMAIL_RE.test(email)) { showSigninError('Please enter a valid email address.'); return; }
    forgotPasswordBtn.disabled = true;
    const result = await resetPassword(email);
    forgotPasswordBtn.disabled = false;
    if (result.success) showSigninSuccess(`Password reset email sent to ${email}.`);
    else showSigninError(result.message);
  });

  /* ---- Footer bits ---- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  const scrollTopBtn = document.getElementById('scrollTopBtn');
  scrollTopBtn?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* ---- Idle popup (2 minutes idle => 15% offer) ---- */
  initIdlePopup();
});

/* --------------------------------------------------------------------------
   TOAST (tiny helper other page scripts can import)
   -------------------------------------------------------------------------- */
export function showToast(message, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), ms);
}

/* --------------------------------------------------------------------------
   IDLE POPUP
   -------------------------------------------------------------------------- */
function initIdlePopup() {
  const IDLE_MS = 2 * 60 * 1000;
  const SEEN_KEY = 'rareVisionIdlePopupSeen';
  if (sessionStorage.getItem(SEEN_KEY)) return; // once per session

  const overlay = document.getElementById('idlePopupOverlay');
  const closeBtn = document.getElementById('idlePopupClose');
  const submitBtn = document.getElementById('idlePopupSubmit');
  const emailInput = document.getElementById('idlePopupEmail');
  const errorEl = document.getElementById('idlePopupError');
  const formState = document.getElementById('idlePopupFormState');
  const successState = document.getElementById('idlePopupSuccessState');
  const codeEl = document.getElementById('idlePopupCode');
  let timer;

  function show() {
    if (sessionStorage.getItem(SEEN_KEY)) return;
    overlay.classList.add('open');
    sessionStorage.setItem(SEEN_KEY, '1');
  }
  function close() { overlay.classList.remove('open'); }
  function resetTimer() {
    clearTimeout(timer);
    timer = setTimeout(show, IDLE_MS);
  }
  ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach((evt) => {
    document.addEventListener(evt, resetTimer, { passive: true });
  });
  resetTimer();

  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  submitBtn?.addEventListener('click', async () => {
    const email = (emailInput.value || '').trim();
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_RE.test(email)) {
      errorEl.textContent = 'Please enter a valid email address.';
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    submitBtn.textContent = 'Sending…';
    submitBtn.disabled = true;
    try {
      const { subscribeForDiscount } = await import('./marketing.js');
      const code = await subscribeForDiscount(email);
      codeEl.textContent = code;
      formState.hidden = true;
      successState.hidden = false;
    } catch (err) {
      console.warn('subscribeForDiscount failed', err);
      errorEl.textContent = 'Something went wrong. Please try again in a moment.';
      errorEl.hidden = false;
      submitBtn.textContent = 'Get My Code';
      submitBtn.disabled = false;
    }
  });
}
