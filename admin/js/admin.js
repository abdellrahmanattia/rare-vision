'use strict';

/* ==========================================================================
   RARE VISION — admin/js/admin.js
   The whole custom admin dashboard (SRS Phase 7) in one module. Requires
   ../js/shared.js loaded first (escapeHtml, formatPrice, renderStars).
   ========================================================================== */

import {
  db, auth, storage, ADMIN_EMAIL, isAdminUser,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, onAuthChange, writeBatch,
  loginUser, logoutUser, ref, uploadBytes, getDownloadURL,
} from '../../js/firebase-init.js';
import { invalidateProductsCache } from '../../js/products-data.js';
import { enqueueRestockEmails } from '../../js/marketing.js';

const dom = {};
const IDS = [
  'adminLoginWrap', 'adminLoginForm', 'adminEmail', 'adminPassword', 'adminLoginError', 'adminLoginBtn',
  'adminShell', 'adminTabTitle', 'adminUserEmail', 'adminSignOutBtn', 'adminToast',
  'analyticsGrid',
  'newProductBtn', 'importLegacyBtn', 'importLegacyNote', 'productForm', 'productsTable',
  'ordersTable', 'reviewsTable',
  'newPromoBtn', 'promoForm', 'promoTable',
  'waitlistTable', 'reportsTable',
  'bannerTextInput', 'bannerActiveInput', 'saveBannerBtn', 'bannerSavedNote',
];
const TAB_TITLES = { analytics: 'Analytics', products: 'Products', orders: 'Orders', reviews: 'Reviews', promo: 'Promo Codes', waitlist: 'Waitlist & Reports', banner: 'Banner' };

document.addEventListener('DOMContentLoaded', () => {
  IDS.forEach((id) => { dom[id] = document.getElementById(id); });
  bindAuthGate();
  bindTabs();
});

function showToast(msg) {
  dom.adminToast.textContent = msg;
  dom.adminToast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => dom.adminToast.classList.remove('show'), 2600);
}

/* --------------------------------------------------------------------------
   AUTH GATE
   -------------------------------------------------------------------------- */
function bindAuthGate() {
  dom.adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    dom.adminLoginError.hidden = true;
    dom.adminLoginBtn.disabled = true;
    dom.adminLoginBtn.textContent = 'Signing in…';
    const result = await loginUser(dom.adminEmail.value.trim(), dom.adminPassword.value);
    dom.adminLoginBtn.disabled = false;
    dom.adminLoginBtn.textContent = 'Sign In';
    if (!result.success) {
      dom.adminLoginError.textContent = result.message;
      dom.adminLoginError.hidden = false;
      return;
    }
    if (!isAdminUser(result.user)) {
      await logoutUser();
      dom.adminLoginError.textContent = `This account isn't authorized for admin access. (Admin email is configured as ${ADMIN_EMAIL} in js/firebase-init.js.)`;
      dom.adminLoginError.hidden = false;
    }
  });

  dom.adminSignOutBtn.addEventListener('click', async () => { await logoutUser(); });

  let bootstrapped = false;
  onAuthChange((user) => {
    if (user && isAdminUser(user)) {
      dom.adminLoginWrap.hidden = true;
      dom.adminShell.hidden = false;
      dom.adminUserEmail.textContent = user.email;
      if (!bootstrapped) { bootstrapped = true; loadAllSections(); }
    } else {
      dom.adminLoginWrap.hidden = false;
      dom.adminShell.hidden = true;
    }
  });
}

function loadAllSections() {
  loadAnalytics();
  loadProducts();
  loadOrders();
  loadReviews();
  loadPromoCodes();
  loadWaitlistAndReports();
  loadBannerSettings();
}

/* --------------------------------------------------------------------------
   TABS
   -------------------------------------------------------------------------- */
function bindTabs() {
  document.querySelectorAll('.admin-nav-item[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-nav-item[data-tab]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.querySelectorAll('.admin-tab').forEach((sec) => { sec.hidden = true; });
      document.getElementById(`tab-${tab}`).hidden = false;
      dom.adminTabTitle.textContent = TAB_TITLES[tab] || tab;
    });
  });
}

/* --------------------------------------------------------------------------
   ANALYTICS
   -------------------------------------------------------------------------- */
