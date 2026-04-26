/* ═══════════════════════════════════════════════════════════
   STUDY BUDDY — creator.js
   Creator Hub: apply · pending · dashboard · tabs
   ═══════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────
   ENTRY POINT — called by app.js when navigating to creator
──────────────────────────────────────────────────────────── */

function initCreatorHub(user) {
  window._creatorUser = user;
  const status = user.creator_status;

  const screens = ['creator-apply-screen','creator-form-screen','creator-pending-screen','creator-dashboard'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  if (status === 'approved') {
    showCreatorDashboard(user);
  } else if (status === 'pending') {
    showCreatorPending();
  } else {
    showCreatorApplyHero();
  }
}

/* ──────────────────────────────────────────────────────────
   APPLY SCREENS
──────────────────────────────────────────────────────────── */

function showCreatorApplyHero() {
  const el = document.getElementById('creator-apply-screen');
  if (el) el.style.display = '';
}

function openCreatorApplication() {
  document.getElementById('creator-apply-screen').style.display = 'none';
  document.getElementById('creator-form-screen').style.display  = '';
}

function showCreatorPending() {
  const el = document.getElementById('creator-pending-screen');
  if (el) el.style.display = '';
}

/* ──────────────────────────────────────────────────────────
   SUBMIT APPLICATION
──────────────────────────────────────────────────────────── */

async function submitCreatorApplication() {
  const user = window._creatorUser || window._currentUser;
  if (!user) return;

  const brand   = (document.getElementById('ca-brand')?.value || '').trim();
  const bio     = (document.getElementById('ca-bio')?.value   || '').trim();
  const subject = document.getElementById('ca-subject')?.value || '';
  const errEl   = document.getElementById('creator-apply-error');

  if (!brand || !bio || !subject) {
    if (errEl) { errEl.textContent = 'Please fill in all required fields.'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';

  const types = [];
  document.querySelectorAll('.creator-checkbox input[type=checkbox]:checked').forEach(cb => types.push(cb.value));

  const price = parseFloat(document.getElementById('ca-price')?.value || '0') || 0;

  try {
    const apps = await loadCreatorApps();
    const existing = apps.findIndex(a => a.email === user.email);
    const appRecord = {
      id:        existing >= 0 ? apps[existing].id : ('app_' + Date.now() + '_' + Math.random().toString(36).slice(2,6)),
      email:     user.email,
      brand,
      bio,
      subject,
      types,
      price,
      status:    'pending',
      createdAt: existing >= 0 ? apps[existing].createdAt : Date.now(),
      updatedAt: Date.now(),
    };
    if (existing >= 0) apps[existing] = appRecord;
    else apps.push(appRecord);
    await saveCreatorApps(apps);

    document.getElementById('creator-form-screen').style.display = 'none';
    showCreatorPending();
  } catch (e) {
    if (errEl) { errEl.textContent = 'Submission failed. Please try again.'; errEl.style.display = 'block'; }
  }
}

/* ──────────────────────────────────────────────────────────
   CREATOR DASHBOARD
──────────────────────────────────────────────────────────── */

async function showCreatorDashboard(user) {
  const dash = document.getElementById('creator-dashboard');
  if (!dash) return;
  dash.style.display = '';

  // Update header
  const brandEl = dash.querySelector('.creator-dash-brand h2');
  if (brandEl) brandEl.textContent = user.creator_brand || user.full_name || 'Creator';

  const subEl = dash.querySelector('.creator-dash-sub');
  if (subEl) subEl.textContent = user.email || '';

  // Load stats
  await loadCreatorStats(user);

  // Show first tab
  switchCreatorTab('products');
  await loadCreatorProducts(user);
}

/* ──────────────────────────────────────────────────────────
   CREATOR STATS
──────────────────────────────────────────────────────────── */

async function loadCreatorStats(user) {
  try {
    const [products, quizzes, tiers, allSubs] = await Promise.all([
      getMyProducts(),
      getMyQuizzes(),
      getMyTiers(),
      loadUserSubs(),
    ]);
    const mySubs    = allSubs.filter(s => s.creatorEmail === (user?.email || currentUser?.email));
    const revenue   = mySubs.reduce((sum, s) => sum + (s.price || 0), 0);

    const setText2 = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText2('cstat-subs',     mySubs.length);
    setText2('cstat-products', products.length);
    setText2('cstat-quizzes',  quizzes.length);
    setText2('cstat-revenue',  '₱' + revenue.toLocaleString());
  } catch (e) { /* silently skip */ }
}

/* ──────────────────────────────────────────────────────────
   TAB SWITCHING
──────────────────────────────────────────────────────────── */

function switchCreatorTab(tab) {
  // Deactivate all tabs + panels
  document.querySelectorAll('.creator-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.creator-tab-content').forEach(p => {
    p.style.display = 'none';
    p.classList.remove('active');
  });

  // Activate selected
  const tabBtn = document.getElementById(`ctab-${tab}`);
  if (tabBtn) tabBtn.classList.add('active');

  const panel = document.getElementById(`ctabpanel-${tab}`);
  if (panel) {
    panel.style.display = '';
    panel.classList.add('active');
  }

  const user = window._creatorUser || window._currentUser;

  // Lazy-load tab content
  if (tab === 'products')      loadCreatorProducts(user);
  if (tab === 'subscriptions') loadCreatorSubscriptions(user);
  if (tab === 'quizzes')       loadCreatorQuizzes(user);
  if (tab === 'analytics')     loadCreatorAnalytics(user);
}

/* ──────────────────────────────────────────────────────────
   PRODUCTS TAB
──────────────────────────────────────────────────────────── */

async function loadCreatorProducts(user) {
  const grid = document.getElementById('creator-products-grid');
  if (!grid) return;

  try {
    const products = await getMyProducts();

    if (!products.length) {
      grid.innerHTML = `
        <div class="creator-empty" style="grid-column:1/-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          <p>No products yet. Create your first study material!</p>
        </div>`;
      return;
    }
    grid.innerHTML = products.map(buildProductCard).join('');
  } catch (e) {
    grid.innerHTML = `<div class="creator-empty" style="grid-column:1/-1"><p>Could not load products.</p></div>`;
  }
}

function buildProductCard(p) {
  const typeIcons = { notes:'📄', guide:'📘', cheatsheet:'⚡', flashcards:'🗂️', slides:'🖥️', template:'📋' };
  const ptype  = (p.type || 'notes').toLowerCase();
  const icon   = typeIcons[ptype] || '📦';
  const isFree = !p.price || p.price === 0;
  const sales  = p.sales_count || 0;
  const typeLabel = p.type ? escapeHtml(p.type) : 'Study Material';
  const priceBadge = isFree
    ? `<span class="cp-price-badge cp-price-free">Free</span>`
    : `<span class="cp-price-badge cp-price-paid">₱${p.price}</span>`;

  return `
    <div class="cp-product-card">
      <div class="cp-product-top">
        <div class="cp-product-icon">${icon}</div>
        <div class="cp-product-badges">
          <span class="cp-type-badge">${typeLabel}</span>
          ${priceBadge}
        </div>
      </div>
      <h4 class="cp-product-title">${escapeHtml(p.title || 'Untitled')}</h4>
      <p class="cp-product-desc">${escapeHtml(p.description || 'No description provided.')}</p>
      <div class="cp-product-footer">
        <span class="cp-product-sales">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          ${sales} ${sales === 1 ? 'sale' : 'sales'}
        </span>
        <div class="cp-product-actions">
          <button class="cp-btn-secondary" onclick="editProduct('${p.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
            Edit
          </button>
          <button class="cp-btn-danger" onclick="deleteProduct('${p.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            Delete
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ──────────────────────────────────────────────────────────
   PRODUCT MODAL
──────────────────────────────────────────────────────────── */

function openProductModal(productId) {
  window._editingProductId = productId || null;
  let modal = document.getElementById('creator-product-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'creator-product-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:500px;text-align:left;padding:32px" onclick="event.stopPropagation()">
        <h3 class="modal-title">New Product</h3>

        <!-- Live preview strip -->
        <div class="pm-preview">
          <div class="pm-preview-icon" id="pm-preview-icon">📦</div>
          <div style="flex:1;min-width:0">
            <div class="pm-preview-title" id="pm-preview-title">Your product title</div>
            <div class="pm-preview-meta" id="pm-preview-meta">Study Material · Free</div>
          </div>
          <div id="pm-preview-price" class="cp-price-badge cp-price-free">Free</div>
        </div>

        <!-- Type picker -->
        <div class="creator-field">
          <label>Content Type</label>
          <div class="pm-type-grid" id="pm-type-grid">
            ${[
              { value:'notes',      icon:'📄', label:'Notes'       },
              { value:'guide',      icon:'📘', label:'Guide'       },
              { value:'cheatsheet', icon:'⚡', label:'Cheat Sheet' },
              { value:'flashcards', icon:'🗂️', label:'Flashcards'  },
              { value:'slides',     icon:'🖥️', label:'Slides'      },
              { value:'template',   icon:'📋', label:'Template'    },
            ].map(t => `
              <label class="pm-type-pill" data-value="${t.value}">
                <input type="radio" name="pm-type" value="${t.value}" ${t.value==='notes'?'checked':''} />
                <span class="pm-type-icon">${t.icon}</span>
                <span class="pm-type-label">${t.label}</span>
              </label>`).join('')}
          </div>
        </div>

        <div class="creator-field">
          <label>Title</label>
          <input type="text" id="pm-ptitle" placeholder="e.g. Algorithms Cheat Sheet" />
        </div>
        <div class="creator-field">
          <label>Description</label>
          <textarea id="pm-desc" rows="3" placeholder="What will students get from this? Be specific — it sells!"></textarea>
        </div>
        <div class="creator-field">
          <label>Price (₱) — leave blank or 0 for free</label>
          <input type="number" id="pm-price" placeholder="0" min="0" step="1" />
        </div>
        <div id="pm-error" class="login-error" style="display:none"></div>
        <div class="modal-actions">
          <button class="modal-cancel" onclick="closeProductModal()">Cancel</button>
          <button class="modal-confirm" style="background:var(--purple-bright);color:#fff;border-color:var(--purple-bright)" onclick="saveProduct()">Publish Product</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', e => { if (e.target === modal) closeProductModal(); });
    document.body.appendChild(modal);

    // Live preview wiring
    const typeIcons = { notes:'📄', guide:'📘', cheatsheet:'⚡', flashcards:'🗂️', slides:'🖥️', template:'📋' };
    function updatePreview() {
      const title   = document.getElementById('pm-ptitle')?.value.trim() || 'Your product title';
      const price   = parseFloat(document.getElementById('pm-price')?.value) || 0;
      const selType = modal.querySelector('input[name="pm-type"]:checked');
      const typeVal = selType ? selType.value : 'notes';
      const typeLabel = selType ? selType.closest('.pm-type-pill').querySelector('.pm-type-label').textContent : 'Notes';
      const isFree = !price;

      const titleEl = document.getElementById('pm-preview-title');
      const metaEl  = document.getElementById('pm-preview-meta');
      const priceEl = document.getElementById('pm-preview-price');
      const iconEl  = document.getElementById('pm-preview-icon');

      if (titleEl) titleEl.textContent = title || 'Your product title';
      if (metaEl)  metaEl.textContent  = typeLabel + ' · ' + (isFree ? 'Free' : '₱' + price);
      if (iconEl)  iconEl.textContent  = typeIcons[typeVal] || '📦';
      if (priceEl) {
        priceEl.textContent  = isFree ? 'Free' : '₱' + price;
        priceEl.className    = 'cp-price-badge ' + (isFree ? 'cp-price-free' : 'cp-price-paid');
      }

      // Highlight selected type pill
      modal.querySelectorAll('.pm-type-pill').forEach(pill => {
        pill.classList.toggle('pm-type-active', pill.dataset.value === typeVal);
      });
    }

    modal.addEventListener('input', updatePreview);
    modal.addEventListener('change', updatePreview);
    setTimeout(updatePreview, 0);
  }

  // Reset fields
  document.getElementById('pm-ptitle').value = '';
  document.getElementById('pm-desc').value   = '';
  document.getElementById('pm-price').value  = '';
  document.getElementById('pm-error').style.display = 'none';
  const firstType = modal.querySelector('input[name="pm-type"]');
  if (firstType) { firstType.checked = true; }
  // Re-trigger preview reset
  setTimeout(() => {
    const ev = new Event('change', { bubbles: true });
    modal.dispatchEvent(ev);
  }, 0);

  modal.classList.add('open');
}

function closeProductModal() {
  const modal = document.getElementById('creator-product-modal');
  if (modal) modal.classList.remove('open');
}

async function saveProduct() {
  const user  = window._creatorUser || window._currentUser;
  const title = (document.getElementById('pm-ptitle')?.value || '').trim();
  const desc  = (document.getElementById('pm-desc')?.value   || '').trim();
  const price = parseFloat(document.getElementById('pm-price')?.value || '0') || 0;
  const selType = document.querySelector('#creator-product-modal input[name="pm-type"]:checked');
  const type  = selType ? selType.value : 'notes';
  const errEl = document.getElementById('pm-error');

  if (!title) {
    errEl.textContent = 'Please enter a product title.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';

  try {
    const products = await loadProducts();
    if (window._editingProductId) {
      const idx = products.findIndex(p => p.id === window._editingProductId);
      if (idx !== -1) {
        products[idx] = { ...products[idx], title, description: desc, price, type, updatedAt: Date.now() };
      }
    } else {
      products.push({
        id:           'prod_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        creatorEmail: currentUser?.email || user?.email || '',
        title, description: desc, price, type,
        subject:      '',
        purchases:    [],
        createdAt:    Date.now(),
        updatedAt:    Date.now(),
      });
    }
    await saveProducts(products);
    closeProductModal();
    await loadCreatorProducts(user);
    await renderCreatorDashboard(await getMyCreatorApp());
  } catch (e) {
    errEl.textContent = 'Could not save product. Try again.';
    errEl.style.display = 'block';
  }
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  const user = window._creatorUser || window._currentUser || currentUser;
  try {
    const products = await loadProducts();
    await saveProducts(products.filter(p => p.id !== id));
    await loadCreatorProducts(user);
    await renderCreatorDashboard(await getMyCreatorApp());
  } catch (e) {}
}

function editProduct(id) {
  openProductModal(id);
}

/* ──────────────────────────────────────────────────────────
   SUBSCRIPTIONS TAB
──────────────────────────────────────────────────────────── */

async function loadCreatorSubscriptions(user) {
  const grid = document.getElementById('creator-subs-grid');
  const subsList = document.getElementById('creator-subscribers-list');
  if (!grid) return;

  try {
    const tiers = await getMyTiers();

    grid.innerHTML = tiers && tiers.length
      ? tiers.map((t, i) => {
          const perks = t.perks ? t.perks.split(',').map(p => p.trim()).filter(Boolean) : [];
          const tierColors = [
            { bg:'linear-gradient(135deg,#f5f3ff,#ede9fe)', accent:'var(--purple-bright)', badge:'Standard' },
            { bg:'linear-gradient(135deg,#ede9fe,#ddd6fe)', accent:'var(--purple-mid)',    badge:'Popular'  },
            { bg:'linear-gradient(135deg,#4c1d95,#7c3aed)', accent:'#fff',                 badge:'Premium'  },
          ];
          const tc = tierColors[Math.min(i, 2)];
          const isDark = i === 2;
          return `
          <div class="cp-tier-card" style="background:${tc.bg}">
            <div class="cp-tier-badge" style="color:${isDark?'rgba(255,255,255,.7)':'var(--text-light)'}">
              <svg viewBox="0 0 24 24" fill="${isDark?'rgba(255,255,255,.5)':'var(--purple-glow)'}" width="10" height="10"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              ${t.badge || tc.badge}
            </div>
            <div class="cp-tier-name" style="color:${isDark?'#fff':'var(--text-primary)'}">${escapeHtml(t.name || 'Tier')}</div>
            <div class="cp-tier-price" style="color:${tc.accent}">
              <span class="cp-tier-currency" style="color:${isDark?'rgba(255,255,255,.7)':'var(--text-light)'}">₱</span>${t.price || 0}<span class="cp-tier-period" style="color:${isDark?'rgba(255,255,255,.5)':'var(--text-light)'}">/mo</span>
            </div>
            <p class="cp-tier-desc" style="color:${isDark?'rgba(255,255,255,.8)':'var(--text-light)'}">${escapeHtml(t.description || 'Access to exclusive study content.')}</p>
            ${perks.length ? `<ul class="cp-tier-perks">${perks.map(pk=>`<li style="color:${isDark?'rgba(255,255,255,.85)':'var(--text-sub)'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="${isDark?'rgba(255,255,255,.7)':tc.accent}" stroke-width="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
              ${escapeHtml(pk)}</li>`).join('')}</ul>` : ''}
            <div class="cp-tier-actions">
              <button class="cp-btn-secondary ${isDark?'cp-btn-on-dark':''}" onclick="editTier('${t.id}')">Edit</button>
              <button class="cp-btn-danger ${isDark?'cp-btn-on-dark':''}" onclick="deleteTier('${t.id}')">Delete</button>
            </div>
          </div>`;
        }).join('')
      : `<div class="creator-empty" style="grid-column:1/-1">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
           <p>No subscription tiers yet. Create tiers to let students support you monthly.</p>
         </div>`;

    const allSubs = (await loadUserSubs()).filter(s => s.creatorEmail === currentUser?.email);
    const accounts = await loadAccounts();

    if (subsList) {
      const monthlyRevenue = allSubs.reduce((sum, s) => sum + (s.price || 0), 0);

      // Store subs on element for search filtering
      subsList._subs     = allSubs;
      subsList._accounts = accounts;
      subsList._tiers    = tiers;

      subsList.innerHTML = `
        <!-- Stats strip -->
        <div class="cs-sub-stats">
          <div class="cs-sub-stat"><div class="cs-sub-stat-val">${allSubs.length}</div><div class="cs-sub-stat-lbl">subscribers</div></div>
          <div class="cs-sub-stat"><div class="cs-sub-stat-val">₱${monthlyRevenue.toLocaleString()}</div><div class="cs-sub-stat-lbl">monthly</div></div>
          <div class="cs-sub-stat"><div class="cs-sub-stat-val">${tiers.length}</div><div class="cs-sub-stat-lbl">tier${tiers.length !== 1 ? 's' : ''}</div></div>
        </div>

        <!-- Search -->
        ${allSubs.length > 0 ? `
        <div class="cs-sub-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="cs-sub-search-input" type="text" placeholder="Search subscribers…"
            oninput="filterSubscriberList(this.value)" />
        </div>` : ''}

        <!-- List -->
        <div id="cs-sub-rows">
          ${allSubs.length
            ? allSubs.map(s => _buildSubRow(s, accounts, tiers)).join('')
            : `<div class="creator-empty" style="border:none;padding:20px 0">
                 <p style="color:var(--text-light);font-size:.86rem">No active subscribers yet — share your tiers to get started!</p>
               </div>`}
        </div>`;
    }
  } catch (e) {
    grid.innerHTML = `<div class="creator-empty" style="grid-column:1/-1"><p>Could not load subscriptions.</p></div>`;
  }
}


/* ──────────────────────────────────────────────────────────
   SUBSCRIBER LIST HELPERS
──────────────────────────────────────────────────────────── */
function _buildSubRow(s, accounts, tiers) {
  const u     = accounts.find(a => a.email === s.userEmail);
  const name  = u ? u.name : s.userEmail.split('@')[0];
  const init  = (name || '?')[0].toUpperCase();
  const color = u?.avatarColor || 'var(--purple-bright)';
  const tier  = tiers.find(t => t.id === s.tierId);
  const since = s.since
    ? new Date(s.since).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  return `
    <div class="cs-sub-row" data-name="${escapeHtml((name + ' ' + s.userEmail).toLowerCase())}">
      <div class="cp-sub-avatar" style="background:${color}">${escapeHtml(init)}</div>
      <div class="cs-sub-info">
        <div class="cp-sub-name">${escapeHtml(name)}</div>
        <div class="cp-sub-email">${escapeHtml(s.userEmail || '')}</div>
      </div>
      <span class="cp-sub-tier-chip">${escapeHtml(tier?.name || 'Standard')}</span>
      <span class="cp-sub-since">${since}</span>
      <button class="cs-sub-msg-btn" title="Message ${escapeHtml(name)}"
        onclick="if(typeof openMessagesWith==='function') openMessagesWith('${escapeHtml(s.userEmail)}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    </div>`;
}

function filterSubscriberList(query) {
  const rows = document.querySelectorAll('#cs-sub-rows .cs-sub-row');
  const q = query.toLowerCase().trim();
  rows.forEach(row => {
    const match = !q || (row.dataset.name || '').includes(q);
    row.style.display = match ? '' : 'none';
  });
}

function openSubscriptionModal(tierId) {
  window._editingTierId = tierId || null;
  let modal = document.getElementById('creator-tier-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'creator-tier-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:500px;text-align:left;padding:32px" onclick="event.stopPropagation()">
        <h3 class="modal-title" id="tm-title">New Subscription Tier</h3>
        <div class="creator-field">
          <label>Tier Name</label>
          <input type="text" id="tm-name" placeholder="e.g. Basic, Pro, Premium" />
        </div>
        <div class="creator-field">
          <label>Monthly Price (₱)</label>
          <input type="number" id="tm-price" placeholder="e.g. 99" min="0" />
        </div>
        <div class="creator-field">
          <label>What's included (describe the value)</label>
          <textarea id="tm-desc" rows="3" placeholder="e.g. Access to all my study notes, weekly quiz drops, priority Q&A…"></textarea>
        </div>
        <div class="creator-field">
          <label>Perks (comma-separated bullet points)</label>
          <input type="text" id="tm-perks" placeholder="e.g. All study notes, Weekly quizzes, Discord access" />
        </div>
        <div id="tm-error" class="login-error" style="display:none"></div>
        <div class="modal-actions">
          <button class="modal-cancel" onclick="closeTierModal()">Cancel</button>
          <button class="modal-confirm" style="background:var(--purple-bright);color:#fff;border-color:var(--purple-bright)" onclick="saveTier()">Save Tier</button>
        </div>
      </div>`;
    modal.addEventListener('click', closeTierModal);
    document.body.appendChild(modal);
  }
  document.getElementById('tm-name').value  = '';
  document.getElementById('tm-price').value = '';
  document.getElementById('tm-desc').value  = '';
  document.getElementById('tm-perks').value = '';
  document.getElementById('tm-error').style.display = 'none';
  modal.classList.add('open');
}

function closeTierModal() {
  const m = document.getElementById('creator-tier-modal');
  if (m) m.classList.remove('open');
}

async function saveTier() {
  const user  = window._creatorUser || window._currentUser || currentUser;
  const name  = (document.getElementById('tm-name')?.value  || '').trim();
  const price = parseFloat(document.getElementById('tm-price')?.value || '0') || 0;
  const desc  = (document.getElementById('tm-desc')?.value  || '').trim();
  const perks = (document.getElementById('tm-perks')?.value || '').trim();
  const errEl = document.getElementById('tm-error');
  if (!name) { errEl.textContent='Please enter a tier name.'; errEl.style.display='block'; return; }
  errEl.style.display = 'none';
  try {
    const tiers = await loadSubscriptionTiers();
    if (window._editingTierId) {
      const idx = tiers.findIndex(t => t.id === window._editingTierId);
      if (idx !== -1) tiers[idx] = { ...tiers[idx], name, price, description: desc, perks, updatedAt: Date.now() };
    } else {
      tiers.push({
        id:           'tier_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        creatorEmail: user?.email || currentUser?.email || '',
        name, price, description: desc, perks,
        createdAt:    Date.now(),
        updatedAt:    Date.now(),
      });
    }
    await saveSubscriptionTiers(tiers);
    closeTierModal();
    await loadCreatorSubscriptions(user);
  } catch(e) {
    errEl.textContent = 'Could not save tier. Please try again.';
    errEl.style.display = 'block';
  }
}

function editTier(id) { openSubscriptionModal(id); }

async function deleteTier(id) {
  if (!confirm('Delete this subscription tier?')) return;
  const user = window._creatorUser || window._currentUser || currentUser;
  try {
    const tiers = await loadSubscriptionTiers();
    await saveSubscriptionTiers(tiers.filter(t => t.id !== id));
    await loadCreatorSubscriptions(user);
  } catch(e) {}
}

function previewQuiz(id) {
  showToast('Quiz preview coming soon!');
}

/* ──────────────────────────────────────────────────────────
   QUIZ TAB
──────────────────────────────────────────────────────────── */

async function loadCreatorQuizzes(user) {
  const list = document.getElementById('creator-quizzes-list');
  if (!list) return;

  try {
    const quizzes = await getMyQuizzes();

    list.innerHTML = quizzes && quizzes.length
      ? `<div class="cp-quiz-list">${quizzes.map(q => {
          const qs = Array.isArray(q.questions) ? q.questions : [];
          const qCount   = qs.length;
          const isPaid   = q.access === 'paid';
          const attempts = q.attempts || 0;
          return `<div class="cp-quiz-card">
            <div class="cp-quiz-left">
              <div class="cp-quiz-icon">🧠</div>
              <div class="cp-quiz-info">
                <h4 class="cp-quiz-title">${escapeHtml(q.title || 'Untitled Quiz')}</h4>
                <div class="cp-quiz-meta">
                  ${q.subject ? `<span class="cp-quiz-tag">${escapeHtml(q.subject)}</span>` : ''}
                  <span class="cp-quiz-tag ${isPaid ? 'cp-tag-paid' : 'cp-tag-free'}">${isPaid ? '🔒 Subscribers' : '🌐 Free'}</span>
                  <span class="cp-quiz-stat">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    ${qCount} question${qCount !== 1 ? 's' : ''}
                  </span>
                  <span class="cp-quiz-stat">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    ${attempts} attempt${attempts !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
            <div class="cp-quiz-actions">
              <button class="cp-btn-secondary" onclick="previewQuiz('${q.id}')">Preview</button>
              <button class="cp-btn-danger" onclick="deleteQuiz('${q.id}')">Delete</button>
            </div>
          </div>`;
        }).join('')}</div>`
      : `<div class="creator-empty">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
           <p>No quizzes yet. Create your first interactive quiz!</p>
         </div>`;
  } catch (e) {
    list.innerHTML = `<div class="creator-empty"><p>Could not load quizzes.</p></div>`;
  }
}

function openQuizBuilder() {
  const builder = document.getElementById('quiz-builder');
  if (builder) builder.style.display = '';
  // Reset
  const titleEl = document.getElementById('qb-title');
  if (titleEl) titleEl.value = '';
  const qqList = document.getElementById('quiz-questions-list');
  if (qqList) qqList.innerHTML = '';
}

function closeQuizBuilder() {
  const builder = document.getElementById('quiz-builder');
  if (builder) builder.style.display = 'none';
}

function addQuizQuestion() {
  const list = document.getElementById('quiz-questions-list');
  if (!list) return;
  const idx = list.querySelectorAll('.qb-question-block').length + 1;

  const block = document.createElement('div');
  block.className = 'qb-question-block';
  block.innerHTML = `
    <div class="qb-q-header">
      <div class="qb-q-num">Q${idx}</div>
      <button class="qb-q-remove" onclick="removeQuizQuestion(this)" title="Remove question">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <input class="qb-q-input qb-q-text" type="text" placeholder="Enter your question here…" />
    <div class="qb-options-grid">
      ${['A','B','C','D'].map(letter => `
        <label class="qb-option-row">
          <input type="radio" name="correct-q${idx}" value="${letter}" class="qb-correct-radio" />
          <span class="qb-option-letter">${letter}</span>
          <input class="qb-q-input qb-option-input" type="text" placeholder="Option ${letter}…" />
        </label>`).join('')}
    </div>
    <div class="qb-correct-hint">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Select the radio button next to the correct answer
    </div>
  `;
  list.appendChild(block);

  // Auto-highlight selected option
  block.querySelectorAll('.qb-correct-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      block.querySelectorAll('.qb-option-row').forEach(row => row.classList.remove('qb-option-correct'));
      if (radio.checked) radio.closest('.qb-option-row').classList.add('qb-option-correct');
    });
  });

  // Smooth scroll to new question
  block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function removeQuizQuestion(btn) {
  const block = btn.closest('.qb-question-block');
  if (block) {
    block.style.opacity = '0';
    block.style.transform = 'scale(.97)';
    block.style.transition = 'opacity .18s, transform .18s';
    setTimeout(() => {
      block.remove();
      // Re-number remaining questions
      document.querySelectorAll('.qb-question-block').forEach((b, i) => {
        const numEl = b.querySelector('.qb-q-num');
        if (numEl) numEl.textContent = `Q${i + 1}`;
      });
    }, 180);
  }
}

async function saveQuiz() {
  const user  = window._creatorUser || window._currentUser;
  const title = (document.getElementById('qb-title')?.value || '').trim();
  const subject = document.getElementById('qb-subject')?.value || '';
  const access  = document.getElementById('qb-access')?.value  || 'free';

  if (!title) { alert('Please enter a quiz title.'); return; }

  const questions = [];
  document.querySelectorAll('#quiz-questions-list .qb-question-block').forEach((block) => {
    const questionText = block.querySelector('.qb-q-text')?.value.trim() || '';
    const optionInputs = block.querySelectorAll('.qb-option-input');
    const options      = Array.from(optionInputs).map(inp => inp.value.trim());
    const checkedRadio = block.querySelector('.qb-correct-radio:checked');
    const answer       = checkedRadio ? checkedRadio.value : 'A';
    questions.push({ question: questionText, options, answer });
  });

  try {
    const quizzes = await loadQuizzes();
    quizzes.push({
      id:           'quiz_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      creatorEmail: user?.email || currentUser?.email || '',
      title, subject, access,
      questions,
      attempts:     0,
      createdAt:    Date.now(),
      updatedAt:    Date.now(),
    });
    await saveQuizzes(quizzes);
    closeQuizBuilder();
    await loadCreatorQuizzes(user);
    await renderCreatorDashboard(await getMyCreatorApp());
  } catch (e) {
    alert('Could not save quiz. Please try again.');
  }
}

async function deleteQuiz(id) {
  if (!confirm('Delete this quiz?')) return;
  const user = window._creatorUser || window._currentUser || currentUser;
  try {
    const quizzes = await loadQuizzes();
    await saveQuizzes(quizzes.filter(q => q.id !== id));
    await loadCreatorQuizzes(user);
    await renderCreatorDashboard(await getMyCreatorApp());
  } catch (e) {}
}

/* ──────────────────────────────────────────────────────────
   ANALYTICS TAB
──────────────────────────────────────────────────────────── */

async function loadCreatorAnalytics(user) {
  // Delegates to the full renderCreatorAnalytics which uses the correct data layer
  await renderCreatorAnalytics();

  // Sync the header revenue stat
  const allSubs = (await loadUserSubs()).filter(s => s.creatorEmail === currentUser?.email);
  const revenue  = allSubs.reduce((sum, s) => sum + (s.price || 0), 0);
  const revEl    = document.getElementById('cstat-revenue');
  if (revEl) revEl.textContent = '₱' + revenue.toLocaleString();
}

/* ──────────────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────────────────── */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


/* ══════════════════════════════════════════════════════════
   CREATOR HUB — App Logic (migrated from app.js)
   Storage helpers, page init, render functions, badge/paywall
══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════
   CREATOR HUB — Full System
   Storage: sb_creator_apps, sb_products, sb_subscriptions, sb_quizzes, sb_user_subs
══════════════════════════════════════ */

/* ── Storage helpers ── */


/* ── Helpers ── */

async function cacheCreators() {
  const apps = await loadCreatorApps();
  _creatorEmailCache = new Set(
    apps.filter(a => a.status === 'approved').map(a => a.email)
  );
}

function closeSubscriptionModal() {
  document.getElementById('sub-modal-overlay')?.remove();
  editingTierId = null;
}

function getCreatorBadgeHTML(email) {
  if (!email || !_creatorEmailCache.has(email)) return '';
  return '<span class="creator-badge">✦ Creator</span>';
}

async function getMyCreatorApp() {
  if (!currentUser) return null;
  const apps = await loadCreatorApps();
  return apps.find(a => a.email === currentUser.email) || null;
}

async function getMyProducts() {
  if (!currentUser) return [];
  return (await loadProducts()).filter(p => p.creatorEmail === currentUser.email);
}

async function getMyQuizzes() {
  if (!currentUser) return [];
  return (await loadQuizzes()).filter(q => q.creatorEmail === currentUser.email);
}

async function getMyTiers() {
  if (!currentUser) return [];
  return (await loadSubscriptionTiers()).filter(t => t.creatorEmail === currentUser.email);
}

/* ── Page initialisation ── */

async function getPaywallHTML(post) {
  if (!post.isPremium) return '';
  const canView = !currentUser || await isSubscribedTo(post.authorEmail);
  if (canView) return '';
  return `<div class="paywall-overlay">
    <div class="paywall-lock">🔒</div>
    <p class="paywall-msg">This is premium content. Subscribe to <strong>${escHtml(post.authorName||'this creator')}</strong> to unlock.</p>
    <button class="creator-action-btn" onclick="subscribeToCreator('${escHtml(post.authorEmail)}')">Subscribe Now</button>
  </div>`;
}

async function initCreatorPage() {
  const app = await getMyCreatorApp();

  // Show correct screen
  const screens = ['creator-apply-screen','creator-form-screen','creator-pending-screen','creator-dashboard'];
  screens.forEach(s => { const el = document.getElementById(s); if(el) el.style.display = 'none'; });

  if (!app) {
    const el = document.getElementById('creator-apply-screen');
    if (el) el.style.display = '';
  } else if (app.status === 'pending') {
    renderCreatorPending(app);
  } else if (app.status === 'approved') {
    await renderCreatorDashboard(app);
  }

  updateCreatorNavBadge();
}

async function isCreator(email) {
  const apps = await loadCreatorApps();
  const app  = apps.find(a => a.email === email);
  return !!(app && app.status === 'approved');
}

async function isSubscribedTo(creatorEmail) {
  if (!currentUser) return false;
  const subs = await loadUserSubs();
  return subs.some(s => s.userEmail === currentUser.email && s.creatorEmail === creatorEmail);
}

async function renderCreatorAnalytics() {
  const grid = document.getElementById('creator-analytics-grid');
  if (!grid) return;

  // ── Load all data in parallel ──
  const [products, quizzes, tiers, allSubs, allPurchases, accounts] = await Promise.all([
    getMyProducts(),
    getMyQuizzes(),
    getMyTiers(),
    loadUserSubs().then(s => s.filter(s => s.creatorEmail === currentUser.email)),
    (typeof loadPurchases === 'function' ? loadPurchases() : Promise.resolve([])),
    loadAccounts(),
  ]);

  const myPurchases    = allPurchases.filter(pur => products.some(p => p.id === pur.productId));
  const subRevenue     = allSubs.reduce((s, sub) => s + (sub.price || 0), 0);
  const saleRevenue    = myPurchases.reduce((s, p) => s + (p.price || 0), 0);
  const totalRevenue   = subRevenue + saleRevenue;
  const paidProds      = products.filter(p => p.price > 0);
  const freeProds      = products.filter(p => p.price === 0);
  const totalAttempts  = quizzes.reduce((s, q) => s + (q.attempts || 0), 0);
  const maxAttempts    = Math.max(...quizzes.map(q => q.attempts || 0), 1);

  // Purchase count per product
  const purchaseCountMap = {};
  myPurchases.forEach(pur => {
    purchaseCountMap[pur.productId] = (purchaseCountMap[pur.productId] || 0) + 1;
  });
  const sortedProducts = [...products].sort((a, b) =>
    (purchaseCountMap[b.id] || 0) - (purchaseCountMap[a.id] || 0)
  );
  const sortedQuizzes = [...quizzes].sort((a, b) => (b.attempts || 0) - (a.attempts || 0));
  const recentPurchases = [...myPurchases].sort((a, b) => b.purchasedAt - a.purchasedAt).slice(0, 8);

  // ── Helper: build a drawer HTML string ──
  const esc = (s) => escapeHtml ? escapeHtml(String(s||'')) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  function drawerRow(left, right) {
    return `<div class="an-drawer-row">${left}<div class="an-drawer-row-right">${right}</div></div>`;
  }

  // ── Revenue drawer ──
  const drawerRevenueHTML = `
    <div class="an-drawer" id="an-drawer-revenue">
      <div class="an-drawer-header">
        <span class="an-drawer-title">Revenue breakdown</span>
        <span class="an-drawer-meta">all time</span>
      </div>
      ${drawerRow(`<div class="an-drawer-dot" style="background:var(--purple-bright)"></div><span>Subscriptions</span>`,
        `<span class="an-drawer-val">₱${subRevenue.toLocaleString()}</span>`)}
      ${drawerRow(`<div class="an-drawer-dot" style="background:#0891b2"></div><span>Product sales</span>`,
        `<span class="an-drawer-val">₱${saleRevenue.toLocaleString()}</span>`)}
      ${drawerRow(`<div class="an-drawer-dot" style="background:#16a34a"></div><span>Free items given</span>`,
        `<span class="an-drawer-val-muted">${freeProds.length}</span>`)}
      <div class="an-drawer-divider"></div>
      ${drawerRow(`<span style="font-weight:700;color:var(--text-primary)">Total</span>`,
        `<span class="an-drawer-val" style="color:var(--purple-bright)">₱${totalRevenue.toLocaleString()}</span>`)}
    </div>`;

  // ── Subscribers drawer ──
  const subRowsHTML = allSubs.length
    ? allSubs.map(s => {
        const u     = accounts.find(a => a.email === s.userEmail);
        const name  = u ? u.name : s.userEmail.split('@')[0];
        const init  = (name || '?')[0].toUpperCase();
        const color = u?.avatarColor || 'var(--purple-bright)';
        const tier  = tiers.find(t => t.id === s.tierId);
        const since = s.since ? new Date(s.since).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : '—';
        return `
          <div class="an-drawer-row an-sub-row-item" data-name="${esc((name+' '+s.userEmail).toLowerCase())}">
            <div class="an-drawer-avatar" style="background:${color}">${esc(init)}</div>
            <div class="an-drawer-row-info">
              <div class="an-drawer-row-name">${esc(name)}</div>
              <div class="an-drawer-row-sub">Since ${since}</div>
            </div>
            <div class="an-drawer-row-right">
              <span class="an-drawer-chip">${esc(tier?.name || 'Standard')} · ₱${tier?.price || 0}</span>
              <button class="an-drawer-msg-btn" title="Message ${esc(name)}"
                onclick="if(typeof openMessagesWith==='function')openMessagesWith('${esc(s.userEmail)}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </button>
            </div>
          </div>`;
      }).join('')
    : `<div class="an-drawer-empty">No active subscribers yet.</div>`;

  const drawerSubsHTML = `
    <div class="an-drawer" id="an-drawer-subs">
      <div class="an-drawer-header">
        <span class="an-drawer-title">Active subscribers · ${allSubs.length}</span>
        <span class="an-drawer-meta">₱${subRevenue.toLocaleString()}/mo</span>
      </div>
      ${allSubs.length > 2 ? `
        <div class="an-drawer-search-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="an-drawer-search" type="text" placeholder="Search subscribers…" oninput="analyticsFilterSubs(this.value)" />
        </div>` : ''}
      <div id="an-sub-rows">${subRowsHTML}</div>
    </div>`;

  // ── Products drawer ──
  const prodIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--purple-mid)" stroke-width="2" width="14" height="14"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`;
  const prodRowsHTML = sortedProducts.length
    ? sortedProducts.map(p => {
        const count  = purchaseCountMap[p.id] || 0;
        const earned = count * (p.price || 0);
        const chip   = p.price > 0
          ? `<span class="an-drawer-chip an-chip-paid">₱${p.price}</span>`
          : `<span class="an-drawer-chip an-chip-free">Free</span>`;
        return `
          <div class="an-drawer-row">
            <div class="an-drawer-prod-icon">${prodIcon}</div>
            <div class="an-drawer-row-info">
              <div class="an-drawer-row-name">${esc(p.title)}</div>
              <div class="an-drawer-row-sub">${esc(p.type || 'notes')} · ${count} sale${count!==1?'s':''}</div>
            </div>
            <div class="an-drawer-row-right">
              ${chip}
              <span class="an-drawer-val">${p.price > 0 ? '₱'+earned.toLocaleString() : '—'}</span>
            </div>
          </div>`;
      }).join('')
    : `<div class="an-drawer-empty">No products yet.</div>`;

  const drawerProductsHTML = `
    <div class="an-drawer" id="an-drawer-products">
      <div class="an-drawer-header">
        <span class="an-drawer-title">All products · ${products.length}</span>
        <span class="an-drawer-meta">sorted by sales</span>
      </div>
      ${prodRowsHTML}
    </div>`;

  // ── Quizzes drawer ──
  const quizRowsHTML = sortedQuizzes.length
    ? sortedQuizzes.map(q => {
        const pct = Math.round(((q.attempts||0) / maxAttempts) * 100);
        const chip = q.access === 'paid'
          ? `<span class="an-drawer-chip an-chip-paid" style="font-size:.65rem">Subscribers</span>`
          : `<span class="an-drawer-chip an-chip-free" style="font-size:.65rem">Free</span>`;
        return `
          <div class="an-drawer-row">
            <div class="an-drawer-row-info" style="flex:1;min-width:0">
              <div class="an-drawer-row-name">${esc(q.title)}</div>
              <div class="an-drawer-row-sub">${esc(q.subject||'')}${q.subject?' · ':''}${Array.isArray(q.questions)?q.questions.length:0} Qs</div>
            </div>
            <div class="an-drawer-row-right" style="gap:8px">
              ${chip}
              <div class="an-bar-wrap">
                <div class="an-bar-track"><div class="an-bar-fill" style="width:${pct}%"></div></div>
                <span class="an-bar-val">${q.attempts||0}</span>
              </div>
            </div>
          </div>`;
      }).join('')
    : `<div class="an-drawer-empty">No quizzes yet.</div>`;

  const drawerQuizzesHTML = `
    <div class="an-drawer" id="an-drawer-quizzes">
      <div class="an-drawer-header">
        <span class="an-drawer-title">All quizzes · ${quizzes.length}</span>
        <span class="an-drawer-meta">${totalAttempts} total attempts</span>
      </div>
      ${quizRowsHTML}
    </div>`;

  // ── Tiers drawer ──
  const tierDots = ['var(--purple-bright)','#0891b2','#059669','#d97706','#dc2626'];
  const tierRowsHTML = tiers.length
    ? tiers.map((t, i) => {
        const count = allSubs.filter(s => s.tierId === t.id).length;
        return `
          <div class="an-tier-drawer-row">
            <div class="an-drawer-dot" style="background:${tierDots[i%tierDots.length]}"></div>
            <span class="an-drawer-row-name" style="flex:1">${esc(t.name)}</span>
            <span class="an-drawer-row-sub" style="margin-left:0">${count} subscriber${count!==1?'s':''}</span>
            <span class="an-drawer-val" style="min-width:60px;text-align:right">₱${(t.price||0).toLocaleString()}/mo</span>
          </div>`;
      }).join('')
    : `<div class="an-drawer-empty">No tiers created yet.</div>`;

  const drawerTiersHTML = `
    <div class="an-drawer" id="an-drawer-tiers">
      <div class="an-drawer-header">
        <span class="an-drawer-title">Subscription tiers · ${tiers.length}</span>
        <span class="an-drawer-meta">subscriber breakdown</span>
      </div>
      ${tierRowsHTML}
    </div>`;

  // ── Sales drawer ──
  const salesRowsHTML = recentPurchases.length
    ? recentPurchases.map(pur => {
        const prod  = products.find(p => p.id === pur.productId);
        const buyer = accounts.find(a => a.email === pur.userEmail);
        const name  = buyer ? buyer.name : (pur.userEmail||'').split('@')[0];
        const init  = (name||'?')[0].toUpperCase();
        const color = buyer?.avatarColor || '#7c3aed';
        const date  = pur.purchasedAt ? new Date(pur.purchasedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric'}) : '—';
        return `
          <div class="an-drawer-row">
            <div class="an-drawer-avatar" style="background:${color}">${esc(init)}</div>
            <div class="an-drawer-row-info">
              <div class="an-drawer-row-name">${esc(name)}</div>
              <div class="an-drawer-row-sub">${esc(prod?.title||'Unknown product')} · ${date}</div>
            </div>
            <div class="an-drawer-row-right">
              <span class="an-drawer-val">₱${(pur.price||0).toLocaleString()}</span>
            </div>
          </div>`;
      }).join('')
    : `<div class="an-drawer-empty">No purchases recorded yet.</div>`;

  const drawerSalesHTML = `
    <div class="an-drawer" id="an-drawer-sales">
      <div class="an-drawer-header">
        <span class="an-drawer-title">Recent purchases · ${myPurchases.length}</span>
        <span class="an-drawer-meta">₱${saleRevenue.toLocaleString()} total</span>
      </div>
      ${salesRowsHTML}
    </div>`;

  // ── Render grid ──
  // Strip grid-column from drawers — they now live inside the card
  const stripGridCol = html => html.replace(/grid-column[^;]*;?/g, '');

  grid.innerHTML = `
    <div class="an-card" id="an-card-revenue" onclick="toggleAnalyticsCard('revenue')">
      <div class="an-card-top">
        <div>
          <div class="an-card-icon">₱</div>
          <div class="an-card-val">₱${totalRevenue.toLocaleString()}</div>
          <div class="an-card-lbl">Total revenue</div>
          <div class="an-card-sub">subs + sales</div>
        </div>
        <svg class="an-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      ${drawerRevenueHTML}
    </div>

    <div class="an-card" id="an-card-subs" onclick="toggleAnalyticsCard('subs')">
      <div class="an-card-top">
        <div>
          <div class="an-card-icon">👥</div>
          <div class="an-card-val">${allSubs.length}</div>
          <div class="an-card-lbl">Subscribers</div>
          <div class="an-card-sub">₱${subRevenue.toLocaleString()}/mo recurring</div>
        </div>
        <svg class="an-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      ${drawerSubsHTML}
    </div>

    <div class="an-card" id="an-card-products" onclick="toggleAnalyticsCard('products')">
      <div class="an-card-top">
        <div>
          <div class="an-card-icon">📦</div>
          <div class="an-card-val">${products.length}</div>
          <div class="an-card-lbl">Products</div>
          <div class="an-card-sub">${paidProds.length} paid · ${freeProds.length} free</div>
        </div>
        <svg class="an-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      ${drawerProductsHTML}
    </div>

    <div class="an-card" id="an-card-quizzes" onclick="toggleAnalyticsCard('quizzes')">
      <div class="an-card-top">
        <div>
          <div class="an-card-icon">🧠</div>
          <div class="an-card-val">${quizzes.length}</div>
          <div class="an-card-lbl">Quizzes</div>
          <div class="an-card-sub">${totalAttempts} total attempts</div>
        </div>
        <svg class="an-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      ${drawerQuizzesHTML}
    </div>

    <div class="an-card" id="an-card-tiers" onclick="toggleAnalyticsCard('tiers')">
      <div class="an-card-top">
        <div>
          <div class="an-card-icon">🏷</div>
          <div class="an-card-val">${tiers.length}</div>
          <div class="an-card-lbl">Sub tiers</div>
          <div class="an-card-sub">${tiers.map(t=>t.name).join(' · ') || 'None yet'}</div>
        </div>
        <svg class="an-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      ${drawerTiersHTML}
    </div>

    <div class="an-card" id="an-card-sales" onclick="toggleAnalyticsCard('sales')">
      <div class="an-card-top">
        <div>
          <div class="an-card-icon">🛒</div>
          <div class="an-card-val">${myPurchases.length}</div>
          <div class="an-card-lbl">Product sales</div>
          <div class="an-card-sub">₱${saleRevenue.toLocaleString()} earned</div>
        </div>
        <svg class="an-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      ${drawerSalesHTML}
    </div>`;

  // Sync header revenue stat
  const revEl = document.getElementById('cstat-revenue');
  if (revEl) revEl.textContent = '₱' + totalRevenue.toLocaleString();
  const purEl = document.getElementById('cstat-purchases');
  if (purEl) purEl.textContent = myPurchases.length;
}

/* ──────────────────────────────────────────────────────────
   ANALYTICS CARD TOGGLE
──────────────────────────────────────────────────────────── */
let _activeAnalyticsCard = null;

function toggleAnalyticsCard(key) {
  const card   = document.getElementById('an-card-' + key);
  const drawer = document.getElementById('an-drawer-' + key);
  if (!card || !drawer) return;

  const isOpen = _activeAnalyticsCard === key;

  // Close all drawers in place (no DOM moves)
  document.querySelectorAll('.an-card').forEach(c => c.classList.remove('an-card-active'));
  document.querySelectorAll('.an-drawer').forEach(d => {
    d.style.maxHeight = '0';
    d.style.opacity   = '0';
    d.style.paddingTop    = '0';
    d.style.paddingBottom = '0';
    d.style.marginTop     = '0';
  });
  _activeAnalyticsCard = null;

  if (isOpen) return; // same card clicked — just collapse

  // Expand drawer inside its own card
  card.classList.add('an-card-active');
  drawer.style.maxHeight    = drawer.scrollHeight + 32 + 'px';
  drawer.style.opacity      = '1';
  drawer.style.paddingTop   = '12px';
  drawer.style.paddingBottom = '4px';
  drawer.style.marginTop    = '10px';
  _activeAnalyticsCard = key;
}

function analyticsFilterSubs(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('#an-sub-rows .an-sub-row-item').forEach(row => {
    row.style.display = (!q || (row.dataset.name||'').includes(q)) ? '' : 'none';
  });
}

/* ══════════════════════════════════════
   INTEGRATION — Feed paywall badge
   (called in buildPostHTML for paid creator posts)
══════════════════════════════════════ */
// Sync cache of approved creator emails — populated at login/navigation
let _creatorEmailCache = new Set();

async function renderCreatorDashboard(app) {
  const el = document.getElementById('creator-dashboard');
  if (el) el.style.display = '';

  setText('creator-dash-name',    app.brand    || currentUser.name);
  setText('creator-dash-subject', app.subject  || '');

  // Stats
  const myProducts = await getMyProducts();
  const myQuizzes  = await getMyQuizzes();
  const myTiers    = await getMyTiers();
  const allSubs    = (await loadUserSubs()).filter(s => s.creatorEmail === currentUser.email);
  const revenue    = allSubs.reduce((sum, s) => sum + (s.price || 0), 0);

  setText('cstat-subs',     allSubs.length);
  setText('cstat-products', myProducts.length);
  setText('cstat-quizzes',  myQuizzes.length);
  setText('cstat-revenue',  '₱' + revenue.toLocaleString());

  switchCreatorTab('products');
}

/* ── Tab switcher ── */

function renderCreatorPending(app) {
  const el = document.getElementById('creator-pending-screen');
  const info = document.getElementById('creator-pending-info');
  if (el) el.style.display = '';
  if (info) {
    info.innerHTML = `
      <div class="creator-pending-card">
        <strong>${escHtml(app.brand)}</strong>
        <span>${escHtml(app.subject)}</span>
        <span class="creator-status-badge pending">⏳ Under Review</span>
      </div>`;
  }
}

/* ── Dashboard ── */

async function renderCreatorProducts() {
  const grid = document.getElementById('creator-products-grid');
  if (!grid) return;
  const products = await getMyProducts();

  if (!products.length) {
    grid.innerHTML = '<div class="creator-empty">No products yet. Create your first product to start selling!</div>';
    return;
  }

  const typeIcon = { notes:'📝', guide:'📖', resource:'📦', video:'🎬' };
  grid.innerHTML = products.map(p => `
  <div class="creator-product-card">
    <div class="creator-product-type">${typeIcon[p.type]||'📦'} ${escHtml(p.type||'notes')}</div>
    <h4 class="creator-product-title">${escHtml(p.title)}</h4>
    <p class="creator-product-desc">${escHtml(p.description||'')}</p>
    <div class="creator-product-footer">
      <span class="creator-product-price">${p.price > 0 ? '₱'+p.price : 'Free'}</span>
      <span class="creator-product-subject">${escHtml(p.subject||'')}</span>
    </div>
    <div class="creator-product-actions">
      <button class="rnote-btn post-to-feed-btn" onclick="openPostToFeedModal('product','${escHtml(p.id)}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Post to Feed
      </button>
      <button class="rnote-btn secondary" onclick="openProductModal('${escHtml(p.id)}')">Edit</button>
      <button class="rnote-btn danger" onclick="deleteProduct('${escHtml(p.id)}')">Delete</button>
    </div>
  </div>`).join('');
}

async function renderCreatorQuizzes() {
  const list = document.getElementById('creator-quizzes-list');
  if (!list) return;
  const quizzes = await getMyQuizzes();

  if (!quizzes.length) {
    list.innerHTML = '<div class="creator-empty">No quizzes yet. Build your first quiz above!</div>';
    return;
  }

  list.innerHTML = quizzes.map(q => `
  <div class="creator-quiz-card">
    <div class="creator-quiz-header">
      <div>
        <h4 class="creator-quiz-title">${escHtml(q.title)}</h4>
        <span class="creator-quiz-meta">${q.questions.length} questions · ${escHtml(q.subject||'General')} · ${q.access==='paid'?'🔒 Subscribers only':'🌐 Free'}</span>
      </div>
      <div class="creator-product-actions">
        <button class="rnote-btn post-to-feed-btn" onclick="openPostToFeedModal('quiz','${escHtml(q.id)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Post to Feed
        </button>
        <button class="rnote-btn secondary" onclick="openQuizBuilder('${escHtml(q.id)}')">Edit</button>
        <button class="rnote-btn secondary" onclick="previewQuiz('${escHtml(q.id)}')">Preview</button>
        <button class="rnote-btn danger" onclick="deleteQuiz('${escHtml(q.id)}')">Delete</button>
      </div>
    </div>
    <div class="creator-quiz-stats">
      <span>📊 ${q.attempts||0} attempts</span>
      <span>🕐 ${formatTimeAgo(q.updatedAt||q.createdAt)}</span>
    </div>
  </div>`).join('');
}

async function renderCreatorSubscriptions() {
  const tiersGrid = document.getElementById('creator-subs-grid');
  const subsList  = document.getElementById('creator-subscribers-list');
  if (!tiersGrid) return;

  const tiers = await getMyTiers();
  if (!tiers.length) {
    tiersGrid.innerHTML = '<div class="creator-empty">No subscription tiers yet. Create one to start building your community!</div>';
  } else {
    tiersGrid.innerHTML = tiers.map(t => `
    <div class="creator-tier-card">
      <div class="creator-tier-name">${escHtml(t.name)}</div>
      <div class="creator-tier-price">₱${t.price}<span>/month</span></div>
      <p class="creator-tier-desc">${escHtml(t.description||'')}</p>
      <div class="creator-product-actions">
        <button class="rnote-btn post-to-feed-btn" onclick="openPostToFeedModal('subscription','${escHtml(t.id)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Post to Feed
        </button>
        <button class="rnote-btn secondary" onclick="openSubscriptionModal('${escHtml(t.id)}')">Edit</button>
        <button class="rnote-btn danger" onclick="deleteTier('${escHtml(t.id)}')">Delete</button>
      </div>
    </div>`).join('');
  }

  // Subscribers
  if (subsList) {
    const allSubs = (await loadUserSubs()).filter(s => s.creatorEmail === currentUser.email);
    if (!allSubs.length) {
      subsList.innerHTML = '<div class="creator-empty">No subscribers yet.</div>';
    } else {
      const accounts = await loadAccounts();
      subsList.innerHTML = allSubs.map(s => {
        const u = accounts.find(a => a.email === s.userEmail);
        const name = u ? u.name : s.userEmail;
        const tier = tiers.find(t => t.id === s.tierId);
        return `<div class="creator-subscriber-row">
          <div class="creator-sub-avatar" style="background:${u?.avatarColor||AVATAR_COLORS[0]}">${u ? getInitials(u) : '?'}</div>
          <div class="creator-sub-info"><strong>${escHtml(name)}</strong><span>${escHtml(tier?.name||'Unknown tier')} · ₱${s.price}/mo</span></div>
          <span class="creator-sub-since">Since ${new Date(s.since).toLocaleDateString()}</span>
        </div>`;
      }).join('');
    }
  }
}

function renderQuizBuilder() {
  const list = document.getElementById('quiz-questions-list');
  if (!list) return;

  if (!quizQuestions.length) {
    list.innerHTML = '<div class="creator-empty" style="margin:16px 0">No questions yet. Click "+ Question" to add one.</div>';
    return;
  }

  list.innerHTML = quizQuestions.map((q, idx) => `
  <div class="quiz-question-card" id="qq-${idx}">
    <div class="quiz-q-header">
      <span class="quiz-q-num">Q${idx+1}</span>
      <select class="creator-select" onchange="quizQuestions[${idx}].type=this.value;renderQuizBuilder()">
        <option value="multiple" ${q.type==='multiple'?'selected':''}>Multiple Choice</option>
        <option value="truefalse" ${q.type==='truefalse'?'selected':''}>True / False</option>
      </select>
      <button class="rnote-btn danger" style="padding:5px 10px;font-size:.75rem" onclick="removeQuizQuestion(${idx})">Remove</button>
    </div>
    <textarea class="quiz-q-text" placeholder="Question text…" oninput="quizQuestions[${idx}].text=this.value">${escHtml(q.text)}</textarea>
    <div class="quiz-options">
      ${q.type === 'truefalse' ? `
        <label class="quiz-option-row"><input type="radio" name="correct-${idx}" ${q.correct===0?'checked':''} onchange="quizQuestions[${idx}].correct=0" /><span>True</span></label>
        <label class="quiz-option-row"><input type="radio" name="correct-${idx}" ${q.correct===1?'checked':''} onchange="quizQuestions[${idx}].correct=1" /><span>False</span></label>
      ` : (q.options||['','','','']).map((opt, oi) => `
        <label class="quiz-option-row">
          <input type="radio" name="correct-${idx}" ${q.correct===oi?'checked':''} onchange="quizQuestions[${idx}].correct=${oi}" title="Mark as correct answer" />
          <input type="text" class="quiz-option-input" value="${escHtml(opt)}" placeholder="Option ${oi+1}…" oninput="quizQuestions[${idx}].options[${oi}]=this.value" />
        </label>`).join('')}
    </div>
    <p class="quiz-hint">Select the radio button next to the correct answer.</p>
  </div>`).join('');
}

async function saveSubscriptionTier() {
  if (!currentUser) return;
  const name  = (document.getElementById('sm-name')?.value || '').trim();
  const desc  = (document.getElementById('sm-desc')?.value || '').trim();
  const price = parseFloat(document.getElementById('sm-price')?.value || '0') || 0;
  if (!name) { showToast('Please enter a tier name.'); return; }

  const tiers = await loadSubscriptionTiers();
  if (editingTierId) {
    const idx = tiers.findIndex(t => t.id === editingTierId);
    if (idx !== -1) tiers[idx] = { ...tiers[idx], name, description: desc, price, updatedAt: Date.now() };
  } else {
    tiers.push({
      id:           'tier_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      creatorEmail: currentUser.email,
      name, description: desc, price,
      createdAt:    Date.now(),
    });
  }
  await saveSubscriptionTiers(tiers);
  closeSubscriptionModal();
  await renderCreatorSubscriptions();
  renderCreatorDashboard(await getMyCreatorApp());
  showToast('✅ Subscription tier saved!');
}

async function subscribeToCreator(creatorEmail) {
  if (!currentUser) { showToast('Sign in to subscribe.'); return; }
  if (typeof creatorEmail === 'object') creatorEmail = creatorEmail?.email || '';
  if (!creatorEmail) return;
  if (currentUser.email === creatorEmail) { showToast("You can't subscribe to yourself."); return; }

  const tiers = (await loadSubscriptionTiers()).filter(t => t.creatorEmail === creatorEmail);
  if (!tiers.length) { showToast('This creator has no subscription tiers yet.'); return; }

  const alreadySub = (await loadUserSubs()).find(s => s.userEmail === currentUser.email && s.creatorEmail === creatorEmail);
  if (alreadySub) { showToast('You are already subscribed!'); return; }

  // If only one tier, skip the picker
  if (tiers.length === 1) {
    _confirmSubscription(creatorEmail, tiers[0]);
    return;
  }

  // Show tier picker modal
  const creator = await findAccountByEmail(creatorEmail);
  const creatorName = creator ? creator.name : 'this creator';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.id = 'sub-picker-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
  <div class="modal-box sub-picker-box">
    <div class="sub-picker-header">
      <h3>Choose a Plan</h3>
      <p class="sub-picker-sub">Subscribe to <strong>${escHtml(creatorName)}</strong> to unlock premium content</p>
    </div>
    <div class="sub-picker-tiers">
      ${tiers.sort((a,b) => a.price - b.price).map(tier => `
      <div class="sub-picker-tier" onclick="pickTierAndSubscribe('${escHtml(creatorEmail)}','${escHtml(tier.id)}')">
        <div class="sub-picker-tier-name">${escHtml(tier.name)}</div>
        <div class="sub-picker-tier-price">₱${tier.price}<span>/month</span></div>
        ${tier.description ? `<p class="sub-picker-tier-desc">${escHtml(tier.description)}</p>` : ''}
        <button class="cpost-cta-btn" style="width:100%;margin-top:10px">Subscribe · ₱${tier.price}/mo</button>
      </div>`).join('')}
    </div>
    <div class="modal-actions" style="margin-top:16px">
      <button class="modal-cancel" onclick="document.getElementById('sub-picker-overlay').remove()">Cancel</button>
    </div>
  </div>`;

  document.body.appendChild(overlay);
}

/* ══════════════════════════════════════
   QUIZ MAKER
══════════════════════════════════════ */
let editingQuizId = null;
let quizQuestions = [];   // current builder state

async function updateCreatorNavBadge() {
  const badge = document.getElementById('creator-nav-badge');
  if (!badge) return;
  const app = await getMyCreatorApp();
  if (app && app.status === 'approved') {
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

/* ── Application flow ── */
