'use strict';

/* ==========================================================================
   RARE VISION — register.js
   Requires js/shared.js loaded first (CONFIG, cart storage, formatters)
   AND js/site-common.js loaded before this file (it injects the header,
   footer, and the sign-in drawer — including the drawer's own login/forgot
   password wiring — shared by every page; see js/site-common.js).

   This file only owns what's unique to register.html: the "Welcome!"
   Create Account form itself, and the small "Already have an account?
   Sign In" link that opens the shared drawer.
   ========================================================================== */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const dom = {
  registerSigninTrigger: document.getElementById('registerSigninTrigger'),
  registerForm: document.getElementById('registerForm'),
  registerFormError: document.getElementById('registerFormError'),
  registerFormSuccess: document.getElementById('registerFormSuccess'),
  registerFirstName: document.getElementById('registerFirstName'),
  registerLastName: document.getElementById('registerLastName'),
  registerEmail: document.getElementById('registerEmail'),
  registerPassword: document.getElementById('registerPassword'),
  registerPasswordToggle: document.getElementById('registerPasswordToggle'),
  registerSubmitBtn: document.getElementById('registerSubmitBtn'),
  toast: document.getElementById('toast'),
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  // Reuses the shared drawer's own open trigger (see js/site-common.js) —
  // simplest way to open the same drawer without duplicating its logic.
  dom.registerSigninTrigger?.addEventListener('click', () => document.getElementById('accountToggle')?.click());

  dom.registerForm.addEventListener('submit', handleRegisterSubmit);
  dom.registerPasswordToggle.addEventListener('click', () => togglePasswordVisibility(dom.registerPassword, dom.registerPasswordToggle));
}

function clearRegisterMessages() {
  dom.registerFormError.hidden = true;
  dom.registerFormError.textContent = '';
  dom.registerFormSuccess.hidden = true;
  dom.registerFormSuccess.textContent = '';
}

function showRegisterError(message) {
  dom.registerFormSuccess.hidden = true;
  dom.registerFormError.textContent = message;
  dom.registerFormError.hidden = false;
  dom.registerFormError.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function setRegisterLoading(isLoading) {
  dom.registerSubmitBtn.disabled = isLoading;
  dom.registerSubmitBtn.querySelector('.btn-text').hidden = isLoading;
  dom.registerSubmitBtn.querySelector('.btn-spinner').hidden = !isLoading;
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  clearRegisterMessages();

  if (!window.RareVisionAuth) {
    showRegisterError('Account creation is not available right now. Please refresh and try again.');
    return;
  }

  const firstName = dom.registerFirstName.value.trim();
  const lastName = dom.registerLastName.value.trim();
  const email = dom.registerEmail.value.trim();
  const password = dom.registerPassword.value;

  if (!firstName || !lastName || !email || !password) {
    showRegisterError('Please fill in all required fields.');
    return;
  }
  if (!EMAIL_RE.test(email)) {
    showRegisterError('Please enter a valid email address.');
    dom.registerEmail.focus();
    return;
  }
  if (password.length < 6) {
    showRegisterError('Password should be at least 6 characters.');
    dom.registerPassword.focus();
    return;
  }

  setRegisterLoading(true);
  const result = await window.RareVisionAuth.registerUser(firstName, lastName, email, password);
  setRegisterLoading(false);

  if (result.success) {
    showToast(`Welcome to RAREVISION, ${firstName}!`);
    dom.registerForm.reset();
    const redirect = new URLSearchParams(window.location.search).get('redirect');
    setTimeout(() => { window.location.href = redirect || 'index.html'; }, 1200);
  } else {
    showRegisterError(result.message);
  }
}

function togglePasswordVisibility(input, btn) {
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.classList.toggle('is-visible', !showing);
  btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
}

function showToast(msg) {
  if (!dom.toast) return;
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => dom.toast.classList.remove('show'), 2400);
}