async function loadAnalytics() {
  const [ordersSnap, waitlistSnap, reportsSnap, presenceSnap] = await Promise.all([
    getDocs(collection(db, 'orders')).catch(() => ({ docs: [] })),
    getDocs(collection(db, 'waitlist')).catch(() => ({ docs: [] })),
    getDocs(collection(db, 'reports')).catch(() => ({ docs: [] })),
    getDocs(collection(db, 'presence')).catch(() => ({ docs: [] })),
  ]);

  const totalSales = ordersSnap.docs.reduce((sum, d) => sum + (Number(d.data().total) || 0), 0);
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const activeVisitors = presenceSnap.docs.filter((d) => {
    const ts = d.data().lastSeen;
    const ms = ts && ts.seconds ? ts.seconds * 1000 : 0;
    return ms > fiveMinAgo;
  }).length;

  dom.analyticsGrid.innerHTML = [
    { num: activeVisitors, lbl: 'Active visitors (last 5 min)' },
    { num: formatPrice(totalSales), lbl: 'Total sales (all orders)' },
    { num: ordersSnap.docs.length, lbl: 'Total orders' },
    { num: waitlistSnap.docs.length, lbl: 'Waitlist (restock requests)' },
    { num: reportsSnap.docs.length, lbl: 'Product reports' },
  ].map((s) => `<div class="admin-stat-card"><p class="num">${s.num}</p><p class="lbl">${s.lbl}</p></div>`).join('');
}

/* --------------------------------------------------------------------------
   PRODUCTS
   -------------------------------------------------------------------------- */
let productsCache = [];

async function loadProducts() {
  const snap = await getDocs(collection(db, 'products'));
  productsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderProductsTable();
}

function renderProductsTable() {
  const rows = productsCache.map((p) => {
    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    return `
    <tr data-id="${p.id}">
      <td><img class="thumb" src="${escapeHtml(firstImage(p))}" alt=""></td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.category || '')}</td>
      <td>${escapeHtml(p.targetCategory || '')}</td>
      <td>${formatPrice(p.price)}</td>
      <td>${(p.badges || []).map((b) => escapeHtml(b)).join(', ')}</td>
      <td>
        ${sizes.length
          ? sizes.map((s) => `<button class="admin-pill-btn qi-toggle" data-id="${p.id}" data-size="${escapeHtml(s.size)}">${escapeHtml(s.size)}: ${s.stockStatus === 'In Stock' ? '✅' : '❌'}</button>`).join('')
          : `<span class="${p.inStock !== false ? 'admin-badge-instock' : 'admin-badge-oos'}">${p.inStock !== false ? 'In Stock' : 'Out of Stock'}</span>`}
      </td>
      <td>
        <button class="admin-pill-btn edit-product-btn" data-id="${p.id}">Edit</button>
        <button class="admin-pill-btn danger delete-product-btn" data-id="${p.id}">Delete</button>
      </td>
    </tr>`;
  }).join('');

  dom.productsTable.innerHTML = `
    <thead><tr><th></th><th>Name</th><th>Category</th><th>Target</th><th>Price</th><th>Badges</th><th>Quick Inventory</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">No products yet.</td></tr>'}</tbody>`;

  dom.productsTable.querySelectorAll('.qi-toggle').forEach((btn) => btn.addEventListener('click', () => toggleQuickInventory(btn.dataset.id, btn.dataset.size)));
  dom.productsTable.querySelectorAll('.edit-product-btn').forEach((btn) => btn.addEventListener('click', () => openProductForm(btn.dataset.id)));
  dom.productsTable.querySelectorAll('.delete-product-btn').forEach((btn) => btn.addEventListener('click', () => deleteProduct(btn.dataset.id)));

  dom.newProductBtn.onclick = () => openProductForm(null);
  dom.importLegacyBtn.onclick = importLegacyCatalog;
}

function firstImage(p) {
  if (Array.isArray(p.colorVariants) && p.colorVariants[0]?.images?.[0]) return p.colorVariants[0].images[0];
  return p.image || '';
}

async function toggleQuickInventory(productId, size) {
  const p = productsCache.find((x) => x.id === productId);
  if (!p) return;
  const sizes = (p.sizes || []).map((s) => s.size === size ? { ...s, stockStatus: s.stockStatus === 'In Stock' ? 'Out of Stock' : 'In Stock' } : s);
  await updateDoc(doc(db, 'products', productId), { sizes });
  p.sizes = sizes;
  invalidateProductsCache();
  renderProductsTable();
  showToast(`${size} updated`);
}

