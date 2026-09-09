'use strict';

/* ==========================================================================
   RARE VISION — firebase-init.js
   Single source of truth for Firebase across the whole site (storefront,
   checkout, track-order, and the admin dashboard). Loaded as a native ES
   module — see the <script type="module"> tags in each HTML page.

   Everything else (js/products-data.js, js/product.js, js/checkout.js,
   admin/js/*.js, etc.) imports from this file instead of calling
   initializeApp() a second time.
   ========================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import {
  getFirestore,
  collection, collectionGroup, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
  deleteDoc, query, where, orderBy, limit, startAfter, serverTimestamp, increment,
  onSnapshot, writeBatch, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-storage.js';

// ---------------------------------------------------------------------------
// FIREBASE CONFIG
//   ⬇️⬇️⬇️  PASTE YOUR firebaseConfig OBJECT HERE  ⬇️⬇️⬇️
//   1. console.firebase.google.com → create a project (Spark/free plan is
//      enough to start; Firestore + Storage + Auth all have generous free
//      quotas).
//   2. Project settings (gear icon) → General → "Your apps" → </> (Web).
//   3. Copy the firebaseConfig object shown and paste it below, as-is.
//   4. Build → Authentication → Sign-in method → enable "Email/Password".
//   5. Build → Firestore Database → Create database (production mode) →
//      then paste firestore.rules (see that file in the project root) into
//      Firestore → Rules and click Publish.
//   6. Build → Storage → Get started → paste storage.rules the same way.
//   These values identify your project, not secret credentials — safe to
//   ship in public client code.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCkVWTVffvd-eBDEJOfUiDoPZnvK7LjmXA",
  authDomain: "rare-vision.firebaseapp.com",
  projectId: "rare-vision",
  storageBucket: "rare-vision.firebasestorage.app",
  messagingSenderId: "1493216620",
  appId: "1:1493216620:web:58251891b9011363a71749",
  measurementId: "G-NLPWFXMTKZ"
};
//   ⬆️⬆️⬆️  PASTE YOUR firebaseConfig OBJECT HERE  ⬆️⬆️⬆️

// ---------------------------------------------------------------------------
// ADMIN EMAIL
//   The ONLY account that can reach /admin. Must be an email you actually
//   registered on this site (via register.html) — the admin panel simply
//   signs that account in like any shopper, then checks this address.
//   CHANGE THIS, then copy the same address into firestore.rules (the
//   `isAdmin()` function near the top) and re-publish your Firestore rules
//   — the two must always match, since the UI check below is a convenience,
//   NOT the real security boundary; Firestore rules are.
// ---------------------------------------------------------------------------
export const ADMIN_EMAIL = 'abdulrahman4reda1@gmail.com';

// ---------------------------------------------------------------------------
// INITIALIZE
// ---------------------------------------------------------------------------
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

export function isAdminUser(user) {
  return !!user && !!user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/* --------------------------------------------------------------------------
   AUTH HELPERS (moved here from the old js/auth.js so every page — including
   the admin dashboard — shares one Firebase instance instead of booting a
   second one)
   -------------------------------------------------------------------------- */
function friendlyAuthError(error) {
  const code = error && error.code ? error.code : '';
  const map = {
    'auth/email-already-in-use': 'An account with this email already exists. Try logging in instead.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/missing-password': 'Please enter a password.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'Network error. Please check your connection and try again.',
  };
  return map[code] || (error && error.message) || 'Something went wrong. Please try again.';
}

async function registerUser(firstName, lastName, email, password) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const displayName = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim();
    if (displayName) await updateProfile(credential.user, { displayName });
    return { success: true, user: credential.user };
  } catch (error) {
    console.warn('registerUser failed:', error);
    return { success: false, message: friendlyAuthError(error), code: error.code };
  }
}

async function loginUser(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: credential.user };
  } catch (error) {
    console.warn('loginUser failed:', error);
    return { success: false, message: friendlyAuthError(error), code: error.code };
  }
}

async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true };
  } catch (error) {
    console.warn('resetPassword failed:', error);
    return { success: false, message: friendlyAuthError(error), code: error.code };
  }
}

async function logoutUser() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    console.warn('logoutUser failed:', error);
    return { success: false, message: friendlyAuthError(error), code: error.code };
  }
}

function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

function getCurrentUser() {
  return auth.currentUser;
}

// Back-compat with any old code / cached pages still calling window.RareVisionAuth
window.RareVisionAuth = { registerUser, loginUser, resetPassword, logoutUser, onAuthChange, getCurrentUser };

export {
  firebaseApp, auth, db, storage,
  // firestore primitives re-exported so every other module imports Firebase
  // from ONE place instead of pinning the CDN version number all over the site
  collection, collectionGroup, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
  deleteDoc, query, where, orderBy, limit, startAfter, serverTimestamp, increment,
  onSnapshot, writeBatch, Timestamp,
  ref, uploadBytes, getDownloadURL,
  registerUser, loginUser, resetPassword, logoutUser, onAuthChange, getCurrentUser,
};