async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  await deleteDoc(doc(db, 'products', id));
  productsCache = productsCache.filter((p) => p.id !== id);
  invalidateProductsCache();
  renderProductsTable();
  showToast('Product deleted');
}

const SIZE_OPTIONS = ['S', 'M', 'L', 'XL'];
const CATEGORY_OPTIONS = ['Clothes', 'Shoes', 'Accessories', 'Brands'];
const TARGET_OPTIONS = ['Men', 'Women', 'Unisex', 'Kids', 'All Genders'];
const BADGE_OPTIONS = ['Best Seller', 'New Arrival'];

function openProductForm(id) {
  const p = id ? productsCache.find((x) => x.id === id) : null;
  const variants = (p && Array.isArray(p.colorVariants) && p.colorVariants.length) ? p.colorVariants : [{ name: '', swatchImage: '', images: [''] }];
  const specs = (p && p.specifications) || [];
  const sizesMap = new Map((p?.sizes || []).map((s) => [s.size, s.stockStatus]));

  dom.productForm.hidden = false;
  dom.productForm.innerHTML = `
    <h3 class="admin-section-heading">${p ? 'Edit' : 'New'} Product</h3>
    <div class="admin-form-grid">
      <div><label class="admin-field-label">Name</label><input type="text" id="f_name" value="${escapeHtml(p?.name || '')}"></div>
      <div><label class="admin-field-label">Style Name</label><input type="text" id="f_styleName" value="${escapeHtml(p?.styleName || '')}"></div>
      <div><label class="admin-field-label">Brand</label><input type="text" id="f_brand" value="${escapeHtml(p?.brand || '')}"></div>
      <div><label class="admin-field-label">SKU</label><input type="text" id="f_sku" value="${escapeHtml(p?.sku || '')}"></div>
      <div><label class="admin-field-label">Category</label>
        <select id="f_category">${CATEGORY_OPTIONS.map((c) => `<option ${p?.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div><label class="admin-field-label">Product Type</label><input type="text" id="f_productType" value="${escapeHtml(p?.productType || '')}" placeholder="e.g. T-Shirts, Sneakers"></div>
      <div><label class="admin-field-label">Target Category (badge)</label>
        <select id="f_targetCategory">${TARGET_OPTIONS.map((c) => `<option ${p?.targetCategory === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div><label class="admin-field-label">Custom Badge Text</label><input type="text" id="f_customBadgeText" value="${escapeHtml(p?.customBadgeText || '')}" placeholder="e.g. 100% COTTON"></div>
      <div><label class="admin-field-label">Price (LE)</label><input type="number" step="0.01" id="f_price" value="${p?.price ?? ''}"></div>
      <div><label class="admin-field-label">Compare-at Price (optional)</label><input type="number" step="0.01" id="f_compareAtPrice" value="${p?.compareAtPrice ?? ''}"></div>
      <div><label class="admin-field-label">Rank (Best Sellers order, lower = higher; blank = auto)</label><input type="number" id="f_rank" value="${p?.rank ?? ''}"></div>
    </div>

    <div class="admin-checkbox-row">
      ${BADGE_OPTIONS.map((b) => `<label><input type="checkbox" class="f_badge" value="${b}" ${(p?.badges || []).includes(b) ? 'checked' : ''}> ${b}</label>`).join('')}
      <label><input type="checkbox" id="f_inStock" ${p?.inStock !== false ? 'checked' : ''}> In stock (used only when this product has no sizes)</label>
    </div>

    <label class="admin-field-label">Short Description (features line)</label>
    <textarea id="f_shortDescription" style="min-height:50px;">${escapeHtml(p?.shortDescription || '')}</textarea>
    <label class="admin-field-label">Full Description (Markdown: **bold**, - bullets)</label>
    <textarea id="f_description">${escapeHtml(p?.description || '')}</textarea>

    <label class="admin-field-label" style="margin-top:14px;">Sizes</label>
    <div class="admin-checkbox-row" id="f_sizesRow">
      ${SIZE_OPTIONS.map((s) => `
        <label><input type="checkbox" class="f_size_enabled" value="${s}" ${sizesMap.has(s) ? 'checked' : ''}>
        ${s} <select class="f_size_stock" data-size="${s}"><option value="In Stock" ${sizesMap.get(s) === 'In Stock' ? 'selected' : ''}>In stock</option><option value="Out of Stock" ${sizesMap.get(s) === 'Out of Stock' ? 'selected' : ''}>Out of stock</option></select></label>`).join('')}
    </div>

    <label class="admin-field-label">Color Variants (each needs at least one image URL)</label>
    <div id="f_variantsList"></div>
    <button type="button" class="admin-add-row-btn" id="f_addVariant">+ Add color variant</button>

    <label class="admin-field-label" style="margin-top:14px;">Specifications</label>
    <div id="f_specsList"></div>
    <button type="button" class="admin-add-row-btn" id="f_addSpec">+ Add specification</button>

    <div class="admin-form-actions">
      <button class="admin-btn-primary" id="f_save">${p ? 'Save Changes' : 'Create Product'}</button>
      <button class="admin-btn-ghost" id="f_cancel">Cancel</button>
    </div>
  `;

  const variantsList = document.getElementById('f_variantsList');
  function renderVariantRow(v = { name: '', swatchImage: '', images: [''] }) {
    const row = document.createElement('div');
    row.className = 'admin-variant-row';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'stretch';
    row.style.border = '1px solid var(--border)';
    row.style.borderRadius = '8px';
    row.style.padding = '10px';
    row.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:6px;">
        <input type="text" class="v_name" placeholder="Color name (e.g. White x Black)" value="${escapeHtml(v.name || '')}" style="flex:1;">
        <button type="button" class="admin-remove-row-btn v_remove">&times;</button>
      </div>
      <input type="text" class="v_images" placeholder="Image URLs, comma-separated" value="${(v.images || []).filter(Boolean).join(', ')}">
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <input type="file" class="v_upload" accept="image/*" multiple>
        <span class="admin-toolbar-note v_upload_status"></span>
      </div>
      <div class="admin-variant-images-list">${(v.images || []).filter(Boolean).map((u) => `<img src="${escapeHtml(u)}">`).join('')}</div>
    `;
    row.querySelector('.v_remove').addEventListener('click', () => row.remove());
    row.querySelector('.v_upload').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      const statusEl = row.querySelector('.v_upload_status');
      statusEl.textContent = 'Uploading…';
      try {
        const urls = [];
        for (const file of files) {
          const path = `product-photos/${Date.now()}-${file.name}`;
          const fileRef = ref(storage, path);
          await uploadBytes(fileRef, file);
          urls.push(await getDownloadURL(fileRef));
        }
        const input = row.querySelector('.v_images');
        input.value = [input.value, urls.join(', ')].filter(Boolean).join(', ');
        row.querySelector('.admin-variant-images-list').innerHTML += urls.map((u) => `<img src="${escapeHtml(u)}">`).join('');
        statusEl.textContent = 'Uploaded ✓';
      } catch (err) {
        console.warn('upload failed', err);
        statusEl.textContent = 'Upload failed (check Storage rules/config)';
      }
    });
    variantsList.appendChild(row);
  }
  variants.forEach(renderVariantRow);
  document.getElementById('f_addVariant').addEventListener('click', () => renderVariantRow());

  const specsList = document.getElementById('f_specsList');
  function renderSpecRow(s = { label: '', value: '' }) {
    const row = document.createElement('div');
    row.className = 'admin-spec-row';
    row.innerHTML = `
      <input type="text" class="s_label" placeholder="Label (e.g. Fit)" value="${escapeHtml(s.label || '')}">
      <input type="text" class="s_value" placeholder="Value (e.g. Slim Fit)" value="${escapeHtml(s.value || '')}">
      <button type="button" class="admin-remove-row-btn s_remove">&times;</button>`;
    row.querySelector('.s_remove').addEventListener('click', () => row.remove());
    specsList.appendChild(row);
  }
  specs.forEach(renderSpecRow);
  document.getElementById('f_addSpec').addEventListener('click', () => renderSpecRow());

  document.getElementById('f_cancel').addEventListener('click', () => { dom.productForm.hidden = true; dom.productForm.innerHTML = ''; });
  document.getElementById('f_save').addEventListener('click', () => saveProductForm(id));
}

async function saveProductForm(existingId) {
  const val = (id) => document.getElementById(id).value.trim();
  const name = val('f_name');
  if (!name) { alert('Name is required.'); return; }

  const sizes = SIZE_OPTIONS
    .filter((_, i) => document.querySelectorAll('.f_size_enabled')[i].checked)
    .map((s) => ({ size: s, stockStatus: document.querySelector(`.f_size_stock[data-size="${s}"]`).value }));

  const colorVariants = Array.from(document.querySelectorAll('#f_variantsList > div')).map((row) => ({
    name: row.querySelector('.v_name').value.trim(),
    images: row.querySelector('.v_images').value.split(',').map((s) => s.trim()).filter(Boolean),
    swatchImage: row.querySelector('.v_images').value.split(',').map((s) => s.trim()).filter(Boolean)[0] || '',
  })).filter((v) => v.images.length);

  const specifications = Array.from(document.querySelectorAll('#f_specsList > div')).map((row) => ({
    label: row.querySelector('.s_label').value.trim(),
    value: row.querySelector('.s_value').value.trim(),
  })).filter((s) => s.label && s.value);

  const badges = Array.from(document.querySelectorAll('.f_badge')).filter((c) => c.checked).map((c) => c.value);

  const data = {
    name,
    styleName: val('f_styleName'),
    brand: val('f_brand'),
    sku: val('f_sku'),
    category: document.getElementById('f_category').value,
    productType: val('f_productType'),
    targetCategory: document.getElementById('f_targetCategory').value,
    customBadgeText: val('f_customBadgeText'),
    price: Number(document.getElementById('f_price').value) || 0,
    compareAtPrice: document.getElementById('f_compareAtPrice').value ? Number(document.getElementById('f_compareAtPrice').value) : null,
    rank: document.getElementById('f_rank').value !== '' ? Number(document.getElementById('f_rank').value) : null,
    badges,
    inStock: document.getElementById('f_inStock').checked,
    shortDescription: document.getElementById('f_shortDescription').value.trim(),
    description: document.getElementById('f_description').value.trim(),
    sizes,
    colorVariants,
    specifications,
    image: colorVariants[0]?.images?.[0] || '',
  };

  try {
    if (existingId) {
      await updateDoc(doc(db, 'products', existingId), data);
      showToast('Product updated');
    } else {
      data.averageRating = 0;
      data.reviewCount = 0;
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'products'), data);
      showToast('Product created');
    }
    invalidateProductsCache();
    dom.productForm.hidden = true;
    dom.productForm.innerHTML = '';
    await loadProducts();
  } catch (err) {
    console.error('Save product failed', err);
    alert('Could not save product. Check the console and your Firestore rules/config.');
  }
}

// One-time convenience: reads the legacy data/products.json shape (flat
// colors[] + single image/gallery[]) used before Firestore existed, and
// writes each as a Firestore product doc using the SAME id, so existing
// links keep working. Safe to re-run — it just overwrites by id.
async function importLegacyCatalog() {
  dom.importLegacyBtn.disabled = true;
  dom.importLegacyNote.textContent = 'Importing…';
  try {
    const res = await fetch('../data/products.json', { cache: 'no-store' });
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.products || []);
    const CATEGORY_MAP = { Sneakers: 'Shoes', Jackets: 'Clothes', 'T-Shirts': 'Clothes', Watches: 'Accessories', Hats: 'Accessories', Accessories: 'Accessories' };

    let count = 0;
    for (const p of list) {
      const images = [p.image, ...(Array.isArray(p.gallery) ? p.gallery : [])].filter(Boolean);
      const colorVariants = Array.isArray(p.colors) && p.colors.length
        ? p.colors.map((hex, i) => ({ name: `Color ${i + 1}`, swatchImage: images[0] || '', images: images.length ? images : [''] }))
        : [{ name: '', swatchImage: images[0] || '', images: images.length ? images : [''] }];

      await setDoc(doc(db, 'products', p.id), {
        name: p.name,
        styleName: p.styleName || '',
        brand: p.brand || '',
        sku: p.sku || '',
        category: CATEGORY_MAP[p.productType] || 'Clothes',
        productType: p.productType || '',
        targetCategory: p.gender || 'Unisex',
        customBadgeText: '',
        price: Number(p.price) || 0,
        compareAtPrice: p.compareAtPrice != null ? Number(p.compareAtPrice) : null,
        rank: null,
        badges: Array.isArray(p.badges) ? p.badges : [],
        inStock: p.inStock !== false,
        shortDescription: p.shortDescription || '',
        description: p.description || '',
        sizes: Array.isArray(p.sizes) ? p.sizes : [],
        colorVariants,
        colors: p.colors || [],
        specifications: p.specifications || [],
        image: images[0] || '',
        averageRating: Number(p.averageRating) || 0,
        reviewCount: Number(p.reviewCount) || 0,
        createdAt: serverTimestamp(),
      }, { merge: false });
      count++;
    }
    invalidateProductsCache();
    await loadProducts();
    dom.importLegacyNote.textContent = `Imported ${count} products.`;
  } catch (err) {
    console.error('Import failed', err);
    dom.importLegacyNote.textContent = 'Import failed — see console.';
  } finally {
    dom.importLegacyBtn.disabled = false;
  }
}

/* --------------------------------------------------------------------------
   ORDERS
   -------------------------------------------------------------------------- */
async function loadOrders() {
  const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
  const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const rows = orders.map((o) => `
    <tr>
      <td>${escapeHtml(o.orderId || o.id)}</td>
      <td>${escapeHtml((o.customer?.firstName || '') + ' ' + (o.customer?.lastName || ''))}</td>
      <td>${escapeHtml(o.customerEmail || '—')}</td>
      <td>${(o.items || []).length} item(s)</td>
      <td>${formatPrice(o.total)}</td>
      <td>
        <select class="order-status-select" data-id="${o.id}">
          ${['Pending', 'Shipped', 'Delivered'].map((s) => `<option ${o.orderStatus === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('');
  dom.ordersTable.innerHTML = `
    <thead><tr><th>Order ID</th><th>Customer</th><th>Email</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No orders yet.</td></tr>'}</tbody>`;
  dom.ordersTable.querySelectorAll('.order-status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await updateDoc(doc(db, 'orders', sel.dataset.id), { orderStatus: sel.value });
      showToast(`Order marked ${sel.value}`);
    });
  });
}

/* --------------------------------------------------------------------------
   REVIEWS (moderation)
   -------------------------------------------------------------------------- */
async function loadReviews() {
  const snap = await getDocs(query(collection(db, 'pending_reviews'), orderBy('createdAt', 'desc')));
  const reviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const rows = reviews.map((r) => `
    <tr>
      <td>${escapeHtml(r.productName || r.productId)}</td>
      <td>${escapeHtml(r.displayName || 'Anonymous')}</td>
      <td>${'★'.repeat(r.stars || 0)}${'☆'.repeat(5 - (r.stars || 0))}</td>
      <td style="max-width:280px;">${escapeHtml(r.title ? r.title + ' — ' : '')}${escapeHtml((r.content || '').slice(0, 120))}</td>
      <td>${r.photoUrl ? `<img class="thumb" src="${escapeHtml(r.photoUrl)}">` : '—'}</td>
      <td>
        <button class="admin-pill-btn success approve-review-btn" data-id="${r.id}">Approve</button>
        <button class="admin-pill-btn danger reject-review-btn" data-id="${r.id}">Reject</button>
      </td>
    </tr>`).join('');
  dom.reviewsTable.innerHTML = `
    <thead><tr><th>Product</th><th>Customer</th><th>Rating</th><th>Review</th><th>Photo</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No reviews awaiting moderation.</td></tr>'}</tbody>`;

  dom.reviewsTable.querySelectorAll('.approve-review-btn').forEach((btn) => btn.addEventListener('click', () => approveReview(reviews.find((r) => r.id === btn.dataset.id))));
  dom.reviewsTable.querySelectorAll('.reject-review-btn').forEach((btn) => btn.addEventListener('click', () => rejectReview(btn.dataset.id)));
}

async function approveReview(review) {
  if (!review) return;
  const { id, ...data } = review;
  await addDoc(collection(db, 'reviews'), { ...data, approvedAt: serverTimestamp() });
  await deleteDoc(doc(db, 'pending_reviews', id));

  // Recompute the product's cached averageRating/reviewCount so home/shop
  // cards and the PDP header stay accurate without re-reading every review
  // on every page load.
  try {
    const q = query(collection(db, 'reviews'), where('productId', '==', review.productId));
    const snap = await getDocs(q);
    const all = snap.docs.map((d) => d.data());
    const count = all.length;
    const avg = count ? all.reduce((s, r) => s + (Number(r.stars) || 0), 0) / count : 0;
    await updateDoc(doc(db, 'products', review.productId), { averageRating: avg, reviewCount: count });
    invalidateProductsCache();
  } catch (err) {
    console.warn('Could not recompute product rating', err);
  }

  showToast('Review approved');
  loadReviews();
}

async function rejectReview(id) {
  await deleteDoc(doc(db, 'pending_reviews', id));
  showToast('Review rejected');
  loadReviews();
}

/* --------------------------------------------------------------------------
   PROMO CODES
   -------------------------------------------------------------------------- */
let promoCache = [];

async function loadPromoCodes() {
  const snap = await getDocs(collection(db, 'promo_codes'));
  promoCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderPromoTable();
}

function renderPromoTable() {
  const rows = promoCache.map((p) => `
    <tr>
      <td><strong>${escapeHtml(p.code)}</strong></td>
      <td>${p.type === 'shipping' ? 'Free Shipping' : '% Off'}</td>
      <td>${p.value}${p.type === 'shipping' ? '%' : '%'}</td>
      <td>${p.active !== false ? '<span class="admin-badge-instock">Active</span>' : '<span class="admin-badge-oos">Inactive</span>'}</td>
      <td>
        <button class="admin-pill-btn toggle-promo-btn" data-id="${p.id}">${p.active !== false ? 'Deactivate' : 'Activate'}</button>
        <button class="admin-pill-btn danger delete-promo-btn" data-id="${p.id}">Delete</button>
      </td>
    </tr>`).join('');
  dom.promoTable.innerHTML = `
    <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No promo codes yet.</td></tr>'}</tbody>`;

  dom.promoTable.querySelectorAll('.toggle-promo-btn').forEach((btn) => btn.addEventListener('click', async () => {
    const p = promoCache.find((x) => x.id === btn.dataset.id);
    await updateDoc(doc(db, 'promo_codes', p.id), { active: p.active === false });
    await loadPromoCodes();
  }));
  dom.promoTable.querySelectorAll('.delete-promo-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Delete this promo code?')) return;
    await deleteDoc(doc(db, 'promo_codes', btn.dataset.id));
    await loadPromoCodes();
  }));

  dom.newPromoBtn.onclick = openPromoForm;
}

function openPromoForm() {
  dom.promoForm.hidden = false;
  dom.promoForm.innerHTML = `
    <h3 class="admin-section-heading">New Promo Code</h3>
    <div class="admin-form-grid">
      <div><label class="admin-field-label">Code</label><input type="text" id="p_code" placeholder="e.g. SUMMER20"></div>
      <div><label class="admin-field-label">Type</label>
        <select id="p_type"><option value="percent">% Off subtotal</option><option value="shipping">Free / discounted shipping</option></select>
      </div>
      <div><label class="admin-field-label">Value (%)</label><input type="number" id="p_value" placeholder="e.g. 20"></div>
    </div>
    <div class="admin-form-actions">
      <button class="admin-btn-primary" id="p_save">Create</button>
      <button class="admin-btn-ghost" id="p_cancel">Cancel</button>
    </div>`;
  document.getElementById('p_cancel').addEventListener('click', () => { dom.promoForm.hidden = true; });
  document.getElementById('p_save').addEventListener('click', async () => {
    const code = document.getElementById('p_code').value.trim().toUpperCase();
    const type = document.getElementById('p_type').value;
    const value = Number(document.getElementById('p_value').value) || 0;
    if (!code || !value) { alert('Please enter a code and a value.'); return; }
    await addDoc(collection(db, 'promo_codes'), { code, type, value, active: true, createdAt: serverTimestamp() });
    dom.promoForm.hidden = true;
    await loadPromoCodes();
    showToast('Promo code created');
  });
}

/* --------------------------------------------------------------------------
   WAITLIST + REPORTS
   -------------------------------------------------------------------------- */
async function loadWaitlistAndReports() {
  const [waitlistSnap, reportsSnap] = await Promise.all([
    getDocs(query(collection(db, 'waitlist'), orderBy('createdAt', 'desc'))),
    getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc'))),
  ]);
  const waitlist = waitlistSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const reports = reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const groups = new Map(); // key productId|size -> entries[]
  waitlist.forEach((w) => {
    const key = `${w.productId}|${w.size || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  });

  const rows = waitlist.map((w) => {
    const key = `${w.productId}|${w.size || ''}`;
    return `
    <tr>
      <td>${escapeHtml(w.productName || w.productId)}</td>
      <td>${escapeHtml(w.size || '—')}</td>
      <td>${escapeHtml(w.email)}</td>
      <td>${w.notified ? '<span class="admin-badge-instock">Notified</span>' : '<span class="admin-badge-oos">Pending</span>'}</td>
      <td><button class="admin-pill-btn restock-btn" data-key="${escapeHtml(key)}" ${w.notified ? 'disabled' : ''}>Restock &amp; Notify All</button></td>
    </tr>`;
  }).join('');
  dom.waitlistTable.innerHTML = `
    <thead><tr><th>Product</th><th>Size</th><th>Email</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No restock requests.</td></tr>'}</tbody>`;

  dom.waitlistTable.querySelectorAll('.restock-btn').forEach((btn) => btn.addEventListener('click', async () => {
    const [productId, size] = btn.dataset.key.split('|');
    const entries = groups.get(btn.dataset.key) || [];
    const pending = entries.filter((e) => !e.notified);
    if (!pending.length) return;
    btn.disabled = true;
    btn.textContent = 'Processing…';
    try {
      const product = productsCache.find((p) => p.id === productId);
      if (product && size) {
        const sizes = (product.sizes || []).map((s) => s.size === size ? { ...s, stockStatus: 'In Stock' } : s);
        await updateDoc(doc(db, 'products', productId), { sizes });
        product.sizes = sizes;
        invalidateProductsCache();
      }
      await enqueueRestockEmails(pending, product ? product.name : (pending[0].productName || 'Your item'));
      const batch = writeBatch(db);
      pending.forEach((e) => batch.update(doc(db, 'waitlist', e.id), { notified: true }));
      await batch.commit();
      showToast(`Notified ${pending.length} customer(s)`);
      loadWaitlistAndReports();
      renderProductsTable();
    } catch (err) {
      console.error('Restock & notify failed', err);
      alert('Something went wrong. Check the console.');
      btn.disabled = false;
      btn.textContent = 'Restock & Notify All';
    }
  }));

  const reportRows = reports.map((r) => `
    <tr>
      <td>${escapeHtml(r.productName || r.productId)}</td>
      <td>${escapeHtml(r.email)}</td>
      <td style="max-width:320px;">${escapeHtml(r.description)}</td>
      <td>${r.resolved ? '<span class="admin-badge-instock">Resolved</span>' : '<span class="admin-badge-oos">Open</span>'}</td>
      <td>
        ${!r.resolved ? `<button class="admin-pill-btn success resolve-report-btn" data-id="${r.id}">Mark Resolved</button>` : ''}
        <button class="admin-pill-btn danger delete-report-btn" data-id="${r.id}">Delete</button>
      </td>
    </tr>`).join('');
  dom.reportsTable.innerHTML = `
    <thead><tr><th>Product</th><th>Email</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${reportRows || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No reports.</td></tr>'}</tbody>`;

  dom.reportsTable.querySelectorAll('.resolve-report-btn').forEach((btn) => btn.addEventListener('click', async () => {
    await updateDoc(doc(db, 'reports', btn.dataset.id), { resolved: true });
    loadWaitlistAndReports();
  }));
  dom.reportsTable.querySelectorAll('.delete-report-btn').forEach((btn) => btn.addEventListener('click', async () => {
    await deleteDoc(doc(db, 'reports', btn.dataset.id));
    loadWaitlistAndReports();
  }));
}

/* --------------------------------------------------------------------------
   BANNER
   -------------------------------------------------------------------------- */
async function loadBannerSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'site'));
    if (snap.exists()) {
      dom.bannerTextInput.value = snap.data().bannerText || '';
      dom.bannerActiveInput.checked = !!snap.data().bannerActive;
    }
  } catch (err) {
    console.warn('Could not load banner settings', err);
  }
  dom.saveBannerBtn.onclick = async () => {
    await setDoc(doc(db, 'settings', 'site'), {
      bannerText: dom.bannerTextInput.value.trim(),
      bannerActive: dom.bannerActiveInput.checked,
    }, { merge: true });
    dom.bannerSavedNote.textContent = 'Saved ✓';
    setTimeout(() => { dom.bannerSavedNote.textContent = ''; }, 2000);
  };
}
