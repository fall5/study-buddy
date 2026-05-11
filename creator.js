/* ═══════════════════════════════════════════════════════════
   STUDY BUDDY — creator.js
   Creator Hub: apply · pending · dashboard · tabs
   ═══════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────
   ENTRY POINT — called by app.js when navigating to creator
──────────────────────────────────────────────────────────── */

async function initCreatorHub(user) {
  window._creatorUser = user;

  const screens = ['creator-apply-screen','creator-form-screen','creator-pending-screen','creator-dashboard'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Read status from the creator_apps table — user object has no creator_status field
  let app = null;
  try {
    const apps = await loadCreatorApps();
    app = apps.find(a => a.email === user.email) || null;
  } catch (e) {
    console.error('initCreatorHub: could not load creator apps', e);
  }

  const status = app ? app.status : null;

  if (status === 'approved') {
    showCreatorDashboard(user);
  } else {
    // No pending state — either apply or already approved
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

/* showCreatorPending removed — applications are now instantly approved */

/* ──────────────────────────────────────────────────────────
   SUBMIT APPLICATION
──────────────────────────────────────────────────────────── */

async function submitCreatorApplication() {
  const user = window._creatorUser || currentUser;
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

  const contentTypes = [];
  document.querySelectorAll('.creator-checkbox input[type=checkbox]:checked').forEach(cb => contentTypes.push(cb.value));

  const price = parseFloat(document.getElementById('ca-price')?.value || '0') || 0;

  // Disable button to prevent double-submit
  const submitBtn = document.querySelector('#creator-form-screen .creator-apply-btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Setting up your account…'; }

  try {
    // ── 1. Save creator app record as immediately approved ──
    const apps     = await loadCreatorApps();
    const existing = apps.find(a => a.email === user.email);
    const appRecord = {
      email:        user.email,
      brand,
      bio,
      subject,
      contentTypes,
      price,
      status:       'approved',          // instant approval — no review queue
      appliedAt:    existing ? existing.appliedAt : Date.now(),
      approvedAt:   Date.now(),
    };
    if (existing) {
      apps[apps.findIndex(a => a.email === user.email)] = appRecord;
    } else {
      apps.push(appRecord);
    }
    await saveCreatorApps(apps);

    // ── 2. Update the account row — mark as creator and save brand ──
    const accounts = await loadAccounts();
    const accIdx   = accounts.findIndex(a => a.email === user.email);
    if (accIdx !== -1) {
      accounts[accIdx].isCreator    = true;
      accounts[accIdx].creatorBrand = brand;
      await saveAccounts([accounts[accIdx]]);
      // Update in-memory currentUser so the rest of the session reflects it
      if (currentUser && currentUser.email === user.email) {
        currentUser.isCreator    = true;
        currentUser.creatorBrand = brand;
      }
    }

    // ── 3. Refresh creator email cache so badge appears immediately ──
    await cacheCreators();

    // ── 4. Go straight to dashboard — no pending screen ──
    const screens = ['creator-apply-screen', 'creator-form-screen', 'creator-pending-screen'];
    screens.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

    showToast('🎉 Welcome to the Creator Hub!');
    await showCreatorDashboard(user);

  } catch (e) {
    console.error('submitCreatorApplication:', e);
    if (errEl) { errEl.textContent = 'Submission failed. Please try again.'; errEl.style.display = 'block'; }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Application'; }
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

/* ══════════════════════════════════════════════════════════
   WITHDRAW HELPER — localStorage-backed mock wallet
══════════════════════════════════════════════════════════ */
function _getWithdrawn(email) {
  try { return parseFloat(localStorage.getItem('cw_withdrawn_' + (email||'')) || '0'); } catch(e) { return 0; }
}
function _setWithdrawn(email, val) {
  try { localStorage.setItem('cw_withdrawn_' + (email||''), String(val)); } catch(e) {}
}

/* ══════════════════════════════════════════════════════════
   GRANT FREE ACCESS MODAL
══════════════════════════════════════════════════════════ */
async function openGrantAccessModal(tierId, tierName) {
  const user    = window._creatorUser || window._currentUser || currentUser;
  const myEmail = user?.email || '';

  document.getElementById('grant-access-modal')?.remove();
  const modal = document.createElement('div');
  modal.id        = 'grant-access-modal';
  modal.className = 'modal-overlay open';
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  /* Load all accounts for search */
  let accounts = [];
  try { accounts = await loadAccounts(); } catch(e) {}
  const eligible = accounts.filter(a => a.email !== myEmail);

  function renderModal(query, status) {
    const filtered = query
      ? eligible.filter(a =>
          (a.name||'').toLowerCase().includes(query.toLowerCase()) ||
          (a.email||'').toLowerCase().includes(query.toLowerCase()))
      : eligible;

    const rows = filtered.slice(0, 8).map(a => {
      const initials = (a.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      const color    = a.avatarColor || 'linear-gradient(135deg,#7c3aed,#a78bfa)';
      return `
        <div class="gam-row" onclick="grantFreeAccess('${escHtml(a.email)}','${escHtml(a.name||a.email)}','${escHtml(tierId)}','${escHtml(myEmail)}')">
          <div class="gam-avatar" style="background:${color}">${initials}</div>
          <div class="gam-info">
            <div class="gam-name">${escHtml(a.name || a.email)}</div>
            <div class="gam-email">${escHtml(a.email)}</div>
          </div>
          <div class="gam-action-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>`;
    }).join('') || '<div class="gam-empty">No users found</div>';

    const statusHTML = status
      ? `<div class="gam-status gam-status--${status.type}">${status.msg}</div>`
      : '';

    modal.innerHTML = `
      <div class="modal-box gam-box" onclick="event.stopPropagation()">
        <div class="gam-header">
          <div class="gam-header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
          </div>
          <div>
            <h3 class="gam-title">Grant Free Access</h3>
            <p class="gam-subtitle">Give a user free access to <strong>${escHtml(tierName)}</strong></p>
          </div>
          <button class="gam-close" onclick="document.getElementById('grant-access-modal').remove()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        ${statusHTML}

        <div class="gam-search-wrap">
          <svg class="gam-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="gam-search" id="gam-search-inp" type="text" placeholder="Search by name or email…"
            value="${escHtml(query||'')}"
            oninput="(function(v){
              document.getElementById('grant-access-modal')?.__renderModal(v, null);
            })(this.value)" />
        </div>

        <div class="gam-list">${rows}</div>

        <div class="gam-footer">
          <button class="modal-cancel" onclick="document.getElementById('grant-access-modal').remove()">Cancel</button>
        </div>
      </div>`;

    modal.__renderModal = renderModal;
    /* re-focus search */
    setTimeout(() => document.getElementById('gam-search-inp')?.focus(), 40);
  }

  renderModal('', null);

  window.grantFreeAccess = async (targetEmail, targetName, tId, creatorEmail) => {
    try {
      await saveUserSubs([{
        id:           'sub_free_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
        userEmail:    targetEmail,
        creatorEmail: creatorEmail,
        tierId:       tId,
        price:        0,
        since:        Date.now(),
      }]);
      renderModal('', { type: 'ok', msg: `✓ Free access granted to ${targetName}` });
    } catch(e) {
      renderModal('', { type: 'err', msg: '✗ Could not grant access. Please try again.' });
    }
  };
}

/* ══════════════════════════════════════════════════════════
   WITHDRAW MODAL
══════════════════════════════════════════════════════════ */
function openWithdrawModal() {
  const user      = window._creatorUser || window._currentUser || currentUser;
  const myEmail   = user?.email || '';
  const revenue   = window._creatorRevenue    || 0;
  const available = window._creatorTotalMoney || 0;

  document.getElementById('withdraw-modal')?.remove();
  const modal = document.createElement('div');
  modal.id        = 'withdraw-modal';
  modal.className = 'modal-overlay open';
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  function renderModal(amount, status) {
    const safeAmt  = Math.min(Math.max(0, parseFloat(amount)||0), available);
    const statusHTML = status
      ? `<div class="wdm-status wdm-status--${status.type}">${status.msg}</div>`
      : '';

    modal.innerHTML = `
      <div class="modal-box wdm-box" onclick="event.stopPropagation()">
        <div class="wdm-header">
          <div class="wdm-header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div>
            <h3 class="wdm-title">Withdraw Funds</h3>
            <p class="wdm-subtitle">Transfer earnings from your creator balance</p>
          </div>
          <button class="gam-close" onclick="document.getElementById('withdraw-modal').remove()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        ${statusHTML}

        <!-- Balance summary -->
        <div class="wdm-balance-grid">
          <div class="wdm-bal-item">
            <div class="wdm-bal-val">₱${revenue.toLocaleString()}</div>
            <div class="wdm-bal-lbl">Total Revenue</div>
          </div>
          <div class="wdm-bal-divider"></div>
          <div class="wdm-bal-item wdm-bal-item--avail">
            <div class="wdm-bal-val wdm-bal-val--avail">₱${available.toLocaleString()}</div>
            <div class="wdm-bal-lbl">Available</div>
          </div>
        </div>

        <!-- Amount input -->
        <div class="wdm-input-wrap">
          <label class="wdm-input-label">Amount to withdraw</label>
          <div class="wdm-input-row">
            <span class="wdm-currency">₱</span>
            <input class="wdm-amount-inp" id="wdm-amount" type="number"
              min="1" max="${available}" step="1"
              placeholder="0"
              value="${amount||''}"
              oninput="document.getElementById('withdraw-modal').__renderModal(this.value, null)" />
          </div>
          <div class="wdm-quick-row">
            ${[25,50,75,100].map(pct => {
              const v = Math.floor(available * pct / 100);
              return `<button class="wdm-quick-btn" onclick="document.getElementById('wdm-amount').value=${v};document.getElementById('withdraw-modal').__renderModal(${v},null)">${pct}%</button>`;
            }).join('')}
          </div>
          <div class="wdm-hint">After withdrawal: <strong>₱${Math.max(0,available-safeAmt).toLocaleString()}</strong> remaining</div>
        </div>

        <div class="modal-actions" style="margin-top:8px">
          <button class="modal-cancel" onclick="document.getElementById('withdraw-modal').remove()">Cancel</button>
          <button class="wdm-confirm-btn" onclick="doWithdraw(${safeAmt})"
            ${safeAmt <= 0 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            Withdraw ₱${safeAmt.toLocaleString()}
          </button>
        </div>
      </div>`;

    modal.__renderModal = renderModal;
    setTimeout(()=>document.getElementById('wdm-amount')?.focus(), 40);
  }

  renderModal('', null);

  window.doWithdraw = async (amount) => {
    if (!amount || amount <= 0) return;
    const newWithdrawn = _getWithdrawn(myEmail) + amount;
    _setWithdrawn(myEmail, newWithdrawn);
    const newTotal = Math.max(0, revenue - newWithdrawn);
    window._creatorTotalMoney = newTotal;
    const el = document.getElementById('cstat-total-money');
    if (el) el.textContent = '₱' + newTotal.toLocaleString();
    renderModal('', { type: 'ok', msg: `✓ ₱${amount.toLocaleString()} successfully withdrawn! Balance: ₱${newTotal.toLocaleString()}` });
  };
}

/* ══════════════════════════════════════════════════════════
   CREATOR STATS
══════════════════════════════════════════════════════════ */

async function loadCreatorStats(user) {
  try {
    const [products, quizzes, allSubs, allPurchases] = await Promise.all([
      getMyProducts(),
      getMyQuizzes(),
      loadUserSubs(),
      loadPurchases(),
    ]);
    const myEmail     = user?.email || currentUser?.email;
    const mySubs      = allSubs.filter(s => s.creatorEmail === myEmail);
    const myPurchases = allPurchases.filter(pur => products.some(p => p.id === pur.productId));
    const subRevenue  = mySubs.reduce((sum, s) => sum + (s.price || 0), 0);
    const saleRevenue = myPurchases.reduce((sum, p) => sum + (p.price || 0), 0);
    const revenue     = subRevenue + saleRevenue;

    const setText2 = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText2('cstat-subs',       mySubs.length);
    setText2('cstat-products',   products.length);
    setText2('cstat-quizzes',    quizzes.length);
    setText2('cstat-revenue',    '₱' + revenue.toLocaleString());
    setText2('cstat-purchases',  myPurchases.length);

    /* Total money = revenue minus any past withdrawals stored in localStorage */
    const withdrawn  = _getWithdrawn(myEmail);
    const totalMoney = Math.max(0, revenue - withdrawn);
    setText2('cstat-total-money', '₱' + totalMoney.toLocaleString());
    window._creatorRevenue   = revenue;
    window._creatorTotalMoney= totalMoney;
  } catch (e) {
    console.error('loadCreatorStats:', e.message || e);
  }
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

  // Remember which tab is active so renderCreatorDashboard can restore it
  window._activeCreatorTab = tab;

  const user = window._creatorUser || window._currentUser || currentUser;

  // Lazy-load tab content
  if (tab === 'products')      { _activeProductType = 'all'; loadCreatorProducts(user); }
  if (tab === 'subscriptions') loadCreatorSubscriptions(user);
  if (tab === 'quizzes')       loadCreatorQuizzes(user);
  if (tab === 'analytics')     loadCreatorAnalytics(user);
}

/* ──────────────────────────────────────────────────────────
   PRODUCTS TAB
──────────────────────────────────────────────────────────── */

/* Active type filter — 'all' | 'notes' | 'guide' | 'cheatsheet' | 'flashcards' | 'template' | 'quiz' */
let _activeProductType = 'all';

async function loadCreatorProducts(user) {
  const wrap = document.getElementById('creator-products-wrap');
  const grid = document.getElementById('creator-products-grid');
  if (!grid) return;

  try {
    const [products, quizzes] = await Promise.all([getMyProducts(), getMyQuizzes()]);

    // ── Build type counts ──
    const typeCounts = { all: products.length + quizzes.length };
    ['notes','guide','cheatsheet','flashcards','template'].forEach(t => {
      typeCounts[t] = products.filter(p => (p.type||'notes').toLowerCase() === t).length;
    });
    typeCounts.quiz = quizzes.length;

    // ── Render icon-card filter row ──
    const filterTypes = [
      { key:'all',        icon:'📦', label:'All'        },
      { key:'notes',      icon:'📄', label:'Notes'      },
      { key:'guide',      icon:'📘', label:'Guide'      },
      { key:'cheatsheet', icon:'⚡', label:'Cheat Sheet'},
      { key:'flashcards', icon:'🗂️', label:'Flashcards' },
      { key:'template',   icon:'📋', label:'Template'   },
      { key:'quiz',       icon:'🧠', label:'Quiz'       },
    ];

    const filterRow = document.getElementById('cp-type-filter-row');
    if (filterRow) {
      filterRow.innerHTML = filterTypes.map(t => `
        <div class="cp-type-card${_activeProductType === t.key ? ' cp-type-card--active' : ''}"
             onclick="setProductTypeFilter('${t.key}')">
          <div class="cp-type-card-icon">${t.icon}</div>
          <div class="cp-type-card-label">${t.label}</div>
          <div class="cp-type-card-count">${typeCounts[t.key] || 0}</div>
        </div>`).join('');
    }

    // ── Filter and render ──
    const type = _activeProductType;

    if (type === 'quiz') {
      // Show quizzes rendered as product-style cards
      if (!quizzes.length) {
        grid.innerHTML = `
          <div class="creator-empty" style="grid-column:1/-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <p>No quizzes yet. Create your first quiz in the Quizzes tab!</p>
          </div>`;
      } else {
        grid.innerHTML = quizzes.map(buildQuizProductCard).join('');
      }
      return;
    }

    const filtered = type === 'all'
      ? products
      : products.filter(p => (p.type || 'notes').toLowerCase() === type);

    // For "all", append quiz cards after product cards
    const quizCards = type === 'all' ? quizzes.map(buildQuizProductCard).join('') : '';

    if (!filtered.length && (type !== 'all' || !quizzes.length)) {
      grid.innerHTML = `
        <div class="creator-empty" style="grid-column:1/-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          <p>${type === 'all' ? 'No products yet. Create your first study material!' : 'No ' + type + ' products yet.'}</p>
        </div>`;
    } else {
      grid.innerHTML = filtered.map(buildProductCard).join('') + quizCards;
    }
  } catch (e) {
    grid.innerHTML = `<div class="creator-empty" style="grid-column:1/-1"><p>Could not load products.</p></div>`;
  }
}

function setProductTypeFilter(type) {
  _activeProductType = type;
  const user = window._creatorUser || currentUser;
  loadCreatorProducts(user);
}

/* Render a quiz as a product-style card in the products grid */
function buildQuizProductCard(q) {
  const qs       = Array.isArray(q.questions) ? q.questions : [];
  const attempts = q.attempts || 0;
  const sales    = q.sales_count || 0;

  let priceBadge;
  if (q.access === 'subscription') {
    priceBadge = `<span class="cp-type-badge cp-badge-subs">🔒 Subs</span>`;
  } else if (q.access === 'priced') {
    const priceStr = String(q.price || 0);
    priceBadge = `<span class="cp-price-badge cp-price-paid" title="₱${escHtml(priceStr)}">₱${escHtml(priceStr)}</span>`;
  } else {
    priceBadge = `<span class="cp-price-badge cp-price-free">Free</span>`;
  }

  const subjectLine = [q.subject, `${qs.length} question${qs.length !== 1 ? 's' : ''}`].filter(Boolean).join(' · ');

  return `
    <div class="cp-card cp-card--quiz" data-item-id="${escHtml(q.id)}">
      <div class="cp-band cp-band--quiz">
        <span class="cp-band-icon">🧠</span>
        <div class="cp-band-meta">
          <span class="cp-type-badge">Quiz</span>
          ${priceBadge}
        </div>
      </div>
      <div class="cp-body">
        <h4 class="cp-title" title="${escHtml(q.title || 'Untitled Quiz')}">${escHtml(q.title || 'Untitled Quiz')}</h4>
        <p class="cp-desc">${escHtml(subjectLine)}</p>
      </div>
      <div class="cp-foot">
        <div class="cp-stats">
          <span class="cp-stat">
            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            ${sales} sale${sales !== 1 ? 's' : ''}
          </span>
          <div class="cp-stat-div"></div>
          <span class="cp-stat">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            ${attempts} attempt${attempts !== 1 ? 's' : ''}
          </span>
        </div>
        <div class="cp-actions">
          <button class="cp-btn-secondary" onclick="openQuizEditor('${escHtml(q.id)}')">Edit</button>
          <button class="cp-btn-secondary" onclick="previewQuiz('${escHtml(q.id)}')">Preview</button>
          <button class="cp-btn-secondary" onclick="shareQuizToFeed('${escHtml(q.id)}')">Share to Feed</button>
          <button class="cp-btn-danger" onclick="deleteQuiz('${escHtml(q.id)}')">Delete</button>
        </div>
      </div>
    </div>`;
}

function buildProductCard(p) {
  const typeIcons  = { notes:'📄', guide:'📘', cheatsheet:'⚡', flashcards:'🗂️', template:'📋' };
  const typeLabels = { notes:'Notes', guide:'Guide', cheatsheet:'Cheat Sheet', flashcards:'Flashcards', template:'Template' };
  const ptype     = (p.type || 'notes').toLowerCase();
  const icon      = typeIcons[ptype]  || '📦';
  const typeLabel = typeLabels[ptype] || escHtml(p.type || 'Study Material');
  const isFree    = !p.price || p.price === 0;
  const sales     = p.sales_count || 0;
  const files     = Array.isArray(p.attachedFiles) ? p.attachedFiles : [];
  const fileCount = files.length;
  const priceStr  = isFree ? 'Free' : '₱' + p.price;

  const priceBadge = isFree
    ? `<span class="cp-price-badge cp-price-free">Free</span>`
    : `<span class="cp-price-badge cp-price-paid" title="${escHtml(priceStr)}">₱${escHtml(String(p.price))}</span>`;

  return `
    <div class="cp-card cp-card--${ptype}" data-item-id="${escHtml(p.id)}">
      <div class="cp-band cp-band--${ptype}">
        <span class="cp-band-icon">${icon}</span>
        <div class="cp-band-meta">
          <span class="cp-type-badge">${typeLabel}</span>
          ${priceBadge}
        </div>
      </div>
      <div class="cp-body">
        <h4 class="cp-title" title="${escHtml(p.title || 'Untitled')}">${escHtml(p.title || 'Untitled')}</h4>
        <p class="cp-desc">${escHtml(p.description || 'No description provided.')}</p>
      </div>
      <div class="cp-foot">
        <div class="cp-stats">
          <span class="cp-stat">
            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            ${sales} sale${sales !== 1 ? 's' : ''}
          </span>
          <div class="cp-stat-div"></div>
          <span class="cp-stat">
            <svg viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            ${fileCount} file${fileCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div class="cp-actions">
          <button class="cp-btn-secondary" onclick="editProduct('${escHtml(p.id)}')">Edit</button>
          <button class="cp-btn-secondary" onclick="shareProductToFeed('${escHtml(p.id)}')">Share to Feed</button>
          <button class="cp-btn-danger" onclick="deleteProduct('${escHtml(p.id)}')">Delete</button>
        </div>
      </div>
    </div>`;
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
              { value:'template',   icon:'📋', label:'Template'    },
              { value:'quiz',       icon:'🧠', label:'Quiz'        },
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
        <div class="creator-field" id="pm-subject-field">
          <label>Subject <span style="color:#ef4444;font-size:.8rem">*</span> <span style="font-weight:400;color:var(--text-light);font-size:.8rem">Required for ad eligibility</span></label>
          <select id="pm-subject">
            <option value="">Select a subject…</option>
            <optgroup label="── Computer Science">
              <option>Data Structures and Algorithms</option><option>Discrete Mathematics</option>
              <option>Object-Oriented Programming</option><option>Database Management Systems</option>
              <option>Operating Systems</option><option>Computer Networks</option>
              <option>Software Engineering</option><option>Artificial Intelligence</option>
              <option>Machine Learning</option><option>Web Development</option>
              <option>Mobile Application Development</option><option>Cybersecurity</option>
              <option>Cloud Computing</option>
            </optgroup>
            <optgroup label="── Information Technology">
              <option>Information Management</option><option>Systems Analysis and Design</option>
              <option>Database Administration</option><option>Network Administration</option>
              <option>Web Systems and Technologies</option><option>Human-Computer Interaction</option>
              <option>IT Project Management</option><option>Information Assurance and Security</option>
              <option>Integrative Programming</option>
            </optgroup>
            <optgroup label="── Multimedia Computing">
              <option>Digital Arts and Design</option><option>Computer Animation</option>
              <option>Game Development</option><option>3D Modeling</option>
              <option>Video Production</option><option>Motion Graphics</option>
              <option>Sound Design</option><option>User Experience Design</option>
            </optgroup>
            <optgroup label="── Business &amp; Accountancy">
              <option>Financial Accounting</option><option>Managerial Accounting</option>
              <option>Cost Accounting</option><option>Auditing Theory</option>
              <option>Taxation</option><option>Marketing Management</option>
              <option>Human Resource Management</option><option>Operations Management</option>
              <option>Financial Management</option><option>Strategic Management</option>
              <option>Entrepreneurship</option>
            </optgroup>
            <optgroup label="── Engineering">
              <option>Circuit Theory</option><option>Digital Electronics</option>
              <option>Signals and Systems</option><option>Communications Engineering</option>
              <option>Control Systems</option><option>Microprocessors and Microcontrollers</option>
              <option>Embedded Systems</option><option>Operations Research</option>
              <option>Quality Control</option>
            </optgroup>
            <optgroup label="── Health Sciences">
              <option>Anatomy and Physiology</option><option>Pharmacology</option>
              <option>Medical-Surgical Nursing</option><option>Clinical Chemistry</option>
              <option>Hematology</option><option>Medical Microbiology</option>
              <option>Pharmaceutical Chemistry</option><option>Radiographic Positioning</option>
            </optgroup>
            <optgroup label="── Social Sciences &amp; Education">
              <option>General Psychology</option><option>Developmental Psychology</option>
              <option>Social Psychology</option><option>Abnormal Psychology</option>
              <option>Child and Adolescent Development</option><option>Curriculum Development</option>
              <option>Introduction to Criminology</option><option>Criminal Law</option>
              <option>Forensic Science</option>
            </optgroup>
          </select>
        </div>
        <div class="creator-field">
          <label>Price (₱) — leave blank or 0 for free</label>
          <input type="number" id="pm-price" placeholder="0" min="0" step="1" />
        </div>
        <div id="pm-error" class="login-error" style="display:none"></div>

        <!-- Attach row — only visible for notes / guide / cheatsheet -->
        <div class="pm-attach-row" id="pm-attach-row">
          <div class="pm-attach-info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            <div class="pm-attach-info-text">
              <div class="pm-attach-title">Attach files</div>
              <div class="pm-attach-sub">Add downloadable content for students</div>
            </div>
          </div>
          <button class="pm-attach-btn" id="pm-attach-btn" onclick="openAttachPanel()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            Attach
            <span class="pm-attach-count" id="pm-attach-count" style="display:none">0</span>
          </button>
        </div>

        <!-- Quiz info panel — shown only when quiz type is selected -->
        <div class="pm-quiz-info" id="pm-quiz-info" style="display:none">
          <div class="pm-quiz-info-icon">🧠</div>
          <div class="pm-quiz-info-text">
            <div class="pm-quiz-info-title">You're creating a Quiz</div>
            <div class="pm-quiz-info-sub">Clicking Proceed will take you to the Quiz Maker where you can build your questions, set access, and publish.</div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="modal-cancel" onclick="closeProductModal()">Cancel</button>
          <button class="modal-confirm" id="pm-confirm-btn" style="background:var(--purple-bright);color:#fff;border-color:var(--purple-bright)" onclick="saveProduct()">Publish Product</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', e => { if (e.target === modal) closeProductModal(); });
    document.body.appendChild(modal);

    // Live preview wiring
    const typeIcons = { notes:'📄', guide:'📘', cheatsheet:'⚡', flashcards:'🗂️', template:'📋', quiz:'🧠' };
    function updatePreview() {
      const title   = document.getElementById('pm-ptitle')?.value.trim() || 'Your product title';
      const price   = parseFloat(document.getElementById('pm-price')?.value) || 0;
      const selType = modal.querySelector('input[name="pm-type"]:checked');
      const typeVal = selType ? selType.value : 'notes';
      const typeLabel = selType ? selType.closest('.pm-type-pill').querySelector('.pm-type-label').textContent : 'Notes';
      const isFree  = !price;
      const isQuiz  = typeVal === 'quiz';

      const titleEl   = document.getElementById('pm-preview-title');
      const metaEl    = document.getElementById('pm-preview-meta');
      const priceEl   = document.getElementById('pm-preview-price');
      const iconEl    = document.getElementById('pm-preview-icon');
      const confirmBtn = document.getElementById('pm-confirm-btn');
      const quizInfo  = document.getElementById('pm-quiz-info');

      // ── Preview strip ──
      if (titleEl) titleEl.textContent = isQuiz ? 'New Quiz' : (title || 'Your product title');
      if (metaEl)  metaEl.textContent  = isQuiz ? 'Quiz · Quiz Maker' : (typeLabel + ' · ' + (isFree ? 'Free' : '₱' + price));
      if (iconEl)  iconEl.textContent  = typeIcons[typeVal] || '📦';
      if (priceEl) {
        priceEl.textContent = isQuiz ? '🧠' : (isFree ? 'Free' : '₱' + price);
        priceEl.className   = 'cp-price-badge ' + (isQuiz ? 'cp-price-free' : (isFree ? 'cp-price-free' : 'cp-price-paid'));
      }

      // ── Show/hide product-only fields when quiz is selected ──
      const productFields = ['pm-ptitle', 'pm-desc', 'pm-price'].map(id => document.getElementById(id)?.closest('.creator-field')).filter(Boolean);
      const subjectField = document.getElementById('pm-subject-field');
      productFields.forEach(f => { f.style.display = isQuiz ? 'none' : ''; });
      if (subjectField) subjectField.style.display = isQuiz ? 'none' : '';

      // ── Quiz info panel + confirm button label ──
      if (quizInfo)   quizInfo.style.display = isQuiz ? 'flex' : 'none';
      if (confirmBtn) {
        confirmBtn.textContent = isQuiz ? 'Proceed →' : 'Publish Product';
        confirmBtn.onclick     = isQuiz ? proceedToQuizMaker : saveProduct;
      }

      // ── Attach row: only for notes / guide / cheatsheet ──
      const attachRow  = document.getElementById('pm-attach-row');
      const attachTypes = ['notes', 'guide', 'cheatsheet', 'flashcards', 'template'];
      if (attachRow) {
        if (!isQuiz && attachTypes.includes(typeVal)) attachRow.classList.add('visible');
        else attachRow.classList.remove('visible');
      }

      // ── Highlight selected type pill ──
      modal.querySelectorAll('.pm-type-pill').forEach(pill => {
        pill.classList.toggle('pm-type-active', pill.dataset.value === typeVal);
      });
    }

    modal.addEventListener('input', updatePreview);
    modal.addEventListener('change', updatePreview);
    setTimeout(updatePreview, 0);
  }

  // Reset fields — guard against null in case the attach panel is currently shown
  const _rTitle   = document.getElementById('pm-ptitle');
  const _rDesc    = document.getElementById('pm-desc');
  const _rPrice   = document.getElementById('pm-price');
  const _rSubject = document.getElementById('pm-subject');
  const _rErr     = document.getElementById('pm-error');
  if (_rTitle)   _rTitle.value   = '';
  if (_rDesc)    _rDesc.value    = '';
  if (_rPrice)   _rPrice.value   = '';
  if (_rSubject) _rSubject.value = '';
  if (_rErr)     _rErr.style.display = 'none';
  // Reset attached files for a new product
  window._pmAttachedFiles = [];
  window._pmProductFormHTML = null;
  _updateAttachCountBadge();
  const firstType = modal.querySelector('input[name="pm-type"]');
  if (firstType) { firstType.checked = true; }
  // Re-trigger preview reset
  setTimeout(() => {
    const ev = new Event('change', { bubbles: true });
    modal.dispatchEvent(ev);
  }, 0);

  modal.classList.add('open');
}

/* ══════════════════════════════════════
   ATTACH PANEL
   Swap-in panel inside the same modal-box.
   State is held in window._pmAttachedFiles (array of
   { name, type:'notepad'|'pdf'|'txt', blob, noteId? }).
══════════════════════════════════════ */

/* In-memory attached files for the currently open product modal */
window._pmAttachedFiles = window._pmAttachedFiles || [];

/* ── Open / close ── */
function openAttachPanel() {
  const modal = document.getElementById('creator-product-modal');
  if (!modal) return;

  const box = modal.querySelector('.modal-box');
  if (!box) return;

  // ── Snapshot all live input values BEFORE saving innerHTML ──
  // innerHTML serialisation never captures .value set via JS — we must
  // save them separately and restore them after closeAttachPanel().
  window._pmFieldSnapshot = {
    title:   document.getElementById('pm-ptitle')?.value || '',
    desc:    document.getElementById('pm-desc')?.value   || '',
    price:   document.getElementById('pm-price')?.value  || '',
    type:    modal.querySelector('input[name="pm-type"]:checked')?.value || 'notes',
  };

  // Store the current product form state so we can restore it on Back
  window._pmProductFormHTML = box.innerHTML;

  // Grab title for the panel header subtitle
  const title = window._pmFieldSnapshot.title || 'New Product';

  // Build the attach panel HTML inside the same modal-box
  box.innerHTML = _buildAttachPanelHTML(title);

  // Wire tab switching
  box.querySelectorAll('.ap-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      box.querySelectorAll('.ap-tab').forEach(t => t.classList.remove('active'));
      box.querySelectorAll('.ap-tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = box.querySelector('#ap-panel-' + tab.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });

  // Wire upload zone
  const zone     = box.querySelector('.ap-upload-zone');
  const fileInput = box.querySelector('.ap-upload-input');
  if (zone && fileInput) {
    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--purple-bright)'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.style.borderColor = '';
      _handleUploadedFiles(Array.from(e.dataTransfer.files));
    });
    fileInput.addEventListener('change', () => {
      _handleUploadedFiles(Array.from(fileInput.files));
      fileInput.value = '';
    });
  }

  // Render note list + file list
  _renderAttachNoteList();
  _renderAttachFileList();
}

function closeAttachPanel() {
  const modal = document.getElementById('creator-product-modal');
  if (!modal) return;
  const box = modal.querySelector('.modal-box');
  if (!box || !window._pmProductFormHTML) return;

  // Restore the product form HTML
  box.innerHTML = window._pmProductFormHTML;
  window._pmProductFormHTML = null;

  // ── Restore live field values from the snapshot ──
  // innerHTML restore wipes all .value properties — re-apply them now.
  const snap = window._pmFieldSnapshot || {};
  const titleEl = document.getElementById('pm-ptitle');
  const descEl  = document.getElementById('pm-desc');
  const priceEl = document.getElementById('pm-price');
  if (titleEl && snap.title != null) titleEl.value = snap.title;
  if (descEl  && snap.desc  != null) descEl.value  = snap.desc;
  if (priceEl && snap.price != null) priceEl.value = snap.price;

  // Re-select the correct type radio
  if (snap.type) {
    const radio = modal.querySelector(`input[name="pm-type"][value="${snap.type}"]`);
    if (radio) {
      radio.checked = true;
    }
  }
  window._pmFieldSnapshot = null;

  // Re-wire the live preview
  _rewireProductPreview();

  // Update the attach count badge
  _updateAttachCountBadge();

  // Re-update the inline file chips to reflect any changes made in the panel
  _pmRefreshEditFileChips();
}

/* ── Refresh the inline file chips shown in edit mode after
   returning from the attach panel, so they reflect any additions
   or removals made during the panel session.                   ── */
function _pmRefreshEditFileChips() {
  const section = document.getElementById('pm-edit-files-inline');
  if (!section) return; // not in edit mode, nothing to refresh

  const files = window._pmAttachedFiles || [];
  const fileChipSvgs = {
    notepad: `<svg viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
    pdf:     `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    txt:     `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  };

  if (!files.length) {
    section.remove();
    return;
  }

  const chips = files.map(f => {
    const ftype = (f.type || 'pdf').toLowerCase();
    const cls   = ftype === 'notepad' ? 'pm-edit-file-chip pm-efc-np'
                : ftype === 'txt'     ? 'pm-edit-file-chip pm-efc-txt'
                :                       'pm-edit-file-chip pm-efc-pdf';
    return `<span class="${cls}">${fileChipSvgs[ftype] || fileChipSvgs.pdf}${escHtml(f.name || 'file')}</span>`;
  }).join('');

  const chipsEl = section.querySelector('.pm-edit-files-chips');
  if (chipsEl) chipsEl.innerHTML = chips;
}
function _rewireProductPreview() {
  const modal = document.getElementById('creator-product-modal');
  if (!modal) return;
  const typeIcons = { notes:'📄', guide:'📘', cheatsheet:'⚡', flashcards:'🗂️', template:'📋', quiz:'🧠' };
  const attachTypes = ['notes', 'guide', 'cheatsheet', 'flashcards', 'template'];

  function updatePreview() {
    const title    = document.getElementById('pm-ptitle')?.value.trim() || 'Your product title';
    const price    = parseFloat(document.getElementById('pm-price')?.value) || 0;
    const selType  = modal.querySelector('input[name="pm-type"]:checked');
    const typeVal  = selType ? selType.value : 'notes';
    const typeLabel= selType ? selType.closest('.pm-type-pill').querySelector('.pm-type-label').textContent : 'Notes';
    const isFree   = !price;
    const isQuiz   = typeVal === 'quiz';

    const titleEl    = document.getElementById('pm-preview-title');
    const metaEl     = document.getElementById('pm-preview-meta');
    const priceEl    = document.getElementById('pm-preview-price');
    const iconEl     = document.getElementById('pm-preview-icon');
    const confirmBtn = document.getElementById('pm-confirm-btn');
    const quizInfo   = document.getElementById('pm-quiz-info');

    if (titleEl) titleEl.textContent = isQuiz ? 'New Quiz' : (title || 'Your product title');
    if (metaEl)  metaEl.textContent  = isQuiz ? 'Quiz · Quiz Maker' : (typeLabel + ' · ' + (isFree ? 'Free' : '₱' + price));
    if (iconEl)  iconEl.textContent  = typeIcons[typeVal] || '📦';
    if (priceEl) {
      priceEl.textContent = isQuiz ? '🧠' : (isFree ? 'Free' : '₱' + price);
      priceEl.className   = 'cp-price-badge ' + (isQuiz ? 'cp-price-free' : (isFree ? 'cp-price-free' : 'cp-price-paid'));
    }

    const productFields = ['pm-ptitle', 'pm-desc', 'pm-price'].map(id => document.getElementById(id)?.closest('.creator-field')).filter(Boolean);
    productFields.forEach(f => { f.style.display = isQuiz ? 'none' : ''; });

    if (quizInfo)   quizInfo.style.display = isQuiz ? 'flex' : 'none';
    if (confirmBtn) {
      confirmBtn.textContent = isQuiz ? 'Proceed →' : 'Publish Product';
      confirmBtn.onclick     = isQuiz ? proceedToQuizMaker : saveProduct;
    }

    // Attach row visibility
    const attachRow = document.getElementById('pm-attach-row');
    if (attachRow) {
      if (!isQuiz && attachTypes.includes(typeVal)) attachRow.classList.add('visible');
      else attachRow.classList.remove('visible');
    }

    modal.querySelectorAll('.pm-type-pill').forEach(pill => {
      pill.classList.toggle('pm-type-active', pill.dataset.value === typeVal);
    });
  }

  modal.addEventListener('input', updatePreview);
  modal.addEventListener('change', updatePreview);
  updatePreview();
  _updateAttachCountBadge();
}

/* ── Build the attach panel HTML ── */
function _buildAttachPanelHTML(productTitle) {
  return `
    <div class="pm-attach-panel">
      <div class="ap-header">
        <button class="ap-back-btn" onclick="closeAttachPanel()" title="Back to product">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="ap-header-info">
          <div class="ap-header-title">Attach content</div>
          <div class="ap-header-sub">${escHtml(productTitle)}</div>
        </div>
      </div>

      <div class="ap-tabs">
        <button class="ap-tab active" data-tab="notepad">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          From my notepad
        </button>
        <button class="ap-tab" data-tab="upload">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Upload a file
        </button>
      </div>

      <!-- Notepad tab -->
      <div class="ap-tab-panel active" id="ap-panel-notepad">
        <div class="ap-note-list" id="ap-note-list">
          <div class="ap-note-empty">Loading your notes…</div>
        </div>
      </div>

      <!-- Upload tab -->
      <div class="ap-tab-panel" id="ap-panel-upload">
        <div class="ap-upload-zone">
          <div class="ap-upload-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
          <div class="ap-upload-main">Click to upload or drag &amp; drop</div>
          <div class="ap-upload-sub">Students will be able to download these files</div>
          <div class="ap-upload-types">
            <span class="ap-upload-chip">.pdf</span>
            <span class="ap-upload-chip">.txt</span>
          </div>
          <input type="file" class="ap-upload-input" accept=".pdf,.txt" multiple />
        </div>
      </div>

      <!-- Attached files (always visible) -->
      <div class="ap-divider"></div>
      <div class="ap-files-label">Attached files</div>
      <div class="ap-file-list" id="ap-file-list"></div>

      <!-- Footer -->
      <div class="ap-footer">
        <div class="ap-footer-info" id="ap-footer-info">No files attached yet</div>
        <div class="ap-footer-actions">
          <button class="ap-btn-back" onclick="closeAttachPanel()">← Back</button>
          <button class="ap-btn-save" onclick="closeAttachPanel()">Save &amp; return</button>
        </div>
      </div>
    </div>
  `;
}

/* ── Render the notepad note list ── */
function _renderAttachNoteList() {
  const listEl = document.getElementById('ap-note-list');
  if (!listEl) return;

  // _npNotes is the in-memory array from notepad.js
  const notes = (typeof _npNotes !== 'undefined' ? _npNotes : []);
  if (!notes.length) {
    listEl.innerHTML = '<div class="ap-note-empty">No notes found in your notepad.</div>';
    return;
  }

  listEl.innerHTML = notes
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(note => {
      const isSelected = window._pmAttachedFiles.some(f => f.noteId === note.id);
      const folder = (typeof _npFolders !== 'undefined')
        ? _npFolders.find(f => f.id === note.folderId)
        : null;
      const accent = folder ? folder.color : 'var(--purple-bright)';
      const updStr = note.updatedAt
        ? new Date(note.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
        : '';

      return `
        <div class="ap-note-row${isSelected ? ' selected' : ''}"
             onclick="toggleAttachNote('${escHtml(note.id)}')"
             data-note-id="${escHtml(note.id)}">
          <div class="ap-note-accent" style="background:${accent}"></div>
          <div class="ap-note-body">
            <div class="ap-note-title">${escHtml(note.title || 'Untitled')}</div>
            <div class="ap-note-meta">${escHtml(note.subject || 'No subject')} · Updated ${updStr}</div>
          </div>
          <div class="ap-note-check${isSelected ? ' on' : ''}" id="apchk-${escHtml(note.id)}">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>`;
    }).join('');
}

/* ── Toggle a note in/out of attached files ── */
function toggleAttachNote(noteId) {
  const note = (typeof _npNotes !== 'undefined' ? _npNotes : []).find(n => n.id === noteId);
  if (!note) return;

  const alreadyIdx = window._pmAttachedFiles.findIndex(f => f.noteId === noteId);

  if (alreadyIdx !== -1) {
    // Deselect — remove from list
    window._pmAttachedFiles.splice(alreadyIdx, 1);
  } else {
    // Select — add as a notepad entry (PDF generated on save/download)
    const slug = (note.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    window._pmAttachedFiles.push({
      name:   slug + '.pdf',
      type:   'notepad',
      noteId: note.id,
      title:  note.title || 'Untitled',
    });
  }

  // Update the row UI
  const row  = document.querySelector(`.ap-note-row[data-note-id="${CSS.escape(noteId)}"]`);
  const chk  = document.getElementById('apchk-' + noteId);
  const isOn = alreadyIdx === -1;
  if (row) row.classList.toggle('selected', isOn);
  if (chk) chk.classList.toggle('on', isOn);

  _renderAttachFileList();
  _updateAttachCountBadge();
}

/* ── Handle files dropped / chosen via input ── */
function _handleUploadedFiles(files) {
  const allowed = ['application/pdf', 'text/plain'];
  files.forEach(file => {
    if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|txt)$/i)) {
      showToast('Only .pdf and .txt files are supported.');
      return;
    }
    // Prevent duplicates by name
    if (window._pmAttachedFiles.some(f => f.name === file.name)) {
      showToast(`"${file.name}" is already attached.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      window._pmAttachedFiles.push({
        name:    file.name,
        type:    file.name.match(/\.pdf$/i) ? 'pdf' : 'txt',
        dataUrl: reader.result,
      });
      _renderAttachFileList();
      _updateAttachCountBadge();
      showToast(`📎 "${file.name}" attached`);
    };
    reader.readAsDataURL(file);
  });
}

/* ── Render the attached files list ── */
function _renderAttachFileList() {
  const listEl   = document.getElementById('ap-file-list');
  const footerEl = document.getElementById('ap-footer-info');
  if (!listEl) return;

  const files = window._pmAttachedFiles;

  if (!files.length) {
    listEl.innerHTML = '<div class="ap-files-empty">No files attached yet.</div>';
    if (footerEl) footerEl.innerHTML = 'No files attached yet';
    return;
  }

  listEl.innerHTML = files.map((f, i) => {
    const iconClass = f.type === 'notepad' ? 'ap-fi-notepad'
                    : f.type === 'pdf'     ? 'ap-fi-pdf'
                    :                        'ap-fi-txt';
    const badgeClass = f.type === 'notepad' ? 'ap-badge-notepad'
                     : f.type === 'pdf'     ? 'ap-badge-pdf'
                     :                        'ap-badge-txt';
    const badgeLabel = f.type === 'notepad' ? 'Notepad'
                     : f.type === 'pdf'     ? 'PDF'
                     :                        'TXT';

    const iconSvg = f.type === 'notepad'
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

    return `
      <div class="ap-file-row">
        <div class="ap-file-icon ${iconClass}">${iconSvg}</div>
        <div class="ap-file-name">${escHtml(f.name)}</div>
        <span class="ap-file-badge ${badgeClass}">${badgeLabel}</span>
        <button class="ap-file-del" onclick="removeAttachedFile(${i})" title="Remove">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
  }).join('');

  if (footerEl) {
    const count = files.length;
    footerEl.innerHTML = `<strong>${count} file${count !== 1 ? 's' : ''}</strong> attached · students can download all`;
  }
}

/* ── Remove a file from the attached list ── */
function removeAttachedFile(idx) {
  const f = window._pmAttachedFiles[idx];
  if (!f) return;

  window._pmAttachedFiles.splice(idx, 1);

  // If it was a notepad note, also uncheck it in the note list
  if (f.noteId) {
    const row = document.querySelector(`.ap-note-row[data-note-id="${CSS.escape(f.noteId)}"]`);
    const chk = document.getElementById('apchk-' + f.noteId);
    if (row) row.classList.remove('selected');
    if (chk) chk.classList.remove('on');
  }

  _renderAttachFileList();
  _updateAttachCountBadge();
}

/* ── Update the count badge on the Attach button ── */
function _updateAttachCountBadge() {
  const badge = document.getElementById('pm-attach-count');
  if (!badge) return;
  const count = window._pmAttachedFiles.length;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

function closeProductModal() {
  const modal = document.getElementById('creator-product-modal');
  if (modal) modal.classList.remove('open');
}

/* ── Proceed to Quiz Maker from the New Product modal ──
   Closes the modal, switches to the Quizzes tab, and
   opens the quiz builder in a clean new-quiz state.     */
function proceedToQuizMaker() {
  closeProductModal();
  // Switch to the Quizzes tab
  switchCreatorTab('quizzes');
  // Small tick to let the tab panel become visible before we scroll the builder into view
  setTimeout(() => {
    openQuizBuilder();
    const builder = document.getElementById('quiz-builder');
    if (builder) builder.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

async function saveProduct() {
  const user    = window._creatorUser || window._currentUser;
  const title   = (document.getElementById('pm-ptitle')?.value || '').trim();
  const desc    = (document.getElementById('pm-desc')?.value   || '').trim();
  const price   = parseFloat(document.getElementById('pm-price')?.value || '0') || 0;
  const subject = (document.getElementById('pm-subject')?.value || '').trim();
  const selType = document.querySelector('#creator-product-modal input[name="pm-type"]:checked');
  const type    = selType ? selType.value : 'notes';
  const errEl   = document.getElementById('pm-error');

  if (!title) {
    errEl.textContent = 'Please enter a product title.';
    errEl.style.display = 'block';
    return;
  }
  if (!subject) {
    errEl.textContent = "Please select a subject — it's required for your product to appear in ads.";
    errEl.style.display = 'block';
    document.getElementById('pm-subject')?.focus();
    return;
  }
  errEl.style.display = 'none';

  try {
    // ── Resolve notepad files into real dataUrls before saving ──
    const resolvedFiles = await _pmResolveAttachedFiles(window._pmAttachedFiles || []);

    const products = await loadProducts();
    if (window._editingProductId) {
      const idx = products.findIndex(p => p.id === window._editingProductId);
      if (idx !== -1) {
        // Preserve existing attachedFiles if none were added/changed this session
        const existingFiles = products[idx].attachedFiles || [];
        const hasNewFiles   = (window._pmAttachedFiles || []).length > 0;
        products[idx] = {
          ...products[idx],
          title, description: desc, price, type, subject,
          attachedFiles: hasNewFiles ? resolvedFiles : existingFiles,
          updatedAt: Date.now(),
        };
      }
    } else {
      products.push({
        id:            'prod_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        creatorEmail:  currentUser?.email || user?.email || '',
        title, description: desc, price, type, subject,
        attachedFiles: resolvedFiles,
        purchases:     [],
        createdAt:     Date.now(),
        updatedAt:     Date.now(),
      });
    }
    await saveProducts(products);
    closeProductModal();
    await loadCreatorProducts(user);
  } catch (e) {
    console.error('saveProduct error:', e);
    errEl.textContent = 'Could not save product. Try again.';
    errEl.style.display = 'block';
  }
}

/* ── Resolve all queued attached files into storable objects.
   Notepad-sourced files: generate HTML content string (not a print
   dialog) so we can store it as a data URL for later viewing.
   Uploaded files: dataUrl already present from FileReader.        ── */
async function _pmResolveAttachedFiles(files) {
  const resolved = [];
  for (const f of files) {
    if (f.type === 'notepad' && f.noteId) {
      // Find the note and build its content as a self-contained HTML dataUrl
      const note = (typeof _npNotes !== 'undefined' ? _npNotes : []).find(n => n.id === f.noteId);
      if (note) {
        const htmlContent  = note.contentHtml || note.content || '';
        const noteTitle    = note.title || 'Untitled Note';
        const subject      = note.subject || '';
        const dateStr      = new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
        const fullHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${_creatorEscHtml(noteTitle)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans','Segoe UI',sans-serif;font-size:11pt;color:#1e0a3c;line-height:1.7;padding:32px;max-width:820px;margin:0 auto}
  h1{font-family:'Syne',sans-serif;font-size:22pt;font-weight:800;color:#3b0764;margin-bottom:6px}
  .meta{font-size:9pt;color:#7b6fa0;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #7c3aed}
  .subject-pill{display:inline-block;background:#f5f3ff;color:#6d28d9;border:1px solid #c4b5fd;border-radius:20px;padding:1px 10px;font-size:8.5pt;font-weight:600;margin-right:8px}
  h2{font-family:'Syne',sans-serif;font-size:14pt;font-weight:800;color:#3b0764;margin:20px 0 8px}
  h3{font-size:11pt;font-weight:600;color:#6d28d9;margin:14px 0 4px}
  p{margin-bottom:8px}
  ul,ol{padding-left:20px;margin-bottom:8px}
  li{margin-bottom:3px}
  strong{font-weight:600}
  code{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:4px;padding:1px 5px;font-family:monospace;font-size:9.5pt;color:#5b21b6}
  pre{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px;padding:12px 16px;margin-bottom:10px;overflow-x:auto}
  blockquote{border-left:3px solid #c4b5fd;padding-left:14px;margin:10px 0;color:#6d28d9;font-style:italic}
</style></head><body>
<h1>${_creatorEscHtml(noteTitle)}</h1>
<div class="meta">
  ${subject ? `<span class="subject-pill">${_creatorEscHtml(subject)}</span>` : ''}
  <span>${dateStr} · Study Buddy Notes</span>
</div>
<div class="note-body">${htmlContent}</div>
</body></html>`;
        const blob    = new Blob([fullHtml], { type: 'text/html' });
        const dataUrl = await _blobToDataUrl(blob);
        resolved.push({ name: f.name, type: 'notepad', noteId: f.noteId, dataUrl });
      }
    } else if (f.dataUrl) {
      resolved.push({ name: f.name, type: f.type, dataUrl: f.dataUrl });
    }
  }
  return resolved;
}

function _blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

function _creatorEscHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  // Remove from DOM immediately — no reflow/jump
  const card = document.querySelector(`[data-item-id="${id}"]`);
  if (card) {
    card.style.transition = 'opacity .18s, transform .18s';
    card.style.opacity = '0';
    card.style.transform = 'scale(.97)';
    setTimeout(() => card.remove(), 190);
  }
  try {
    await sbDelete('products', 'id', id);
    showToast('Product deleted.');
  } catch (e) {
    console.error('deleteProduct:', e);
    showToast('Could not delete product. Please try again.');
    // Restore card if DB delete failed
    if (card) {
      card.style.opacity = '1';
      card.style.transform = '';
    }
  }
}

async function editProduct(id) {
  const products = await loadProducts();
  const p = products.find(prod => prod.id === id);
  if (!p) { showToast('Product not found.'); return; }

  // Open the modal (creates it if needed, resets fields)
  openProductModal(id);

  // Wait one tick for the DOM to be ready
  await new Promise(r => setTimeout(r, 0));

  const modal = document.getElementById('creator-product-modal');
  if (!modal) return;
  const box = modal.querySelector('.modal-box');
  if (!box) return;

  // ── Swap the plain h3 title for the coloured edit header ──
  const typeIcons2 = { notes:'📄', guide:'📘', cheatsheet:'⚡', flashcards:'🗂️', template:'📋' };
  const ptype2     = (p.type || 'notes').toLowerCase();
  const typeIcon2  = typeIcons2[ptype2] || '📦';
  const typeLabel2 = p.type ? (p.type.charAt(0).toUpperCase() + p.type.slice(1)) : 'Product';
  const isFree2    = !p.price || p.price === 0;
  const sales2     = p.salesCount || p.sales_count || 0;
  const files2     = Array.isArray(p.attachedFiles) ? p.attachedFiles : [];
  const lastUpd    = p.updatedAt
    ? new Date(p.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const plainTitle = box.querySelector('.modal-title');
  if (plainTitle) {
    // Build the coloured header
    const headerEl = document.createElement('div');
    headerEl.className = 'pm-edit-header';
    headerEl.innerHTML = `
      <div class="pm-edit-header-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
      </div>
      <div class="pm-edit-header-info">
        <div class="pm-edit-header-title">Edit Product</div>
        <div class="pm-edit-header-sub">Changes apply immediately for all buyers</div>
      </div>
      <span class="pm-edit-header-badge">${typeIcon2} ${escHtml(typeLabel2)}</span>`;
    plainTitle.replaceWith(headerEl);

    // ── Insert current-state strip after the header ──
    const existingStrip = box.querySelector('.pm-edit-current');
    if (!existingStrip) {
      const strip = document.createElement('div');
      strip.className = 'pm-edit-current';
      strip.innerHTML = `
        <div class="pm-edit-current-icon">${typeIcon2}</div>
        <div class="pm-edit-current-info">
          <div class="pm-edit-current-title">${escHtml(p.title || 'Untitled')}</div>
          <div class="pm-edit-current-meta">${escHtml(typeLabel2)} · ${sales2} sale${sales2 !== 1 ? 's' : ''} · ${files2.length} file${files2.length !== 1 ? 's' : ''} attached</div>
        </div>
        <span class="pm-edit-current-price ${isFree2 ? 'cp-price-free' : 'cp-price-paid'}">${isFree2 ? 'Free' : '₱' + p.price}</span>`;
      const preview = box.querySelector('.pm-preview');
      if (preview) box.insertBefore(strip, preview);
    }
  }

  // ── Populate the fields with existing values ──
  const titleEl   = document.getElementById('pm-ptitle');
  const descEl    = document.getElementById('pm-desc');
  const priceEl   = document.getElementById('pm-price');
  const subjectEl = document.getElementById('pm-subject');
  if (titleEl)   titleEl.value   = p.title        || '';
  if (descEl)    descEl.value    = p.description  || '';
  if (priceEl)   priceEl.value   = p.price != null ? String(p.price) : '';
  if (subjectEl) subjectEl.value = p.subject       || '';

  // Select the correct type radio
  const typeRadio = modal.querySelector(`input[name="pm-type"][value="${(p.type || 'notes').toLowerCase()}"]`);
  if (typeRadio) {
    typeRadio.checked = true;
    typeRadio.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── Pre-load attachedFiles into the session state ──
  window._pmAttachedFiles = (p.attachedFiles || []).map(f => ({ ...f }));
  _updateAttachCountBadge();

  // ── Show existing attached files inline above the Attach row ──
  const attachRow = document.getElementById('pm-attach-row');
  if (attachRow && (p.attachedFiles || []).length > 0) {
    const existingFilesEl = document.getElementById('pm-edit-files-inline');
    if (!existingFilesEl) {
      const filesSection = document.createElement('div');
      filesSection.id = 'pm-edit-files-inline';
      filesSection.style.marginBottom = '10px';

      const fileChipSvgs = {
        notepad: `<svg viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
        pdf:     `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
        txt:     `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
      };
      const chips = (p.attachedFiles || []).map(f => {
        const ftype = (f.type || 'pdf').toLowerCase();
        const cls   = ftype === 'notepad' ? 'pm-edit-file-chip pm-efc-np'
                    : ftype === 'txt'     ? 'pm-edit-file-chip pm-efc-txt'
                    :                       'pm-edit-file-chip pm-efc-pdf';
        return `<span class="${cls}">${fileChipSvgs[ftype] || fileChipSvgs.pdf}${escHtml(f.name || 'file')}</span>`;
      }).join('');

      filesSection.innerHTML = `
        <div class="pm-edit-files-header">
          <span class="pm-edit-files-label">Attached files</span>
          <button class="pm-edit-files-manage" onclick="openAttachPanel()">+ Manage files</button>
        </div>
        <div class="pm-edit-files-chips">${chips}</div>`;
      attachRow.parentNode.insertBefore(filesSection, attachRow);
    }
  }

  // ── Swap "Publish Product" → "Save Changes" ──
  const confirmBtn = box.querySelector('.modal-confirm');
  if (confirmBtn) {
    confirmBtn.textContent = 'Save Changes';
    confirmBtn.classList.add('pm-edit-confirm');
  }

  // ── Add "Last updated" hint in footer ──
  const actions = box.querySelector('.modal-actions');
  if (actions && !box.querySelector('.pm-edit-last-updated')) {
    const hint = document.createElement('span');
    hint.className = 'pm-edit-last-updated';
    hint.style.cssText = 'font-size:.72rem;color:var(--text-light);margin-right:auto';
    hint.textContent = lastUpd ? `Last updated ${lastUpd}` : '';
    actions.insertBefore(hint, actions.firstChild);
  }

  // Re-trigger preview with new values
  modal.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ──────────────────────────────────────────────────────────
   SUBSCRIPTIONS TAB
──────────────────────────────────────────────────────────── */

/* FIX 2 — loadCreatorSubscriptions uses getCreatorSubscription directly.
   Variable renamed tier→sub throughout. editTier() takes no id argument
   (the modal always fetches the current sub fresh from DB).
   _buildSubRow now receives the single sub object instead of a tiers array. */
async function loadCreatorSubscriptions(user) {
  const grid     = document.getElementById('creator-subs-grid');
  const subsList = document.getElementById('creator-subscribers-list');
  if (!grid) return;

  try {
    const myEmail = user?.email || currentUser?.email || '';
    const sub     = await getCreatorSubscription(myEmail);

    if (sub) {
      window._currentSub = sub;  // stored so edit modal can read it without re-fetching
      const perks = sub.perks ? sub.perks.split(',').map(p => p.trim()).filter(Boolean) : [];
      grid.innerHTML = `
        <div class="cp-tier-card" style="max-width:400px">
          <div class="cp-tier-badge">
            <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            ${escHtml(sub.name || 'Subscription')}
          </div>
          <div class="cp-tier-price">
            <span class="cp-tier-currency">₱</span>${sub.price || 0}<span class="cp-tier-period">/mo</span>
          </div>
          <p class="cp-tier-desc">${escHtml(sub.description || 'Access to exclusive study content.')}</p>
          ${perks.length ? `<ul class="cp-tier-perks">${perks.map(pk => `
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
              ${escHtml(pk)}
            </li>`).join('')}</ul>` : ''}
          <div class="cp-tier-actions">
            <button class="cp-btn-secondary" onclick="openEditSubscriptionModal(window._currentSub)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
              Edit
            </button>
            <button class="cp-btn-secondary" onclick="shareTierToFeed('${escHtml(sub.id)}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              Share to Feed
            </button>
            <button class="cp-btn-secondary cp-btn-grant"
                    onclick="openGrantAccessModal('${escHtml(sub.id)}','${escHtml(sub.name||'Subscription')}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
              Grant Free Access
            </button>
            <button class="cp-btn-secondary" style="border-color:#ef4444;color:#ef4444"
                    onclick="deleteCreatorSubscription('${escHtml(sub.id)}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              Delete Subscription
            </button>
          </div>
        </div>`;
    } else {
      grid.innerHTML = `
        <div class="creator-empty" style="grid-column:1/-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <p>No subscription set up yet.</p>
          <button class="connect-btn" style="width:auto;padding:9px 20px;margin-top:10px" onclick="openSubscriptionModal()">
            Set Up Subscription
          </button>
        </div>`;
    }

    const [allSubsList, accounts] = await Promise.all([loadUserSubs(), loadAccounts()]);
    const allSubs = allSubsList.filter(s => s.creatorEmail === myEmail);

    if (subsList) {
      const monthlyRevenue = allSubs.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
      subsList.innerHTML = `
        <div class="cs-sub-stats">
          <div class="cs-sub-stat"><div class="cs-sub-stat-val">${allSubs.length}</div><div class="cs-sub-stat-lbl">subscribers</div></div>
          <div class="cs-sub-stat"><div class="cs-sub-stat-val">₱${monthlyRevenue.toLocaleString()}</div><div class="cs-sub-stat-lbl">monthly</div></div>
        </div>
        ${allSubs.length > 0 ? `
        <div class="cs-sub-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="cs-sub-search-input" type="text" placeholder="Search subscribers…" oninput="filterSubscriberList(this.value)" />
        </div>` : ''}
        <div id="cs-sub-rows">
          ${allSubs.length
            ? allSubs.map(s => _buildSubRow(s, accounts, sub)).join('')
            : `<div class="creator-empty" style="border:none;padding:20px 0">
                 <p style="color:var(--text-light);font-size:.86rem">No active subscribers yet.</p>
               </div>`}
        </div>`;
    }
  } catch (e) {
    console.error('loadCreatorSubscriptions:', e);
    if (grid) grid.innerHTML = `<div class="creator-empty" style="grid-column:1/-1"><p>Could not load subscriptions.</p></div>`;
  }
}


/* ──────────────────────────────────────────────────────────
   SUBSCRIBER LIST HELPERS
──────────────────────────────────────────────────────────── */
/* FIX 2b — third param is now the single sub object (or null),
   not a tiers array. Plan name falls back gracefully. */
function _buildSubRow(s, accounts, sub) {
  const u     = accounts.find(a => a.email === s.userEmail);
  const name  = u ? u.name : s.userEmail.split('@')[0];
  const init  = (name || '?')[0].toUpperCase();
  const color = u?.avatarColor || 'var(--purple-bright)';
  const since = s.since
    ? new Date(s.since).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  return `
    <div class="cs-sub-row" data-name="${escHtml((name + ' ' + s.userEmail).toLowerCase())}">
      <div class="cp-sub-avatar" style="background:${color}">${escHtml(init)}</div>
      <div class="cs-sub-info">
        <div class="cp-sub-name">${escHtml(name)}</div>
        <div class="cp-sub-email">${escHtml(s.userEmail || '')}</div>
      </div>
      <span class="cp-sub-tier-chip">${escHtml(sub?.name || 'Standard')}</span>
      <span class="cp-sub-since">${since}</span>
      <button class="cs-sub-msg-btn" title="Message ${escHtml(name)}"
        onclick="if(typeof openMessagesWith==='function') openMessagesWith('${escHtml(s.userEmail)}')">
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

/* ── Create Subscription Modal ──────────────────────────────
   Edit removed. Creators delete and recreate instead.
   openSubscriptionModal() is now create-only — always blank fields. */
function openSubscriptionModal() {
  // Remove any stale modal and rebuild fresh each time
  const stale = document.getElementById('creator-tier-modal');
  if (stale) stale.remove();

  const modal = document.createElement('div');
  modal.id = 'creator-tier-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box creator-tier-modal-box" onclick="event.stopPropagation()">
      <h3 class="modal-title">Set Up Subscription</h3>
      <div class="creator-field">
        <label>Subscription Name</label>
        <input type="text" id="tm-name" placeholder="e.g. Study Pass, Premium, Pro" />
      </div>
      <div class="creator-field">
        <label>Monthly Price (₱)</label>
        <input type="number" id="tm-price" placeholder="e.g. 99" min="0" />
      </div>
      <div class="creator-field">
        <label>Description</label>
        <textarea id="tm-desc" rows="3" placeholder="What do subscribers get? e.g. Access to all my notes and weekly quiz drops…"></textarea>
      </div>
      <div class="creator-field">
        <label>Perks (comma-separated)</label>
        <input type="text" id="tm-perks" placeholder="e.g. All study notes, Weekly quizzes, Discord access" />
      </div>
      <div id="tm-error" class="login-error" style="display:none"></div>
      <div class="modal-actions">
        <button class="modal-cancel" onclick="closeTierModal()">Cancel</button>
        <button class="modal-confirm" style="background:var(--purple-bright);color:#fff;border-color:var(--purple-bright)"
                onclick="saveTier()">Create</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) closeTierModal(); });
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));
}

function closeTierModal() {
  const m = document.getElementById('creator-tier-modal');
  if (!m) return;
  // Animate out then fully remove so no stale element lingers in the DOM.
  // openSubscriptionModal rebuilds fresh every time — so we must fully remove here.
  m.classList.remove('open');
  setTimeout(() => m.remove(), 220);  // matches CSS transition duration
}

/* saveTier — create only. Always generates a fresh id.
   saveCreatorSubscription cleans up any old rows automatically. */
async function saveTier() {
  const user    = window._creatorUser || window._currentUser || currentUser;
  const myEmail = user?.email || currentUser?.email || '';

  // Capture DOM refs immediately — before any async work that could
  // cause the modal to be removed mid-flight (backdrop click, etc.)
  const nameEl  = document.getElementById('tm-name');
  const priceEl = document.getElementById('tm-price');
  const descEl  = document.getElementById('tm-desc');
  const errEl   = document.getElementById('tm-error');
  const saveBtn = document.querySelector('#creator-tier-modal .modal-confirm');

  const name  = (nameEl?.value  || '').trim();
  const price = parseFloat(priceEl?.value || '0') || 0;
  const desc  = (descEl?.value  || '').trim();
  const perks = (window._tmEditPerks || []).join(', ');

  // Guard: must be logged in
  if (!myEmail) {
    if (errEl) { errEl.textContent = 'You must be logged in to create a subscription.'; errEl.style.display = 'block'; }
    return;
  }

  if (!name) {
    if (errEl) { errEl.textContent = 'Please enter a subscription name.'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Creating…'; }

  try {
    await saveCreatorSubscription({
      id:           'tier_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      creatorEmail: myEmail,
      name,
      description:  desc,
      perks,
      price,
      createdAt:    Date.now(),
    });

    closeTierModal();
    showToast('✓ Subscription created!');
    await loadCreatorSubscriptions(user);
  } catch (e) {
    console.error('saveTier:', e);
    // errEl may be detached if modal was closed — show toast as fallback
    if (errEl && document.contains(errEl)) {
      errEl.textContent = 'Could not create subscription. Please try again.';
      errEl.style.display = 'block';
    } else {
      showToast('Could not create subscription. Please try again.');
    }
  } finally {
    // Only re-enable if still attached to the DOM
    if (saveBtn && document.contains(saveBtn)) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Create';
    }
  }
}

/* editTier — stub kept for any stale call-sites. */
function editTier(id) { console.warn('editTier: use openEditSubscriptionModal instead.'); }

function openEditSubscriptionModal(sub) {
  if (!sub) { showToast('Could not load subscription data.'); return; }

  // Normalise perks to array
  let perksArr = [];
  if (Array.isArray(sub.perks))        perksArr = sub.perks.filter(Boolean);
  else if (typeof sub.perks === 'string') perksArr = sub.perks.split(',').map(p => p.trim()).filter(Boolean);

  // Store editable perks in memory so add/remove work without re-opening
  window._tmEditPerks = [...perksArr];

  const stale = document.getElementById('creator-tier-modal');
  if (stale) stale.remove();

  const subsCount = document.getElementById('creator-subscribers-list')
    ? document.getElementById('creator-subscribers-list').querySelectorAll('.creator-sub-row').length
    : 0;

  const modal = document.createElement('div');
  modal.id = 'creator-tier-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box creator-tier-modal-box" onclick="event.stopPropagation()" style="overflow:visible">

      <!-- Purple gradient header -->
      <div class="tm-edit-header">
        <div class="tm-edit-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </div>
        <div class="tm-edit-header-info">
          <div class="tm-edit-header-title">Edit Subscription</div>
          <div class="tm-edit-header-sub">${subsCount > 0 ? `${subsCount} active subscriber${subsCount !== 1 ? 's' : ''}` : 'No active subscribers yet'}</div>
        </div>
        <span class="tm-edit-header-badge">₱${sub.price || 0}/mo</span>
      </div>

      <!-- Fields -->
      <div class="creator-field" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label>Plan Name</label>
          <input type="text" id="tm-name" placeholder="e.g. Study Pass, Premium"
                 value="${escHtml(sub.name || '')}" />
        </div>
        <div>
          <label>Monthly Price (₱)</label>
          <input type="number" id="tm-price" placeholder="e.g. 99" min="0"
                 value="${escHtml(String(sub.price || 0))}" />
        </div>
      </div>
      <div class="creator-field">
        <label>Description</label>
        <textarea id="tm-desc" rows="3"
                  placeholder="What do subscribers get?">${escHtml(sub.description || '')}</textarea>
      </div>

      <!-- Perks section -->
      <div class="tm-perks-section">
        <div class="tm-perks-section-label">
          Perks
          <span class="tm-perks-section-hint">shown on your profile &amp; feed posts</span>
        </div>
        <div class="tm-perk-list" id="tm-perk-list">
          ${_tmBuildPerkRows(window._tmEditPerks)}
        </div>
        <div class="tm-perk-add-row">
          <input type="text" id="tm-perk-input" class="tm-perk-add-input"
                 placeholder="Add a perk…"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();tmAddPerk();}" />
          <button class="tm-perk-add-btn" onclick="tmAddPerk()">+ Add</button>
        </div>
      </div>

      <div id="tm-error" class="login-error" style="display:none"></div>

      <div class="modal-actions">
        <span class="tm-edit-footer-note" id="tm-footer-note">${subsCount > 0 ? `${subsCount} subscriber${subsCount !== 1 ? 's' : ''} will see these changes` : ''}</span>
        <button class="modal-cancel" onclick="closeTierModal()">Cancel</button>
        <button class="modal-confirm"
                style="background:var(--purple-bright);color:#fff;border-color:var(--purple-bright)"
                onclick="updateTier('${escHtml(sub.id)}')">Save Changes</button>
      </div>
    </div>`;

  modal.addEventListener('click', e => { if (e.target === modal) closeTierModal(); });
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));
}

/* ── Build perk row HTML from array ── */
function _tmBuildPerkRows(perks) {
  if (!perks || !perks.length) {
    return `<div class="tm-perk-empty" id="tm-perk-empty">No perks added yet.</div>`;
  }
  return perks.map((pk, i) => `
    <div class="tm-perk-row" id="tm-perk-row-${i}">
      <svg class="perk-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      <span>${escHtml(pk)}</span>
      <button class="tm-perk-del" onclick="tmRemovePerk(${i})" title="Remove perk">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
}

/* ── Add a perk ── */
function tmAddPerk() {
  const input = document.getElementById('tm-perk-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  if (!window._tmEditPerks) window._tmEditPerks = [];
  window._tmEditPerks.push(val);
  input.value = '';
  const list = document.getElementById('tm-perk-list');
  if (list) list.innerHTML = _tmBuildPerkRows(window._tmEditPerks);
}

/* ── Remove a perk ── */
function tmRemovePerk(idx) {
  if (!window._tmEditPerks) return;
  window._tmEditPerks.splice(idx, 1);
  const list = document.getElementById('tm-perk-list');
  if (list) list.innerHTML = _tmBuildPerkRows(window._tmEditPerks);
}

/* ── updateTier ───────────────────────────────────────────────
   Saves edits to an existing subscription in-place.
   Keeps the same id so no orphan rows are created and existing
   subscribers / feed posts continue to link correctly. */
async function updateTier(subId) {
  const user    = window._creatorUser || window._currentUser || currentUser;
  const myEmail = user?.email || currentUser?.email || '';

  const nameEl  = document.getElementById('tm-name');
  const priceEl = document.getElementById('tm-price');
  const descEl  = document.getElementById('tm-desc');
  const errEl   = document.getElementById('tm-error');
  const saveBtn = document.querySelector('#creator-tier-modal .modal-confirm');

  const name  = (nameEl?.value  || '').trim();
  const price = parseFloat(priceEl?.value || '0') || 0;
  const desc  = (descEl?.value  || '').trim();
  const perks = (window._tmEditPerks || []).join(', ');

  if (!name) {
    if (errEl) { errEl.textContent = 'Please enter a subscription name.'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  try {
    await saveCreatorSubscription({
      id:           subId,
      creatorEmail: myEmail,
      name,
      description:  desc,
      perks,
      price,
      createdAt:    window._currentSub?.createdAt || Date.now(),
    });

    // Keep the cached object in sync so a second edit without re-navigation works
    if (window._currentSub) {
      window._currentSub.name        = name;
      window._currentSub.price       = price;
      window._currentSub.description = desc;
      window._currentSub.perks       = perks;
    }

    closeTierModal();
    showToast('✓ Subscription updated!');
    await loadCreatorSubscriptions(user);
  } catch (e) {
    console.error('updateTier:', e);
    if (errEl && document.contains(errEl)) {
      errEl.textContent = 'Could not save changes. Please try again.';
      errEl.style.display = 'block';
    } else {
      showToast('Could not save changes. Please try again.');
    }
  } finally {
    if (saveBtn && document.contains(saveBtn)) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  }
}

/* deleteCreatorSubscription — confirms then hard-deletes the row from Supabase.
   After deletion the creator can set up a fresh subscription via the empty state. */
async function deleteCreatorSubscription(subId) {
  const user = window._creatorUser || window._currentUser || currentUser;

  // Inline confirm — simple and no extra modal needed
  if (!confirm('Delete your subscription? This will remove it for all new visitors. Current subscribers are not affected.')) return;

  try {
    const { error } = await sb.from('subscription_tiers').delete().eq('id', subId);
    if (error) throw error;
    showToast('Subscription deleted.');
    await loadCreatorSubscriptions(user);
  } catch (e) {
    console.error('deleteCreatorSubscription:', e);
    showToast('Could not delete subscription. Please try again.');
  }
}

/* ══════════════════════════════════════════════════════════
   SHARED QUIZ PLAYER  (previewQuiz + launchQuizPlayer)
   Features: start screen · timer · score breakdown · XP/streak
══════════════════════════════════════════════════════════ */

function _buildQuizPlayer(quiz, isOwner, modalId) {
  const rawQs = Array.isArray(quiz.questions) ? quiz.questions : [];
  if (!rawQs.length) { showToast('This quiz has no questions yet.'); return; }

  const OLD = document.getElementById(modalId);
  if (OLD) OLD.remove();
  const overlay = document.createElement('div');
  overlay.id = modalId;
  overlay.className = 'modal-overlay open';
  overlay.style.cssText = 'align-items:center;justify-content:center;padding:20px;';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  /* ── Shared style tokens ── */
  const S = {
    box:     'max-width:520px;width:100%;text-align:left;padding:0;overflow:hidden;border-radius:20px;background:var(--bg-content);max-height:90vh;overflow-y:auto;',
    hdr:     'background:linear-gradient(135deg,var(--navy-dark),var(--navy-base));padding:20px 24px 16px;position:sticky;top:0;z-index:1;',
    tf:      "font-family:'Syne','Trebuchet MS',system-ui;",
    body:    'padding:22px 24px 0;',
    foot:    'padding:14px 24px 22px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;',
    btnP:    'padding:9px 20px;border-radius:10px;border:none;background:var(--brand-accent);color:#071d2e;font-family:\'Syne\',system-ui;font-size:.85rem;font-weight:700;cursor:pointer;transition:background .15s;',
    btnG:    'padding:9px 20px;border-radius:10px;border:1.5px solid var(--border-panel);background:transparent;color:var(--brand-base);font-family:\'Syne\',system-ui;font-size:.85rem;font-weight:700;cursor:pointer;',
    btnD:    'padding:9px 20px;border-radius:10px;border:none;background:var(--accent);color:var(--text-light);font-family:\'Syne\',system-ui;font-size:.85rem;font-weight:700;cursor:default;',
  };

  /* ── Settings state ── */
  let randomOn  = true;
  let timerMode = 'per';   // 'none' | 'per' | 'total'
  let timerSecs = 30;      // per-question seconds
  let totalSecs = 300;     // whole-quiz seconds (5 min default)

  /* ── Quiz state ── */
  let qs       = rawQs;
  let started  = false;
  let timerInt = null;
  let timeLeft = 0;

  const state = {
    idx:        0,
    answers:    [],
    submitted:  [],
    ordOrders:  {},
    fitbValues: {},
    timeSpent:  [],   // seconds per question
  };

  /* ── Helpers ── */
  const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

  function escQ(s) { return escHtml(String(s||'')); }

  function typePill(type) {
    const map = {
      multiple_choice:{ l:'Multiple choice', c:'#143352', bg:'#e8f0f7' },
      true_false:     { l:'True / False',     c:'#1d4ed8', bg:'#eff6ff' },
      fill_blank:     { l:'Fill in the blank',c:'#065f46', bg:'#f0fdf4' },
      ordering:       { l:'Ordering',         c:'#92400e', bg:'#fffbeb' },
      image_based:    { l:'Image-based',      c:'#9d174d', bg:'#fdf2f8' },
    };
    const t = map[type] || { l:type, c:'#143352', bg:'#e8f0f7' };
    return `<span style="padding:2px 9px;border-radius:20px;font-size:.7rem;font-weight:700;background:${t.bg};color:${t.c};">${t.l}</span>`;
  }

  function typeBadges() {
    const counts = {};
    rawQs.forEach(q => { const t=q.type||'multiple_choice'; counts[t]=(counts[t]||0)+1; });
    const labels = { multiple_choice:'Multiple choice', true_false:'True / False', fill_blank:'Fill in blank', ordering:'Ordering', image_based:'Image-based' };
    return Object.entries(counts).map(([t,n]) =>
      `<div style="padding:4px 11px;background:var(--bg-panel);border:1px solid var(--border-card);border-radius:20px;font-size:.75rem;color:var(--text-sub);">${n} ${labels[t]||t}</div>`
    ).join('');
  }

  function fmtTime(s) {
    const m = Math.floor(s/60), sec = s%60;
    return `${m}:${String(sec).padStart(2,'0')}`;
  }

  function stopTimer() {
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
  }

  function calcScore() {
    const LETTERS = ['A','B','C','D','E'];
    let score = 0;
    const results = qs.map((q, i) => {
      const t   = q.type || 'multiple_choice';
      const ans = state.answers[i];
      const ord = state.ordOrders[i];
      let correct = false;
      let correctLabel = '';
      let yourLabel    = '';

      if (t === 'multiple_choice' || t === 'image_based') {
        const ci = LETTERS.indexOf((q.answer||'A').toUpperCase());
        correct  = ans === ci;
        correctLabel = (q.options||[])[ci] || q.answer;
        yourLabel    = ans !== null && ans !== undefined ? ((q.options||[])[ans] || '—') : '(skipped)';
      } else if (t === 'true_false') {
        correct      = String(ans) === String(q.answer);
        correctLabel = String(q.answer).charAt(0).toUpperCase() + String(q.answer).slice(1);
        yourLabel    = ans ? (String(ans).charAt(0).toUpperCase() + String(ans).slice(1)) : '(skipped)';
      } else if (t === 'fill_blank') {
        correct      = (q.keywords||[]).some(kw => kw.trim().toLowerCase() === String(ans||'').trim().toLowerCase());
        correctLabel = (q.keywords||[]).join(', ');
        yourLabel    = String(ans||'') || '(skipped)';
      } else if (t === 'ordering') {
        correct      = JSON.stringify(ord||[]) === JSON.stringify(q.items||[]);
        correctLabel = (q.items||[]).join(' → ');
        yourLabel    = (ord||[]).join(' → ') || '(skipped)';
      }

      if (correct) score++;
      return { q, t, correct, correctLabel, yourLabel };
    });
    return { score, results };
  }

  /* ═══════════════════════════════════════════
     START SCREEN
  ═══════════════════════════════════════════ */
  function renderStart() {
    stopTimer();
    const timerOptLabel = timerMode === 'none' ? 'No timer'
      : timerMode === 'per'   ? `${timerSecs}s / question`
      : fmtTime(totalSecs) + ' total';

    overlay.innerHTML = `
      <div style="${S.box}" onclick="event.stopPropagation()">
        <div style="${S.hdr}">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="${S.tf}font-size:.95rem;font-weight:700;color:#fff;">🧠 ${escQ(quiz.title||'Quiz')}</span>
            <button onclick="document.getElementById('${modalId}').remove()" style="background:rgba(255,255,255,.18);border:none;color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:.78rem;">✕ Close</button>
          </div>
        </div>
        <div style="padding:26px 24px;text-align:center;">
          <div style="font-size:2rem;margin-bottom:10px;">🧠</div>
          <div style="${S.tf}font-size:1.1rem;font-weight:800;color:var(--text-primary);margin-bottom:6px;">${escQ(quiz.title||'Quiz')}</div>
          <div style="font-size:.82rem;color:var(--text-light);margin-bottom:16px;">
            <span>${rawQs.length} question${rawQs.length!==1?'s':''}</span>
            ${quiz.subject?`<span style="margin:0 6px;">·</span><span>${escQ(quiz.subject)}</span>`:''}
          </div>
          <div style="display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin-bottom:22px;">
            ${typeBadges()}
          </div>

          <!-- Options grid -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:22px;text-align:left;">

            <!-- Randomize -->
            <div style="background:var(--bg-panel);border:1px solid var(--border-card);border-radius:12px;padding:12px;">
              <div style="font-size:.72rem;color:var(--text-light);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Randomize order</div>
              <div style="display:flex;align-items:center;gap:8px;">
                <button id="${modalId}-rand" onclick="qzpToggleRand()" style="width:40px;height:22px;border-radius:20px;background:${randomOn?'var(--brand-accent)':'var(--border-input)'};border:none;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0;">
                  <div style="width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:3px;left:${randomOn?'21px':'3px'};transition:left .2s;pointer-events:none;"></div>
                </button>
                <span id="${modalId}-rand-lbl" style="font-size:.8rem;font-weight:700;color:${randomOn?'var(--brand-accent)':'var(--text-light)'};">${randomOn?'On':'Off'}</span>
              </div>
            </div>

            <!-- Timer mode -->
            <div style="background:var(--bg-panel);border:1px solid var(--border-card);border-radius:12px;padding:12px;">
              <div style="font-size:.72rem;color:var(--text-light);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Timer mode</div>
              <select id="${modalId}-tmode" onchange="qzpSetTimerMode(this.value)" style="font-size:.8rem;background:var(--input-bg);border:1px solid var(--border-input);border-radius:8px;padding:4px 8px;color:var(--text-primary);width:100%;cursor:pointer;">
                <option value="none" ${timerMode==='none'?'selected':''}>No timer</option>
                <option value="per"  ${timerMode==='per' ?'selected':''}>Per question</option>
                <option value="total"${timerMode==='total'?'selected':''}>Whole quiz</option>
              </select>
            </div>

            <!-- Timer duration -->
            <div id="${modalId}-tdur-card" style="background:var(--bg-panel);border:1px solid var(--border-card);border-radius:12px;padding:12px;${timerMode==='none'?'opacity:.4;pointer-events:none;':''}">
              <div style="font-size:.72rem;color:var(--text-light);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;" id="${modalId}-tdur-lbl">${timerMode==='total'?'Total time':'Time / question'}</div>
              <select id="${modalId}-tdur" onchange="qzpSetTimerDur(this.value)" style="font-size:.8rem;background:var(--input-bg);border:1px solid var(--border-input);border-radius:8px;padding:4px 8px;color:var(--text-primary);width:100%;cursor:pointer;">
                ${timerMode==='total'
                  ? ['120','180','300','600'].map(v=>`<option value="${v}" ${totalSecs==v?'selected':''}>${fmtTime(Number(v))}</option>`).join('')
                  : ['15','30','45','60'].map(v=>`<option value="${v}" ${timerSecs==v?'selected':''}>${v}s</option>`).join('')
                }
              </select>
            </div>

            <!-- Best score chip -->
            <div style="background:var(--bg-panel);border:1px solid var(--border-card);border-radius:12px;padding:12px;">
              <div style="font-size:.72rem;color:var(--text-light);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Your best</div>
              <div style="font-size:.9rem;font-weight:700;color:var(--brand-accent);" id="${modalId}-best">—</div>
            </div>
          </div>

          <button onclick="qzpStart()" style="${S.btnP}padding:12px 40px;font-size:.95rem;">Start Quiz →</button>
        </div>
      </div>`;

    /* load personal best from localStorage */
    try {
      const key  = 'qbest_' + (quiz.id||quiz.title);
      const best = JSON.parse(localStorage.getItem(key)||'null');
      const el   = document.getElementById(modalId+'-best');
      if (el && best) el.textContent = `${best.score}/${best.total} (${best.pct}%)`;
    } catch(e) {}

    window.qzpToggleRand = () => {
      randomOn = !randomOn;
      renderStart();
    };
    window.qzpSetTimerMode = v => { timerMode = v; renderStart(); };
    window.qzpSetTimerDur  = v => {
      if (timerMode === 'total') totalSecs = Number(v);
      else timerSecs = Number(v);
    };
    window.qzpStart = () => {
      qs = randomOn ? shuffle(rawQs) : [...rawQs];
      state.idx       = 0;
      state.answers   = new Array(qs.length).fill(null);
      state.submitted = new Array(qs.length).fill(false);
      state.ordOrders = {};
      state.fitbValues= {};
      state.timeSpent = new Array(qs.length).fill(0);
      qs.forEach((q, i) => {
        if ((q.type||'multiple_choice') === 'ordering' && Array.isArray(q.items))
          state.ordOrders[i] = shuffle(q.items);
      });
      if (randomOn) {
        const LETTERS = ['A','B','C','D','E'];
        qs = qs.map(q => {
          const t = q.type||'multiple_choice';
          if ((t==='multiple_choice'||t==='image_based') && Array.isArray(q.options)) {
            const correctText = q.options[LETTERS.indexOf((q.answer||'A').toUpperCase())];
            const shuffled    = shuffle(q.options);
            const newLetter   = LETTERS[shuffled.indexOf(correctText)];
            return { ...q, options: shuffled, answer: newLetter || q.answer };
          }
          return q;
        });
      }
      started  = true;
      timeLeft = timerMode === 'total' ? totalSecs : timerSecs;
      renderQuestion();
    };
  }

  /* ═══════════════════════════════════════════
     QUESTION SCREEN
  ═══════════════════════════════════════════ */
  function renderQuestion() {
    const q       = qs[state.idx];
    const type    = q.type || 'multiple_choice';
    const total   = qs.length;
    const cur     = state.idx + 1;
    const pct     = Math.round((cur/total)*100);
    const locked  = state.submitted[state.idx];
    const isLast  = state.idx === total - 1;
    const isFirst = state.idx === 0;
    const answered= state.answers.filter(a => a !== null).length;
    const LETTERS = ['A','B','C','D','E'];

    /* ── Timer pill HTML ── */
    function timerPillHTML(secs) {
      if (timerMode === 'none') return `<span style="background:rgba(255,255,255,.22);border-radius:20px;padding:3px 11px;font-size:.7rem;font-weight:600;color:#fff;">${total} questions</span>`;
      const warn = timerMode==='per' ? secs<=10 : secs<=30;
      const crit = timerMode==='per' ? secs<=5  : secs<=10;
      const bg   = crit ? 'rgba(239,68,68,.55)' : warn ? 'rgba(217,119,6,.45)' : 'rgba(255,255,255,.22)';
      const dot  = crit ? `<span style="width:6px;height:6px;border-radius:50%;background:#fff;display:inline-block;animation:qzp-pulse 1s infinite;margin-right:4px;"></span>` : '';
      return `<span id="${modalId}-tpill" style="background:${bg};border-radius:20px;padding:3px 11px;font-size:.72rem;font-weight:700;color:#fff;transition:background .3s;">${dot}<span id="${modalId}-tcnt">${fmtTime(secs)}</span></span>`;
    }

    /* ── Answer HTML per type ── */
    let answerHTML = '';

    if (type === 'multiple_choice' || type === 'image_based') {
      const opts = Array.isArray(q.options) ? q.options : [];
      const chosen = state.answers[state.idx];
      const ci = LETTERS.indexOf((q.answer||'A').toUpperCase());
      if (type==='image_based' && q.imageData)
        answerHTML += `<img src="${q.imageData}" alt="Question diagram" style="width:100%;max-height:200px;object-fit:contain;border-radius:10px;border:1px solid var(--border-card);margin-bottom:14px;" />`;
      answerHTML += `<div style="display:flex;flex-direction:column;gap:9px;">` +
        opts.map((opt, oi) => {
          const L = LETTERS[oi]||String(oi+1);
          const isCh = chosen===oi, isCo = oi===ci;
          let bdr='var(--border-input)',bg='var(--bg-card)',lBg='transparent',lC='var(--brand-base)',lBdr='var(--border-panel)',tC='var(--text-primary)';
          if (locked) {
            if (isCo)     { bdr='#16a34a';bg='#f0fdf4';lBg='#16a34a';lC='#fff';lBdr='#16a34a';tC='#15803d'; }
            else if (isCh){ bdr='#dc2626';bg='#fef2f2';lBg='#dc2626';lC='#fff';lBdr='#dc2626';tC='#dc2626'; }
          } else if (isCh){ bdr='var(--brand-accent)';bg='var(--accent)';lBg='var(--brand-accent)';lC='#071d2e';lBdr='var(--brand-accent)'; }
          const badge = locked&&isCo ? '<span style="margin-left:auto;font-size:.72rem;font-weight:700;color:#16a34a;">✓ Correct</span>'
            : locked&&isCh&&!isCo ? '<span style="margin-left:auto;font-size:.72rem;font-weight:700;color:#dc2626;">✗ Wrong</span>' : '';
          const oc = locked ? '' : `onclick="qzpChooseMC(${oi})"`;
          return `<div ${oc} style="display:flex;align-items:center;gap:12px;border:1.5px solid ${bdr};border-radius:11px;padding:10px 14px;background:${bg};cursor:${locked?'default':'pointer'};transition:border-color .15s,background .15s;">
            <div style="width:27px;height:27px;border-radius:50%;border:1.5px solid ${lBdr};background:${lBg};display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;color:${lC};flex-shrink:0;">${L}</div>
            <span style="font-size:.86rem;color:${tC};line-height:1.4;">${escQ(opt)}</span>${badge}</div>`;
        }).join('') + '</div>';

    } else if (type === 'true_false') {
      const chosen = state.answers[state.idx];
      const correct= String(q.answer);
      ['true','false'].forEach(val => {
        const isCh=chosen===val, isCo=val===correct;
        let bdr='var(--border-input)',bg='var(--bg-card)',tC='var(--text-primary)';
        if (locked) {
          if (isCo)     { bdr='#16a34a';bg='#f0fdf4';tC='#15803d'; }
          else if (isCh){ bdr='#dc2626';bg='#fef2f2';tC='#dc2626'; }
        } else if (isCh) { bdr=val==='true'?'#16a34a':'#dc2626'; bg=val==='true'?'#f0fdf4':'#fef2f2'; tC=val==='true'?'#15803d':'#dc2626'; }
        const badge = locked&&isCo?' ✓':locked&&isCh&&!isCo?' ✗':'';
        const oc = locked?'':` onclick="qzpChooseTF('${val}')"`;
        answerHTML += `<div${oc} style="flex:1;padding:14px;border:1.5px solid ${bdr};border-radius:11px;background:${bg};cursor:${locked?'default':'pointer'};text-align:center;font-size:.9rem;font-weight:700;color:${tC};transition:border-color .15s,background .15s;">${val==='true'?'True':'False'}${badge}</div>`;
      });
      answerHTML = `<div style="display:flex;gap:12px;">${answerHTML}</div>`;

    } else if (type === 'fill_blank') {
      const val    = state.fitbValues[state.idx]||'';
      const cor    = locked && (q.keywords||[]).some(kw => kw.trim().toLowerCase()===val.trim().toLowerCase());
      const istyle = locked ? (cor?'border-color:#16a34a;background:#f0fdf4;':'border-color:#dc2626;background:#fef2f2;') : '';
      const badge  = locked ? (cor
        ? '<div style="margin-top:6px;font-size:.75rem;font-weight:700;color:#16a34a;">✓ Correct!</div>'
        : `<div style="margin-top:6px;font-size:.75rem;font-weight:700;color:#dc2626;">✗ Accepted: ${escQ((q.keywords||[]).join(', '))}</div>`) : '';
      answerHTML = `
        <input id="${modalId}-fitb" type="text" value="${escQ(val)}" ${locked?'readonly':''} oninput="qzpFitbInput(this.value)"
          style="width:100%;padding:11px 14px;border:1.5px solid var(--border-input);border-radius:10px;font-size:.9rem;color:var(--text-primary);background:var(--input-bg);outline:none;${istyle}" placeholder="Type your answer…" />
        <div style="font-size:.72rem;color:var(--text-light);margin-top:5px;">Spelling variations are accepted</div>${badge}`;

    } else if (type === 'ordering') {
      const cur2  = state.ordOrders[state.idx]||(q.items||[]);
      const cor   = locked && JSON.stringify(cur2)===JSON.stringify(q.items||[]);
      answerHTML  = `
        <div style="font-size:.75rem;color:var(--text-light);margin-bottom:10px;">${locked?'':'Drag items into the correct order'}</div>
        <div id="${modalId}-ordlist" style="display:flex;flex-direction:column;gap:8px;">
          ${cur2.map((item,ni) => {
            const iR=locked&&(q.items||[])[ni]===item;
            const bdr=locked?(iR?'#16a34a':'var(--border-card)'):'var(--border-card)';
            const bg =locked?(iR?'#f0fdf4':'var(--bg-card)'):'var(--bg-card)';
            return `<div data-item="${escQ(item)}" draggable="${!locked}" style="display:flex;align-items:center;gap:10px;padding:11px 14px;border:1.5px solid ${bdr};border-radius:11px;background:${bg};cursor:${locked?'default':'grab'};">
              <span style="color:var(--text-light);font-size:.9rem;flex-shrink:0;">${locked?'':'⠿'}</span>
              <div style="width:24px;height:24px;border-radius:50%;background:#fef3c7;color:#92400e;font-size:.72rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ni+1}</div>
              <span style="font-size:.86rem;color:var(--text-primary);">${escQ(item)}</span></div>`;
          }).join('')}
        </div>
        ${locked&&cor?'<div style="margin-top:10px;font-size:.75rem;font-weight:700;color:#16a34a;">✓ Perfect order!</div>'
          :locked?`<div style="margin-top:10px;font-size:.75rem;font-weight:700;color:#dc2626;">✗ Correct: ${escQ((q.items||[]).join(' → '))}</div>`:''}`;
    }

    /* ── Action button ── */
    let canConfirm = false;
    if (!locked) {
      if (type==='fill_blank')  canConfirm = !!(state.fitbValues[state.idx]||'').trim();
      else if (type==='ordering') canConfirm = true;
      else canConfirm = state.answers[state.idx] !== null;
    }
    const actionBtn = !locked&&canConfirm
      ? `<button onclick="qzpConfirm()" style="${S.btnP}">Confirm</button>`
      : !locked
      ? `<button disabled style="${S.btnD}">Confirm</button>`
      : !isLast
      ? `<button onclick="qzpNext()" style="${S.btnP}">Next →</button>`
      : `<button onclick="qzpFinish()" style="${S.btnP}">See Results</button>`;

    overlay.innerHTML = `
      <div style="${S.box}" onclick="event.stopPropagation()">
        <style>@keyframes qzp-pulse{0%,100%{opacity:1}50%{opacity:.25}}</style>
        <div style="${S.hdr}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="${S.tf}font-size:.95rem;font-weight:700;color:#fff;">🧠 ${escQ(quiz.title||'Quiz')}</span>
            ${timerPillHTML(timeLeft)}
          </div>
          <div style="background:rgba(255,255,255,.25);border-radius:4px;height:5px;">
            <div style="background:#fff;border-radius:4px;height:5px;width:${pct}%;transition:width .3s ease;"></div>
          </div>
          <div style="font-size:.7rem;color:rgba(255,255,255,.85);margin-top:6px;">Question ${cur} of ${total}</div>
        </div>
        <div style="${S.body}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="font-size:.72rem;font-weight:700;color:var(--brand-accent);text-transform:uppercase;letter-spacing:.06em;">Question ${cur}</div>
            ${typePill(type)}
          </div>
          <div style="${S.tf}font-size:1rem;font-weight:700;color:var(--text-primary);line-height:1.45;margin-bottom:18px;">${escQ(q.question||'')}</div>
          <div style="margin-bottom:20px;">${answerHTML}</div>
        </div>
        <div style="${S.foot}">
          <button onclick="qzpBack()" style="${S.btnG}${isFirst?'opacity:.35;pointer-events:none;':''}">← Back</button>
          <span style="font-size:.78rem;color:var(--text-light);">${answered} of ${total} answered</span>
          ${actionBtn}
        </div>
      </div>`;

    /* ── Wire handlers ── */
    window.qzpChooseMC  = oi  => { if (!state.submitted[state.idx]){ state.answers[state.idx]=oi; renderQuestion(); } };
    window.qzpChooseTF  = val => { if (!state.submitted[state.idx]){ state.answers[state.idx]=val; renderQuestion(); } };
    window.qzpFitbInput = val => { state.fitbValues[state.idx]=val; };
    window.qzpConfirm   = () => {
      const q2   = qs[state.idx];
      const t2   = q2.type||'multiple_choice';
      if (t2==='fill_blank') {
        state.answers[state.idx] = (state.fitbValues[state.idx]||'').trim();
      } else if (t2==='ordering') {
        const ol = document.getElementById(modalId+'-ordlist');
        if (ol) {
          const items = [...ol.querySelectorAll('[data-item]')].map(el=>el.dataset.item);
          state.ordOrders[state.idx] = items;
          state.answers[state.idx]   = items;
        }
      }
      state.submitted[state.idx] = true;
      stopTimer();
      if (timerMode==='per') timeLeft = timerSecs;
      renderQuestion();
    };
    window.qzpNext   = () => { if (state.idx<qs.length-1){ state.idx++; if (timerMode==='per') timeLeft=timerSecs; renderQuestion(); } };
    window.qzpBack   = () => {
      if (state.idx===0){ started=false; stopTimer(); timeLeft=timerMode==='total'?totalSecs:timerSecs; renderStart(); return; }
      state.idx--; renderQuestion();
    };
    window.qzpFinish = async () => { stopTimer(); await renderResults(); };

    /* ── Ordering drag ── */
    if (type==='ordering' && !locked) {
      setTimeout(() => {
        const ol = document.getElementById(modalId+'-ordlist');
        if (!ol) return;
        let dragged=null;
        ol.querySelectorAll('[data-item]').forEach(item => {
          item.addEventListener('dragstart',e=>{ dragged=item; item.style.opacity='.4'; });
          item.addEventListener('dragend',  e=>{ dragged=null; item.style.opacity=''; });
          item.addEventListener('dragover', e=>e.preventDefault());
          item.addEventListener('drop', e => {
            e.preventDefault();
            if (dragged && dragged!==item) {
              const els=[...ol.querySelectorAll('[data-item]')];
              const fi=els.indexOf(dragged), ti=els.indexOf(item);
              if (fi<ti) ol.insertBefore(dragged,item.nextSibling);
              else       ol.insertBefore(dragged,item);
              ol.querySelectorAll('[data-item]').forEach((el,ni)=>{ const n=el.querySelectorAll('div')[1]; if(n) n.textContent=ni+1; });
            }
          });
        });
      }, 0);
    }
    if (type==='fill_blank' && !locked)
      setTimeout(()=>document.getElementById(modalId+'-fitb')?.focus(), 50);

    /* ── Start / update countdown ── */
    stopTimer();
    if (timerMode!=='none' && !locked) {
      timerInt = setInterval(() => {
        timeLeft = Math.max(0, timeLeft-1);
        /* update pill in place without re-rendering */
        const cnt  = document.getElementById(modalId+'-tcnt');
        const pill = document.getElementById(modalId+'-tpill');
        if (cnt) cnt.textContent = fmtTime(timeLeft);
        if (pill) {
          const warn = timerMode==='per'?timeLeft<=10:timeLeft<=30;
          const crit = timerMode==='per'?timeLeft<=5 :timeLeft<=10;
          pill.style.background = crit?'rgba(239,68,68,.55)':warn?'rgba(217,119,6,.45)':'rgba(255,255,255,.22)';
        }
        if (timeLeft===0) {
          stopTimer();
          if (timerMode==='per') {
            /* auto-submit current question as wrong */
            state.submitted[state.idx] = true;
            timeLeft = timerSecs;
            renderQuestion();
          } else {
            /* whole-quiz timer expired → go straight to results */
            renderResults();
          }
        }
      }, 1000);
    }
  }

  /* ═══════════════════════════════════════════
     RESULTS — score ring + breakdown
  ═══════════════════════════════════════════ */
  async function renderResults() {
    stopTimer();
    const { score, results } = calcScore();
    const total = qs.length;
    const sp    = Math.round((score/total)*100);

    /* ── XP calculation ── */
    const xpEarned = Math.round(score * 20 + (sp===100?50:0));

    /* ── Save personal best + XP/streak to localStorage ── */
    if (!isOwner) {
      try {
        const bkey = 'qbest_' + (quiz.id||quiz.title);
        const old  = JSON.parse(localStorage.getItem(bkey)||'null');
        if (!old || sp > old.pct)
          localStorage.setItem(bkey, JSON.stringify({ score, total, pct:sp }));

        /* XP */
        const xpKey   = 'studybuddy_xp';
        const curXP   = parseInt(localStorage.getItem(xpKey)||'0',10);
        localStorage.setItem(xpKey, String(curXP + xpEarned));

        /* Streak — date-based */
        const streakKey  = 'studybuddy_streak';
        const lastKey    = 'studybuddy_streak_last';
        const today      = new Date().toDateString();
        const last       = localStorage.getItem(lastKey)||'';
        const yesterday  = new Date(Date.now()-86400000).toDateString();
        let streak = parseInt(localStorage.getItem(streakKey)||'0',10);
        if (last!==today) {
          streak = (last===yesterday) ? streak+1 : 1;
          localStorage.setItem(streakKey, String(streak));
          localStorage.setItem(lastKey, today);
        }

        /* attempts */
        const allQ   = await loadQuizzes();
        const target = allQ.find(q3=>q3.id===quiz.id);
        if (target){ target.attempts=(target.attempts||0)+1; await saveQuizzes(allQ); }
      } catch(e){}
    }

    const msg = sp>=80 ? "Excellent work! You've mastered this material."
      : sp>=50 ? "Good effort! Review the questions you missed and try again."
      : "Keep studying! Go through the material and give it another shot.";

    /* ── Score ring SVG ── */
    const r=36, circ=2*Math.PI*r;
    const dash=circ, offset=circ-(sp/100)*circ;

    /* ── Breakdown rows ── */
    const breakdownHTML = results.map((res, i) => {
      const icon  = res.correct ? '✓' : '✗';
      const icoBg = res.correct ? '#f0fdf4' : '#fef2f2';
      const icoC  = res.correct ? '#16a34a' : '#dc2626';
      const yourC = res.correct ? '#16a34a' : '#dc2626';
      const yourBg= res.correct ? '#f0fdf4' : '#fef2f2';
      const typeLbl = typePill(res.t);
      return `
        <div style="border:0.5px solid var(--border-card);border-radius:12px;overflow:hidden;margin-bottom:8px;">
          <div onclick="qzpToggleBi(${i})" style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;background:var(--bg-card);">
            <div style="width:22px;height:22px;border-radius:50%;background:${icoBg};color:${icoC};font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${icon}</div>
            <div style="font-size:13px;color:var(--text-primary);flex:1;line-height:1.3;">${escQ(res.q.question)}</div>
            <span style="font-size:11px;color:var(--text-light);" id="${modalId}-bi-arr-${i}">▾</span>
          </div>
          <div id="${modalId}-bi-${i}" style="display:none;padding:10px 12px 12px;border-top:0.5px solid var(--border-card);background:var(--bg-panel);">
            ${typeLbl}
            <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
              <div style="display:flex;gap:8px;align-items:flex-start;font-size:12px;">
                <span style="padding:2px 9px;border-radius:20px;background:${yourBg};color:${yourC};font-size:11px;font-weight:700;flex-shrink:0;">Your answer</span>
                <span style="color:${yourC};">${escQ(res.yourLabel)}</span>
              </div>
              ${!res.correct ? `<div style="display:flex;gap:8px;align-items:flex-start;font-size:12px;">
                <span style="padding:2px 9px;border-radius:20px;background:#f0fdf4;color:#16a34a;font-size:11px;font-weight:700;flex-shrink:0;">Correct</span>
                <span style="color:#16a34a;">${escQ(res.correctLabel)}</span>
              </div>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    overlay.innerHTML = `
      <div style="${S.box}" onclick="event.stopPropagation()">
        <!-- Score header -->
        <div style="background:linear-gradient(135deg,var(--navy-dark),var(--navy-base));padding:26px 24px 22px;text-align:center;">
          <div style="position:relative;width:90px;height:90px;margin:0 auto 14px;">
            <svg width="90" height="90" viewBox="0 0 90 90" style="transform:rotate(-90deg)">
              <circle cx="45" cy="45" r="${r}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="9"/>
              <circle cx="45" cy="45" r="${r}" fill="none" stroke="#fff" stroke-width="9"
                stroke-dasharray="${dash.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
                stroke-linecap="round" style="transition:stroke-dashoffset .6s ease;"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;${S.tf}font-size:18px;font-weight:800;color:#fff;">${sp}%</div>
          </div>
          <div style="font-size:14px;color:rgba(255,255,255,.85);margin-bottom:4px;">${score} / ${total} correct</div>
          <div style="font-size:12px;color:rgba(255,255,255,.7);margin-bottom:12px;">${msg}</div>
          <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
            <div style="background:rgba(255,255,255,.18);border-radius:20px;padding:5px 14px;font-size:12px;font-weight:600;color:#fff;">+${xpEarned} XP earned</div>
            ${score===total?'<div style="background:rgba(255,255,255,.18);border-radius:20px;padding:5px 14px;font-size:12px;font-weight:600;color:#fff;">🔥 Perfect score!</div>':''}
          </div>
        </div>

        <!-- Quick stats bar -->
        <div style="display:flex;border-bottom:0.5px solid var(--border-card);">
          <div style="flex:1;padding:14px 10px;text-align:center;border-right:0.5px solid var(--border-card);">
            <div style="${S.tf}font-size:18px;font-weight:800;color:#16a34a;">${score}</div>
            <div style="font-size:11px;color:var(--text-light);margin-top:2px;">Correct</div>
          </div>
          <div style="flex:1;padding:14px 10px;text-align:center;border-right:0.5px solid var(--border-card);">
            <div style="${S.tf}font-size:18px;font-weight:800;color:#dc2626;">${total-score}</div>
            <div style="font-size:11px;color:var(--text-light);margin-top:2px;">Wrong</div>
          </div>
          <div style="flex:1;padding:14px 10px;text-align:center;">
            <div style="${S.tf}font-size:18px;font-weight:800;color:var(--brand-accent);" id="${modalId}-streak-val">—</div>
            <div style="font-size:11px;color:var(--text-light);margin-top:2px;">Streak 🔥</div>
          </div>
        </div>

        <!-- Breakdown -->
        <div style="padding:16px 20px 4px;">
          <div style="font-size:.72rem;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">Question breakdown</div>
          ${breakdownHTML}
        </div>

        <!-- Footer -->
        <div style="${S.foot}">
          <button onclick="document.getElementById('${modalId}').remove()" style="${S.btnG}">Close</button>
          <button onclick="qzpRetry()" style="${S.btnP}">Retake shuffled</button>
        </div>
      </div>`;

    /* load streak from localStorage */
    try {
      const sv = document.getElementById(modalId+'-streak-val');
      if (sv) sv.textContent = localStorage.getItem('studybuddy_streak')||'1';
    } catch(e){}

    window.qzpToggleBi = i => {
      const body = document.getElementById(modalId+'-bi-'+i);
      const arr  = document.getElementById(modalId+'-bi-arr-'+i);
      if (!body) return;
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      if (arr) arr.textContent = open ? '▾' : '▴';
    };
    window.qzpRetry = () => { started=false; timeLeft=timerMode==='total'?totalSecs:timerSecs; renderStart(); };
  }

  renderStart();
}

async function previewQuiz(id) {
  const quizzes = await loadQuizzes();
  const quiz = quizzes.find(q => q.id === id);
  if (!quiz) { showToast('Quiz not found.'); return; }
  _buildQuizPlayer(quiz, true, 'quiz-preview-modal');
}

function launchQuizPlayer(quiz, isOwner) {
  _buildQuizPlayer(quiz, isOwner, 'quiz-player-modal');
}

/* ══════════════════════════════════════════════════════════
   QUIZ TAB
══════════════════════════════════════════════════════════ */

async function loadCreatorQuizzes(user) {
  const list = document.getElementById('creator-quizzes-list');
  if (!list) return;

  try {
    const quizzes = await getMyQuizzes();

    list.innerHTML = quizzes && quizzes.length
      ? `<div class="cp-quiz-list">${quizzes.map(q => {
          const qs       = Array.isArray(q.questions) ? q.questions : [];
          const qCount   = qs.length;
          const attempts = q.attempts || 0;

          // ── Access badge (3 states) ──
          let accessBadge;
          if (q.access === 'subscription') {
            accessBadge = `<span class="cp-quiz-tag cp-tag-paid">🔒 Subscribers</span>`;
          } else if (q.access === 'priced') {
            accessBadge = `<span class="cp-quiz-tag cp-tag-priced">💰 ₱${q.price || 0}</span>`;
          } else {
            accessBadge = `<span class="cp-quiz-tag cp-tag-free">🌐 Free</span>`;
          }

          return `<div class="cp-quiz-card">
            <div class="cp-quiz-left">
              <div class="cp-quiz-icon">🧠</div>
              <div class="cp-quiz-info">
                <h4 class="cp-quiz-title">${escHtml(q.title || 'Untitled Quiz')}</h4>
                <div class="cp-quiz-meta">
                  ${q.subject ? `<span class="cp-quiz-tag">${escHtml(q.subject)}</span>` : ''}
                  ${accessBadge}
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
              <button class="cp-btn-secondary" onclick="openQuizEditor('${q.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
              <button class="cp-btn-secondary" onclick="previewQuiz('${q.id}')">Preview</button>
              <button class="cp-btn-secondary" onclick="shareQuizToFeed('${q.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                Share to Feed
              </button>
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
  // Reset fields
  const titleEl = document.getElementById('qb-title');
  if (titleEl) titleEl.value = '';
  const accessEl = document.getElementById('qb-access');
  if (accessEl) accessEl.value = 'free';
  const priceWrap = document.getElementById('qb-price-wrap');
  if (priceWrap) priceWrap.style.display = 'none';
  const priceEl = document.getElementById('qb-price');
  if (priceEl) priceEl.value = '';
  const qqList = document.getElementById('quiz-questions-list');
  if (qqList) qqList.innerHTML = '';
  // Store that we're creating, not editing
  window._editingQuizId = null;
}

function closeQuizBuilder() {
  const builder = document.getElementById('quiz-builder');
  if (builder) builder.style.display = 'none';
  window._editingQuizId = null;
}

/* Show/hide the price input depending on access type */
function toggleQuizPriceInput(value) {
  const wrap = document.getElementById('qb-price-wrap');
  if (!wrap) return;
  wrap.style.display = value === 'priced' ? 'flex' : 'none';
  if (value !== 'priced') {
    const priceEl = document.getElementById('qb-price');
    if (priceEl) priceEl.value = '';
  }
}

/* ══════════════════════════════════════
   QUIZ EDITOR
   Opens the quiz builder pre-filled with an existing quiz's
   data so the creator can edit questions, answers, title,
   access type and price.
══════════════════════════════════════ */
async function openQuizEditor(quizId) {
  const quizzes = await loadQuizzes();
  const quiz    = quizzes.find(q => q.id === quizId);
  if (!quiz) { showToast('Quiz not found.'); return; }

  // Open the builder panel
  const builder = document.getElementById('quiz-builder');
  if (builder) builder.style.display = '';

  // Mark as editing
  window._editingQuizId = quizId;

  // Pre-fill title
  const titleEl = document.getElementById('qb-title');
  if (titleEl) titleEl.value = quiz.title || '';

  // Pre-fill subject
  const subjectEl = document.getElementById('qb-subject');
  if (subjectEl) subjectEl.value = quiz.subject || '';

  // Pre-fill access + price
  const accessEl = document.getElementById('qb-access');
  if (accessEl) {
    // Normalise legacy 'paid' → 'subscription'
    accessEl.value = quiz.access === 'paid' ? 'subscription' : (quiz.access || 'free');
    toggleQuizPriceInput(accessEl.value);
  }
  const priceEl = document.getElementById('qb-price');
  if (priceEl) priceEl.value = quiz.price > 0 ? quiz.price : '';

  // Re-build question blocks from saved data
  const qqList = document.getElementById('quiz-questions-list');
  if (!qqList) return;
  qqList.innerHTML = '';

  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  questions.forEach((q, i) => {
    const type = q.type || 'multiple_choice';
    const uid  = 'edit_' + Date.now() + '_' + i;
    const idx  = i + 1;

    const TYPE_LABELS = { multiple_choice:'Multiple choice', true_false:'True / False', fill_blank:'Fill in the blank', ordering:'Ordering', image_based:'Image-based' };
    const TYPE_CSS    = { multiple_choice:'mc', true_false:'tf', fill_blank:'fitb', ordering:'ord', image_based:'img' };

    let bodyHTML = '';

    if (type === 'multiple_choice' || type === 'image_based') {
      const imgSection = type === 'image_based' ? `
        <div class="qb-img-drop" id="qb-imgdrop-${uid}" ${q.imageData ? 'style="display:none"' : ''}>
          <input type="file" accept="image/*" onchange="qbHandleImageUpload(this,'${uid}')" />
          <div class="qb-img-drop-icon">🖼</div>
          <div class="qb-img-drop-text">Click or drag to upload image</div>
        </div>
        <div class="qb-img-preview" id="qb-imgprev-${uid}" ${q.imageData ? '' : 'style="display:none"'}>
          <img id="qb-imgel-${uid}" src="${q.imageData||''}" data-b64="${q.imageData||''}" alt="Question image" />
          <button class="qb-img-remove" onclick="qbRemoveImage('${uid}')">Remove</button>
        </div>` : '';
      bodyHTML = `
        ${imgSection}
        <div class="qb-options-grid">
          ${['A','B','C','D'].map((letter, li) => `
            <label class="qb-option-row${q.answer === letter ? ' qb-option-correct' : ''}">
              <input type="radio" name="correct-q${uid}" value="${letter}" class="qb-correct-radio"${q.answer === letter ? ' checked' : ''} />
              <span class="qb-option-letter">${letter}</span>
              <input class="qb-q-input qb-option-input" type="text" placeholder="Option ${letter}…" value="${escHtml((q.options && q.options[li]) || '')}" />
            </label>`).join('')}
        </div>
        <div class="qb-correct-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Click a letter to mark the correct answer
        </div>`;

    } else if (type === 'true_false') {
      const tv = q.answer === 'true', fv = q.answer === 'false';
      bodyHTML = `
        <div class="qb-tf-row">
          <button type="button" class="qb-tf-btn${tv?' qb-tf-true':''}" data-val="true"  onclick="qbSelectTF(this,'${uid}')">True</button>
          <button type="button" class="qb-tf-btn${fv?' qb-tf-false':''}" data-val="false" onclick="qbSelectTF(this,'${uid}')">False</button>
        </div>
        <input type="hidden" class="qb-tf-answer" id="qb-tf-${uid}" value="${escHtml(q.answer||'')}" />
        <div class="qb-correct-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Click True or False to set the correct answer
        </div>`;

    } else if (type === 'fill_blank') {
      const tagHTML = (q.keywords || []).map(kw =>
        `<span class="qb-fitb-tag" data-val="${escHtml(kw)}">${escHtml(kw)} <span class="qb-fitb-tag-x" onclick="this.parentElement.remove()">×</span></span>`
      ).join('');
      bodyHTML = `
        <p class="qb-fitb-hint">Use ___ in your question to mark the blank. Add all accepted keyword answers below.</p>
        <div class="qb-fitb-add-row">
          <input class="qb-q-input" id="qb-fitb-inp-${uid}" type="text" placeholder="Add accepted keyword…" onkeydown="if(event.key==='Enter'){event.preventDefault();qbAddFitbTag('${uid}')}" />
          <button type="button" class="qb-fitb-add-btn" onclick="qbAddFitbTag('${uid}')">Add</button>
        </div>
        <div class="qb-fitb-tags" id="qb-fitb-tags-${uid}">${tagHTML}</div>`;

    } else if (type === 'ordering') {
      const itemsHTML = (q.items || []).map((item, ni) => `
        <div class="qb-ord-item" draggable="true">
          <span class="qb-ord-handle" title="Drag to reorder">⠿</span>
          <div class="qb-ord-num">${ni+1}</div>
          <input class="qb-q-input" style="margin:0;padding:7px 10px" type="text" value="${escHtml(item)}" />
          <button type="button" class="qb-ord-remove" onclick="this.closest('.qb-ord-item').remove();_qbOrdRenumber('${uid}')">×</button>
        </div>`).join('');
      bodyHTML = `
        <p class="qb-fitb-hint">Enter items in the correct order. Students will see them shuffled.</p>
        <div class="qb-ord-list" id="qb-ord-list-${uid}">${itemsHTML}</div>
        <button type="button" class="qb-ord-add-btn" onclick="qbAddOrdItem('${uid}')">+ Add item</button>`;
    }

    const block = document.createElement('div');
    block.className = 'qb-question-block';
    block.dataset.type = type;
    block.dataset.uid  = uid;
    block.innerHTML = `
      <div class="qb-q-header">
        <div class="qb-q-num">Q${idx}</div>
        <span class="qb-type-badge qb-type-badge--${TYPE_CSS[type]}">${TYPE_LABELS[type]}</span>
        <button class="qb-q-remove" onclick="removeQuizQuestion(this)" title="Remove question">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <input class="qb-q-input qb-q-text" type="text" placeholder="Enter your question here…" value="${escHtml(q.question||'')}" />
      ${bodyHTML}
    `;
    qqList.appendChild(block);

    if (type === 'multiple_choice' || type === 'image_based') {
      block.querySelectorAll('.qb-correct-radio').forEach(radio => {
        radio.addEventListener('change', () => {
          block.querySelectorAll('.qb-option-row').forEach(r => r.classList.remove('qb-option-correct'));
          if (radio.checked) radio.closest('.qb-option-row').classList.add('qb-option-correct');
        });
      });
      block.querySelectorAll('.qb-option-letter').forEach(letter => {
        letter.addEventListener('click', () => {
          const row   = letter.closest('.qb-option-row');
          const radio = row.querySelector('.qb-correct-radio');
          if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
        });
      });
    }
    if (type === 'ordering') _qbInitOrdDrag(uid);
  });

  // Scroll builder into view
  builder.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ══════════════════════════════════════════════════════════
   QUIZ IMPORTER
   Parses plain-text multiple-choice questions and injects
   them into the existing #quiz-questions-list using the same
   DOM structure as addQuizQuestion / openQuizEditor.
   Does NOT touch saveQuiz, loadQuizzes, or other quiz types.
══════════════════════════════════════════════════════════ */

/**
 * Parse raw pasted text into an array of question objects.
 * Expected block format (separated by blank lines):
 *   Question text
 *   A. Option A  ← treated as CORRECT answer
 *   B. Option B
 *   C. Option C
 *   D. Option D
 *
 * Returns { questions: [...], errors: [{blockIndex, msg}] }
 */
function _parseImportText(raw) {
  const OPTION_RE = /^([A-Da-d])[.)]\s*(.+)$/;
  const blocks    = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);

  const questions = [];
  const errors    = [];

  blocks.forEach((block, bi) => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);

    // Need at least 5 lines: 1 question + 4 options
    if (lines.length < 2) {
      errors.push({ blockIndex: bi + 1, msg: 'Block too short — needs a question line and answer choices.' });
      return;
    }

    // Separate question lines from option lines
    const optLines   = lines.filter(l => OPTION_RE.test(l));
    const qLines     = lines.filter(l => !OPTION_RE.test(l));

    if (!qLines.length) {
      errors.push({ blockIndex: bi + 1, msg: 'No question text found.' });
      return;
    }
    if (optLines.length < 2) {
      errors.push({ blockIndex: bi + 1, msg: `Only ${optLines.length} answer choice(s) found — need at least 2 (4 recommended).` });
      return;
    }
    if (optLines.length > 4) {
      errors.push({ blockIndex: bi + 1, msg: `${optLines.length} answer choices found — maximum is 4.` });
      return;
    }

    // Parse options — pad to exactly 4 slots
    const LETTERS  = ['A','B','C','D'];
    const parsed   = optLines.map(l => { const m = l.match(OPTION_RE); return m[2].trim(); });
    const options  = [...parsed, ...Array(4 - parsed.length).fill('')].slice(0, 4);

    // First option is correct answer by default
    const answer   = LETTERS[0]; // always 'A' — first listed option

    questions.push({
      type:     'multiple_choice',
      question: qLines.join(' '),
      options,
      answer,
    });
  });

  return { questions, errors };
}

/**
 * Build and inject a question block for an already-parsed question object.
 * Mirrors the logic in openQuizEditor so the DOM is identical to hand-built blocks.
 * Prepends to #quiz-questions-list (newest on top) then re-numbers.
 */
function _renderImportedBlock(q) {
  const list = document.getElementById('quiz-questions-list');
  if (!list) return;

  const uid  = 'imp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const opts = Array.isArray(q.options) ? q.options : ['', '', '', ''];

  const bodyHTML = `
    <div class="qb-options-grid">
      ${['A','B','C','D'].map((letter, li) => `
        <label class="qb-option-row${q.answer === letter ? ' qb-option-correct' : ''}">
          <input type="radio" name="correct-q${uid}" value="${letter}" class="qb-correct-radio"${q.answer === letter ? ' checked' : ''} />
          <span class="qb-option-letter${q.answer === letter ? ' correct' : ''}">${letter}</span>
          <input class="qb-q-input qb-option-input" type="text"
            placeholder="Option ${letter}…"
            value="${escHtml(opts[li] || '')}" />
        </label>`).join('')}
    </div>
    <div class="qb-correct-hint">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Click a letter to mark the correct answer
    </div>`;

  const block = document.createElement('div');
  block.className    = 'qb-question-block';
  block.dataset.type = 'multiple_choice';
  block.dataset.uid  = uid;
  block.innerHTML = `
    <div class="qb-q-header">
      <div class="qb-q-num">Q1</div>
      <span class="qb-type-badge qb-type-badge--mc">Multiple choice</span>
      <button class="qb-q-remove" onclick="removeQuizQuestion(this)" title="Remove question">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <input class="qb-q-input qb-q-text" type="text"
      placeholder="Enter your question here…"
      value="${escHtml(q.question || '')}" />
    ${bodyHTML}`;

  list.prepend(block);

  // Wire radio highlight + letter-click
  block.querySelectorAll('.qb-correct-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      block.querySelectorAll('.qb-option-row').forEach(r => r.classList.remove('qb-option-correct'));
      if (radio.checked) radio.closest('.qb-option-row').classList.add('qb-option-correct');
    });
  });
  block.querySelectorAll('.qb-option-letter').forEach(letter => {
    letter.addEventListener('click', () => {
      const row   = letter.closest('.qb-option-row');
      const radio = row.querySelector('.qb-correct-radio');
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
    });
  });
}

/**
 * Open the importer modal. Live-parses on every keystroke so the preview
 * count updates in real time. On confirm, injects all valid questions and
 * shows a summary toast.
 */
function openQuizImporter() {
  document.getElementById('quiz-importer-modal')?.remove();

  const modal = document.createElement('div');
  modal.id        = 'quiz-importer-modal';
  modal.className = 'modal-overlay open';
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  const PLACEHOLDER = `What is the time complexity of binary search?
A. O(log n)
B. O(n)
C. O(n²)
D. O(1)

A stack data structure follows which order?
A. LIFO — Last-In-First-Out
B. FIFO — First-In-First-Out
C. Random access
D. Priority order`;

  function renderModal(text, imported) {
    const { questions, errors } = _parseImportText(text || '');
    const count   = questions.length;
    const hasText = (text || '').trim().length > 0;

    const previewHTML = !hasText
      ? `<div class="qim-preview qim-preview--idle">Paste your questions above to see a preview.</div>`
      : count === 0 && errors.length > 0
      ? `<div class="qim-preview qim-preview--err">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           No valid questions found. Check the format below.
         </div>`
      : `<div class="qim-preview qim-preview--ok">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="9 11 12 14 22 4"/></svg>
           <strong>${count} question${count !== 1 ? 's' : ''} detected</strong>${errors.length ? ` — ${errors.length} block${errors.length !== 1 ? 's' : ''} skipped` : ', ready to import'}
         </div>`;

    const errListHTML = errors.length
      ? `<div class="qim-err-list">
           ${errors.slice(0, 5).map(e =>
             `<div class="qim-err-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Block ${e.blockIndex}: ${escHtml(e.msg)}
              </div>`).join('')}
           ${errors.length > 5 ? `<div class="qim-err-item qim-err-more">… and ${errors.length - 5} more</div>` : ''}
         </div>`
      : '';

    const importedBanner = imported
      ? `<div class="qim-imported-banner">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="9 11 12 14 22 4"/></svg>
           ${imported} question${imported !== 1 ? 's' : ''} added to your quiz!
         </div>`
      : '';

    modal.innerHTML = `
      <div class="modal-box qim-box" onclick="event.stopPropagation()">

        <!-- Header -->
        <div class="qim-header">
          <div class="qim-header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <div class="qim-header-text">
            <h3 class="qim-title">Import Questions</h3>
            <p class="qim-subtitle">Paste multiple-choice questions in plain text</p>
          </div>
          <button class="gam-close" onclick="document.getElementById('quiz-importer-modal').remove()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        ${importedBanner}

        <!-- Format hint -->
        <div class="qim-format-hint">
          <div class="qim-format-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Expected format — separate questions with a blank line
          </div>
          <div class="qim-format-code">Question text<br>A. Correct answer &nbsp;<span class="qim-code-tag">← correct</span><br>B. Wrong answer<br>C. Wrong answer<br>D. Wrong answer</div>
        </div>

        <!-- Textarea -->
        <div class="qim-textarea-wrap">
          <textarea class="qim-textarea" id="qim-textarea"
            placeholder="${PLACEHOLDER.replace(/"/g,'&quot;')}"
            oninput="document.getElementById('quiz-importer-modal').__render(this.value, null)"
            spellcheck="false"
            rows="12">${escHtml(text || '')}</textarea>
        </div>

        <!-- Preview + errors -->
        ${previewHTML}
        ${errListHTML}

        <!-- Actions -->
        <div class="qim-actions">
          <button class="modal-cancel" onclick="document.getElementById('quiz-importer-modal').remove()">Cancel</button>
          <button class="qim-import-btn"
            onclick="doImportQuestions()"
            ${count === 0 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Import ${count > 0 ? count + ' Question' + (count !== 1 ? 's' : '') : 'Questions'}
          </button>
        </div>
      </div>`;

    modal.__render = renderModal;
    modal.__parsed = questions;

    // Restore cursor position after re-render
    const ta = document.getElementById('qim-textarea');
    if (ta && text) {
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }
  }

  renderModal('', null);

  window.doImportQuestions = () => {
    const parsed = modal.__parsed || [];
    if (!parsed.length) return;

    // Inject in REVERSE so first question ends up on top after prepending
    [...parsed].reverse().forEach(q => _renderImportedBlock(q));
    _qbRenumber();

    const ta   = document.getElementById('qim-textarea');
    const text = ta ? ta.value : '';
    renderModal(text, parsed.length);

    // Scroll the list into view
    document.getElementById('quiz-questions-list')
      ?.firstElementChild
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
}

function addQuizQuestion(type) {
  type = type || 'multiple_choice';
  const list = document.getElementById('quiz-questions-list');
  if (!list) return;
  const uid = Date.now() + '_' + Math.random().toString(36).slice(2,6);

  const TYPE_LABELS = {
    multiple_choice: 'Multiple choice',
    true_false:      'True / False',
    fill_blank:      'Fill in the blank',
    ordering:        'Ordering',
    image_based:     'Image-based',
  };
  const TYPE_CSS = {
    multiple_choice: 'mc',
    true_false:      'tf',
    fill_blank:      'fitb',
    ordering:        'ord',
    image_based:     'img',
  };

  /* ── Build inner HTML per type ── */
  let bodyHTML = '';

  if (type === 'multiple_choice' || type === 'image_based') {
    const imgUpload = type === 'image_based' ? `
      <div class="qb-img-drop" id="qb-imgdrop-${uid}">
        <input type="file" accept="image/*" onchange="qbHandleImageUpload(this,'${uid}')" />
        <div class="qb-img-drop-icon">🖼</div>
        <div class="qb-img-drop-text">Click or drag to upload image (PNG, JPG, GIF — max 5 MB)</div>
      </div>
      <div class="qb-img-preview" id="qb-imgprev-${uid}" style="display:none">
        <img id="qb-imgel-${uid}" src="" alt="Question image" />
        <button class="qb-img-remove" onclick="qbRemoveImage('${uid}')">Remove</button>
      </div>` : '';
    bodyHTML = `
      ${imgUpload}
      <div class="qb-options-grid">
        ${['A','B','C','D'].map(letter => `
          <label class="qb-option-row">
            <input type="radio" name="correct-q${uid}" value="${letter}" class="qb-correct-radio" />
            <span class="qb-option-letter">${letter}</span>
            <input class="qb-q-input qb-option-input" type="text" placeholder="Option ${letter}…" />
          </label>`).join('')}
      </div>
      <div class="qb-correct-hint">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Click a letter to mark the correct answer
      </div>`;

  } else if (type === 'true_false') {
    bodyHTML = `
      <div class="qb-tf-row">
        <button type="button" class="qb-tf-btn" data-val="true"  onclick="qbSelectTF(this,'${uid}')">True</button>
        <button type="button" class="qb-tf-btn" data-val="false" onclick="qbSelectTF(this,'${uid}')">False</button>
      </div>
      <input type="hidden" class="qb-tf-answer" id="qb-tf-${uid}" value="" />
      <div class="qb-correct-hint">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Click True or False to set the correct answer
      </div>`;

  } else if (type === 'fill_blank') {
    bodyHTML = `
      <p class="qb-fitb-hint">Use ___ in your question to mark the blank. Add all accepted keyword answers below.</p>
      <div class="qb-fitb-add-row">
        <input class="qb-q-input" id="qb-fitb-inp-${uid}" type="text" placeholder="Add accepted keyword…" onkeydown="if(event.key==='Enter'){event.preventDefault();qbAddFitbTag('${uid}')}" />
        <button type="button" class="qb-fitb-add-btn" onclick="qbAddFitbTag('${uid}')">Add</button>
      </div>
      <div class="qb-fitb-tags" id="qb-fitb-tags-${uid}"></div>`;

  } else if (type === 'ordering') {
    bodyHTML = `
      <p class="qb-fitb-hint">Enter items in the correct order. Students will see them shuffled.</p>
      <div class="qb-ord-list" id="qb-ord-list-${uid}">
        ${[1,2,3].map(n => _qbOrdItemHTML(uid, n)).join('')}
      </div>
      <button type="button" class="qb-ord-add-btn" onclick="qbAddOrdItem('${uid}')">+ Add item</button>`;
  }

  const block = document.createElement('div');
  block.className = 'qb-question-block';
  block.dataset.type = type;
  block.dataset.uid  = uid;
  block.innerHTML = `
    <div class="qb-q-header">
      <div class="qb-q-num">Q1</div>
      <span class="qb-type-badge qb-type-badge--${TYPE_CSS[type]}">${TYPE_LABELS[type]}</span>
      <button class="qb-q-remove" onclick="removeQuizQuestion(this)" title="Remove question">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <input class="qb-q-input qb-q-text" type="text" placeholder="Enter your question here…" />
    ${bodyHTML}
  `;

  list.prepend(block);
  _qbRenumber();

  /* wire up MC/image radio highlight */
  if (type === 'multiple_choice' || type === 'image_based') {
    block.querySelectorAll('.qb-correct-radio').forEach(radio => {
      radio.addEventListener('change', () => {
        block.querySelectorAll('.qb-option-row').forEach(r => r.classList.remove('qb-option-correct'));
        if (radio.checked) radio.closest('.qb-option-row').classList.add('qb-option-correct');
      });
    });
    /* clicking letter badge also selects radio */
    block.querySelectorAll('.qb-option-letter').forEach(letter => {
      letter.addEventListener('click', () => {
        const row   = letter.closest('.qb-option-row');
        const radio = row.querySelector('.qb-correct-radio');
        if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
      });
    });
  }

  /* wire up ordering drag-sort */
  if (type === 'ordering') _qbInitOrdDrag(uid);

  block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ── Ordering helpers ── */
function _qbOrdItemHTML(uid, n) {
  return `<div class="qb-ord-item" draggable="true">
    <span class="qb-ord-handle" title="Drag to reorder">⠿</span>
    <div class="qb-ord-num">${n}</div>
    <input class="qb-q-input" style="margin:0;padding:7px 10px" type="text" placeholder="Item ${n}…" />
    <button type="button" class="qb-ord-remove" onclick="this.closest('.qb-ord-item').remove();_qbOrdRenumber('${uid}')">×</button>
  </div>`;
}
function _qbOrdRenumber(uid) {
  const list = document.getElementById('qb-ord-list-' + uid);
  if (!list) return;
  list.querySelectorAll('.qb-ord-num').forEach((el, i) => el.textContent = i + 1);
}
function qbAddOrdItem(uid) {
  const list = document.getElementById('qb-ord-list-' + uid);
  if (!list) return;
  const n = list.querySelectorAll('.qb-ord-item').length + 1;
  list.insertAdjacentHTML('beforeend', _qbOrdItemHTML(uid, n));
  _qbInitOrdDrag(uid);
}
function _qbInitOrdDrag(uid) {
  const list = document.getElementById('qb-ord-list-' + uid);
  if (!list) return;
  let dragged = null;
  list.querySelectorAll('.qb-ord-item').forEach(item => {
    item.addEventListener('dragstart', e => { dragged = item; item.style.opacity = '.45'; });
    item.addEventListener('dragend',   e => { dragged = null; item.style.opacity = ''; });
    item.addEventListener('dragover',  e => { e.preventDefault(); });
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (dragged && dragged !== item) {
        const items = [...list.querySelectorAll('.qb-ord-item')];
        const fromI = items.indexOf(dragged);
        const toI   = items.indexOf(item);
        if (fromI < toI) list.insertBefore(dragged, item.nextSibling);
        else             list.insertBefore(dragged, item);
        _qbOrdRenumber(uid);
      }
    });
  });
}

/* ── True/False helper ── */
function qbSelectTF(btn, uid) {
  const row = btn.closest('.qb-tf-row');
  row.querySelectorAll('.qb-tf-btn').forEach(b => b.classList.remove('qb-tf-true','qb-tf-false'));
  const val = btn.dataset.val;
  btn.classList.add(val === 'true' ? 'qb-tf-true' : 'qb-tf-false');
  const hidden = document.getElementById('qb-tf-' + uid);
  if (hidden) hidden.value = val;
}

/* ── Fill-in-the-blank helpers ── */
function qbAddFitbTag(uid) {
  const inp  = document.getElementById('qb-fitb-inp-' + uid);
  const tags = document.getElementById('qb-fitb-tags-' + uid);
  if (!inp || !tags) return;
  const val = inp.value.trim();
  if (!val) return;
  const tag = document.createElement('span');
  tag.className = 'qb-fitb-tag';
  tag.dataset.val = val;
  tag.innerHTML = `${escHtml(val)} <span class="qb-fitb-tag-x" onclick="this.parentElement.remove()">×</span>`;
  tags.appendChild(tag);
  inp.value = '';
  inp.focus();
}

/* ── Image-based helpers ── */
function qbHandleImageUpload(input, uid) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5 MB.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const drop = document.getElementById('qb-imgdrop-' + uid);
    const prev = document.getElementById('qb-imgprev-' + uid);
    const img  = document.getElementById('qb-imgel-' + uid);
    if (drop) drop.style.display = 'none';
    if (prev) prev.style.display = '';
    if (img)  { img.src = e.target.result; img.dataset.b64 = e.target.result; }
  };
  reader.readAsDataURL(file);
}
function qbRemoveImage(uid) {
  const drop = document.getElementById('qb-imgdrop-' + uid);
  const prev = document.getElementById('qb-imgprev-' + uid);
  const img  = document.getElementById('qb-imgel-' + uid);
  if (drop) drop.style.display = '';
  if (prev) prev.style.display = 'none';
  if (img)  { img.src = ''; img.dataset.b64 = ''; }
}

function _qbRenumber() {
  document.querySelectorAll('#quiz-questions-list .qb-question-block').forEach((b, i) => {
    const numEl = b.querySelector('.qb-q-num');
    if (numEl) numEl.textContent = `Q${i + 1}`;
  });
}

function removeQuizQuestion(btn) {
  const block = btn.closest('.qb-question-block');
  if (block) {
    block.style.opacity = '0';
    block.style.transform = 'scale(.97)';
    block.style.transition = 'opacity .18s, transform .18s';
    setTimeout(() => { block.remove(); _qbRenumber(); }, 180);
  }
}

async function saveQuiz() {
  const user    = window._creatorUser || window._currentUser;
  const title   = (document.getElementById('qb-title')?.value || '').trim();
  const subject = document.getElementById('qb-subject')?.value || '';
  const access  = document.getElementById('qb-access')?.value  || 'free';
  const price   = access === 'priced'
    ? (parseFloat(document.getElementById('qb-price')?.value) || 0)
    : 0;

  if (!title) { alert('Please enter a quiz title.'); return; }
  if (access === 'priced' && price <= 0) { alert('Please enter a price greater than 0.'); return; }

  const questions = [];
  document.querySelectorAll('#quiz-questions-list .qb-question-block').forEach((block) => {
    const type         = block.dataset.type || 'multiple_choice';
    const uid          = block.dataset.uid  || '';
    const questionText = block.querySelector('.qb-q-text')?.value.trim() || '';

    if (type === 'multiple_choice' || type === 'image_based') {
      const optionInputs = block.querySelectorAll('.qb-option-input');
      const options      = Array.from(optionInputs).map(inp => inp.value.trim());
      const checkedRadio = block.querySelector('.qb-correct-radio:checked');
      const answer       = checkedRadio ? checkedRadio.value : 'A';
      const imgEl        = document.getElementById('qb-imgel-' + uid);
      const imageData    = imgEl?.dataset.b64 || '';
      questions.push({ type, question: questionText, options, answer, imageData });

    } else if (type === 'true_false') {
      const hidden = document.getElementById('qb-tf-' + uid);
      const answer = hidden?.value || '';
      if (!answer) { alert('Please select True or False for a question.'); throw new Error('no tf answer'); }
      questions.push({ type, question: questionText, answer });

    } else if (type === 'fill_blank') {
      const tags     = block.querySelectorAll('.qb-fitb-tag');
      const keywords = Array.from(tags).map(t => t.dataset.val || t.textContent.replace('×','').trim()).filter(Boolean);
      if (!keywords.length) { alert('Please add at least one accepted keyword for a fill-in-the-blank question.'); throw new Error('no fitb keywords'); }
      questions.push({ type, question: questionText, keywords });

    } else if (type === 'ordering') {
      const items = Array.from(block.querySelectorAll('.qb-ord-item input')).map(inp => inp.value.trim()).filter(Boolean);
      if (items.length < 2) { alert('Ordering questions need at least 2 items.'); throw new Error('not enough ord items'); }
      questions.push({ type, question: questionText, items });
    }
  });

  try {
    const editingId = window._editingQuizId;

    if (editingId) {
      const allQuizzes = await loadQuizzes();
      const idx = allQuizzes.findIndex(q => q.id === editingId);
      if (idx !== -1) {
        allQuizzes[idx] = { ...allQuizzes[idx], title, subject, access, price, questions, updatedAt: Date.now() };
        await sbUpsert('quizzes', {
          id:            editingId,
          creator_email: allQuizzes[idx].creatorEmail,
          title, subject, access, questions,
          attempts:      allQuizzes[idx].attempts || 0,
          updated_at:    new Date().toISOString(),
        }, 'id');
      }
      window._editingQuizId = null;
    } else {
      const quizzes = await loadQuizzes();
      quizzes.push({
        id:           'quiz_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        creatorEmail: user?.email || currentUser?.email || '',
        title, subject, access, price,
        questions,
        attempts:  0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await saveQuizzes(quizzes);
    }
    closeQuizBuilder();
    await loadCreatorQuizzes(user);
  } catch (e) {
    if (e.message !== 'no tf answer' && e.message !== 'no fitb keywords' && e.message !== 'not enough ord items') {
      alert('Could not save quiz. Please try again.');
    }
  }
}
async function deleteQuiz(id) {
  if (!confirm('Delete this quiz?')) return;
  // Remove from DOM immediately — no reflow/jump
  const card = document.querySelector(`[data-item-id="${id}"], [data-id="${id}"]`);
  if (card) {
    card.style.transition = 'opacity .18s, transform .18s';
    card.style.opacity = '0';
    card.style.transform = 'scale(.97)';
    setTimeout(() => card.remove(), 190);
  }
  try {
    await sbDelete('quizzes', 'id', id);
    showToast('Quiz deleted.');
  } catch (e) {
    console.error('deleteQuiz:', e);
    showToast('Could not delete quiz. Please try again.');
    // Restore card if DB delete failed
    if (card) {
      card.style.opacity = '1';
      card.style.transform = '';
    }
  }
}

/* ──────────────────────────────────────────────────────────
   ANALYTICS TAB
──────────────────────────────────────────────────────────── */

async function loadCreatorAnalytics(user) {
  // Delegates to renderCreatorAnalytics which already syncs cstat-revenue
  // with the correct subs + sales total at the end of its run.
  // No secondary fetch here — it would overwrite the correct figure with
  // a subs-only number, causing the stat to flip from e.g. ₱4074 → ₱297.
  await renderCreatorAnalytics();
}

/* ──────────────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────────────────── */

/* ══════════════════════════════════════════════════════════
   CREATOR HUB — App Logic (migrated from app.js)
   Storage helpers, page init, render functions, badge/paywall
══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════
   CREATOR HUB — Full System
   Storage: sb_creator_apps, sb_products, sb_subscriptions, sb_quizzes, sb_user_subs
══════════════════════════════════════ */

/* ── Storage helpers ── */

/* loadPurchases — defined here so creator.js is self-contained regardless of
   script load order. app.js carries an identical copy for other callers. */
async function loadPurchases() {
  const { data, error } = await sb.from('purchases').select('*');
  if (error) { console.error('loadPurchases:', error.message); return []; }
  return (data || []).map(r => ({
    id:          r.id,
    userEmail:   r.user_email,
    productId:   r.product_id,
    price:       Number(r.price) || 0,   // coerce null/undefined → 0
    purchasedAt: r.purchased_at ? new Date(r.purchased_at).getTime() : Date.now(),
  }));
}

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

/* FIX 1 — getMyTiers is now a thin alias.
   creator-feed.js still calls this; it gets a single-element array
   or [] without us needing to touch that file in this step. */
async function getMyTiers() {
  if (!currentUser) return [];
  const sub = await getCreatorSubscription(currentUser.email);
  return sub ? [sub] : [];
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
  // Creator Hub is only reachable by accounts with accountType === 'creator'
  // (the nav item is hidden for students at login). If somehow reached without
  // an approved creator_apps row, auto-create one from the account record so
  // the dashboard always loads cleanly — no apply screen needed.
  const screens = ['creator-apply-screen','creator-form-screen','creator-pending-screen','creator-dashboard'];
  screens.forEach(s => { const el = document.getElementById(s); if (el) el.style.display = 'none'; });

  let app = await getMyCreatorApp();

  if (!app && currentUser) {
    // Bootstrap a creator_apps row for accounts that became creators at sign-up
    const apps = await loadCreatorApps();
    app = {
      email:        currentUser.email,
      brand:        currentUser.creatorBrand || currentUser.name || '',
      bio:          '',
      subject:      '',
      contentTypes: [],
      price:        0,
      status:       'approved',
      appliedAt:    Date.now(),
      approvedAt:   Date.now(),
    };
    apps.push(app);
    await saveCreatorApps(apps);
  }

  if (app && app.status === 'approved') {
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
  // FIX 7: getCreatorSubscription replaces getMyTiers() in analytics
  const [products, quizzes, sub, allSubs, allPurchases, accounts] = await Promise.all([
    getMyProducts(),
    getMyQuizzes(),
    getCreatorSubscription(currentUser.email),
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

  // ── Helper: build a drawer row HTML string ──
  const esc = (s) => escHtml(String(s || ''));

  function drawerRow(left, right) {
    return `<div class="an-drawer-row">${left}<div class="an-drawer-row-right">${right}</div></div>`;
  }

  // ── Revenue panel content ──
  const panelRevenueHTML = `
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
      `<span class="an-drawer-val" style="color:var(--purple-bright)">₱${totalRevenue.toLocaleString()}</span>`)}`;

  // ── Subscription plan panel content ──
  const subDrawerRowHTML = sub
    ? `<div class="an-tier-drawer-row">
         <div class="an-drawer-dot" style="background:var(--purple-bright)"></div>
         <span class="an-drawer-row-name" style="flex:1">${esc(sub.name || 'Subscription')}</span>
         <span class="an-drawer-row-sub" style="margin-left:0">${allSubs.length} subscriber${allSubs.length !== 1 ? 's' : ''}</span>
         <span class="an-drawer-val" style="min-width:60px;text-align:right">₱${(sub.price || 0).toLocaleString()}/mo</span>
       </div>`
    : `<div class="an-drawer-empty">No subscription set up yet.</div>`;

  const panelTiersHTML = `
    <div class="an-drawer-header">
      <span class="an-drawer-title">Subscription · ${allSubs.length} subscriber${allSubs.length !== 1 ? 's' : ''}</span>
      <span class="an-drawer-meta">subscriber breakdown</span>
    </div>
    ${subDrawerRowHTML}`;

  // ── Store raw data + static HTML on grid for the paged renderer ──
  // Pageable panels store item arrays; static panels store HTML strings directly.
  grid._analyticsData = {
    revenue:  { type: 'static', html: panelRevenueHTML },
    subs:     { type: 'paged',  items: allSubs,        header: `Active subscribers · ${allSubs.length}`,   meta: `₱${subRevenue.toLocaleString()}/mo`,           renderRow: null },
    products: { type: 'paged',  items: sortedProducts, header: `All products · ${products.length}`,         meta: 'sorted by sales',                              renderRow: null },
    quizzes:  { type: 'paged',  items: sortedQuizzes,  header: `All quizzes · ${quizzes.length}`,           meta: `${totalAttempts} total attempts`,               renderRow: null },
    tiers:    { type: 'static', html: panelTiersHTML },
    sales:    { type: 'paged',  items: myPurchases,    header: `Recent purchases · ${myPurchases.length}`,  meta: `₱${saleRevenue.toLocaleString()} total`,        renderRow: null },
  };
  // Store per-row renderers that close over computed data
  grid._analyticsData.subs.renderRow     = (s) => {
    const u     = accounts.find(a => a.email === s.userEmail);
    const name  = u ? u.name : s.userEmail.split('@')[0];
    const init  = (name || '?')[0].toUpperCase();
    const color = u?.avatarColor || 'var(--purple-bright)';
    const since = s.since ? new Date(s.since).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : '—';
    return `<div class="an-drawer-row an-sub-row-item" data-name="${esc((name+' '+s.userEmail).toLowerCase())}">
      <div class="an-drawer-avatar" style="background:${color}">${esc(init)}</div>
      <div class="an-drawer-row-info"><div class="an-drawer-row-name">${esc(name)}</div><div class="an-drawer-row-sub">Since ${since}</div></div>
      <div class="an-drawer-row-right">
        <span class="an-drawer-chip">₱${s.price || 0}/mo</span>
        <button class="an-drawer-msg-btn" title="Message ${esc(name)}" onclick="if(typeof openMessagesWith==='function')openMessagesWith('${esc(s.userEmail)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div></div>`;
  };
  grid._analyticsData.products.renderRow = (p) => {
    const prodIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--purple-mid)" stroke-width="2" width="14" height="14"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`;
    const count  = purchaseCountMap[p.id] ?? p.salesCount ?? 0;
    const earned = count * (p.price || 0);
    const chip   = p.price > 0 ? `<span class="an-drawer-chip an-chip-paid">₱${p.price}</span>` : `<span class="an-drawer-chip an-chip-free">Free</span>`;
    return `<div class="an-drawer-row">
      <div class="an-drawer-prod-icon">${prodIcon}</div>
      <div class="an-drawer-row-info"><div class="an-drawer-row-name">${esc(p.title)}</div><div class="an-drawer-row-sub">${esc(p.type||'notes')} · ${count} sale${count!==1?'s':''}</div></div>
      <div class="an-drawer-row-right">${chip}<span class="an-drawer-val">${p.price>0?'₱'+earned.toLocaleString():'—'}</span></div></div>`;
  };
  grid._analyticsData.quizzes.renderRow  = (q) => {
    const pct  = Math.round(((q.attempts||0)/maxAttempts)*100);
    const chip = q.access==='paid' ? `<span class="an-drawer-chip an-chip-paid" style="font-size:.65rem">Subscribers</span>` : `<span class="an-drawer-chip an-chip-free" style="font-size:.65rem">Free</span>`;
    return `<div class="an-drawer-row">
      <div class="an-drawer-row-info" style="flex:1;min-width:0"><div class="an-drawer-row-name">${esc(q.title)}</div><div class="an-drawer-row-sub">${esc(q.subject||'')}${q.subject?' · ':''}${Array.isArray(q.questions)?q.questions.length:0} Qs</div></div>
      <div class="an-drawer-row-right" style="gap:8px">${chip}<div class="an-bar-wrap"><div class="an-bar-track"><div class="an-bar-fill" style="width:${pct}%"></div></div><span class="an-bar-val">${q.attempts||0}</span></div></div></div>`;
  };
  grid._analyticsData.sales.renderRow    = (pur) => {
    const prod  = products.find(p => p.id === pur.productId);
    const buyer = accounts.find(a => a.email === pur.userEmail);
    const name  = buyer ? buyer.name : (pur.userEmail||'').split('@')[0];
    const init  = (name||'?')[0].toUpperCase();
    const color = buyer?.avatarColor || '#7c3aed';
    const date  = pur.purchasedAt ? new Date(pur.purchasedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric'}) : '—';
    return `<div class="an-drawer-row">
      <div class="an-drawer-avatar" style="background:${color}">${esc(init)}</div>
      <div class="an-drawer-row-info"><div class="an-drawer-row-name">${esc(name)}</div><div class="an-drawer-row-sub">${esc(prod?.title||'Unknown product')} · ${date}</div></div>
      <div class="an-drawer-row-right"><span class="an-drawer-val">₱${(pur.price||0).toLocaleString()}</span></div></div>`;
  };

  // ── Render card grid — no drawers inside cards ──
  grid.innerHTML = `
    <div class="an-card" id="an-card-revenue" onclick="toggleAnalyticsCard('revenue')">
      <div class="an-card-top">
        <div>
          <div class="an-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
          <div class="an-card-val">₱${totalRevenue.toLocaleString()}</div>
          <div class="an-card-lbl">Total revenue</div>
          <div class="an-card-sub">subs + sales</div>
        </div>
        <svg class="an-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>

    <div class="an-card" id="an-card-subs" onclick="toggleAnalyticsCard('subs')">
      <div class="an-card-top">
        <div>
          <div class="an-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <div class="an-card-val">${allSubs.length}</div>
          <div class="an-card-lbl">Subscribers</div>
          <div class="an-card-sub">₱${subRevenue.toLocaleString()}/mo recurring</div>
        </div>
        <svg class="an-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>

    <div class="an-card" id="an-card-products" onclick="toggleAnalyticsCard('products')">
      <div class="an-card-top">
        <div>
          <div class="an-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg></div>
          <div class="an-card-val">${products.length}</div>
          <div class="an-card-lbl">Products</div>
          <div class="an-card-sub">${paidProds.length} paid · ${freeProds.length} free</div>
        </div>
        <svg class="an-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>

    <div class="an-card" id="an-card-quizzes" onclick="toggleAnalyticsCard('quizzes')">
      <div class="an-card-top">
        <div>
          <div class="an-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
          <div class="an-card-val">${quizzes.length}</div>
          <div class="an-card-lbl">Quizzes</div>
          <div class="an-card-sub">${totalAttempts} total attempts</div>
        </div>
        <svg class="an-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>

    <div class="an-card" id="an-card-tiers" onclick="toggleAnalyticsCard('tiers')">
      <div class="an-card-top">
        <div>
          <div class="an-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
          <div class="an-card-val">${sub ? 1 : 0}</div>
          <div class="an-card-lbl">Subscription</div>
          <div class="an-card-sub">${sub ? esc(sub.name) : 'None yet'}</div>
        </div>
        <svg class="an-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>

    <div class="an-card" id="an-card-sales" onclick="toggleAnalyticsCard('sales')">
      <div class="an-card-top">
        <div>
          <div class="an-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>
          <div class="an-card-val">${myPurchases.length}</div>
          <div class="an-card-lbl">Product sales</div>
          <div class="an-card-sub">₱${saleRevenue.toLocaleString()} earned</div>
        </div>
        <svg class="an-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>`;

  // Sync header revenue stat
  const revEl = document.getElementById('cstat-revenue');
  if (revEl) revEl.textContent = '₱' + totalRevenue.toLocaleString();
}

/* ──────────────────────────────────────────────────────────
   ANALYTICS CARD TOGGLE — drives the external detail panel
──────────────────────────────────────────────────────────── */
const AN_PAGE_SIZE = 8;
let _activeAnalyticsCard = null;
let _activeAnalyticsPage = 1;

function toggleAnalyticsCard(key) {
  const card  = document.getElementById('an-card-' + key);
  const panel = document.getElementById('creator-analytics-detail');
  const grid  = document.getElementById('creator-analytics-grid');
  if (!card || !panel || !grid) return;

  const isOpen = _activeAnalyticsCard === key;
  document.querySelectorAll('.an-card').forEach(c => c.classList.remove('an-card-active'));
  _activeAnalyticsCard = null;

  if (isOpen) { panel.style.display = 'none'; return; }

  card.classList.add('an-card-active');
  _activeAnalyticsCard = key;
  _activeAnalyticsPage = 1;
  _renderAnalyticsPage(key, 1);
  panel.style.display = '';
}

function _renderAnalyticsPage(key, page) {
  const inner = document.getElementById('creator-analytics-detail-inner');
  const grid  = document.getElementById('creator-analytics-grid');
  if (!inner || !grid) return;

  const dataMap = grid._analyticsData || {};
  const entry   = dataMap[key];
  if (!entry) return;

  _activeAnalyticsPage = page;

  // Static panels (revenue, subscription plan) — no pager needed
  if (entry.type === 'static') {
    inner.innerHTML = entry.html;
    return;
  }

  // Paged panels
  const items      = entry.items || [];
  const total      = items.length;
  const totalPages = Math.max(1, Math.ceil(total / AN_PAGE_SIZE));
  const safePage   = Math.min(Math.max(1, page), totalPages);
  const start      = (safePage - 1) * AN_PAGE_SIZE;
  const slice      = items.slice(start, start + AN_PAGE_SIZE);

  const rowsHTML = slice.length
    ? slice.map(entry.renderRow).join('')
    : `<div class="an-drawer-empty">Nothing here yet.</div>`;

  // Pager — only render if more than one page
  const pagerHTML = totalPages > 1 ? _buildPager(safePage, totalPages) : '';

  // Search bar only for subscribers (keep existing behaviour)
  const searchHTML = key === 'subs' && total > 2
    ? `<div class="an-drawer-search-wrap">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
         <input class="an-drawer-search" type="text" placeholder="Search subscribers…" oninput="analyticsFilterSubs(this.value)" />
       </div>`
    : '';

  inner.innerHTML = `
    <div class="an-drawer-header">
      <span class="an-drawer-title">${entry.header}</span>
      <span class="an-drawer-meta">${entry.meta}</span>
    </div>
    ${searchHTML}
    <div id="an-paged-rows">${rowsHTML}</div>
    ${pagerHTML}`;
}

function _buildPager(page, total) {
  // Smart ellipsis: always show first, last, and window around current page
  let pages = [];
  if (total <= 7) {
    pages = Array.from({ length: total }, (_, i) => i + 1);
  } else if (page <= 4) {
    pages = [1, 2, 3, 4, 5, '…', total];
  } else if (page >= total - 3) {
    pages = [1, '…', total-4, total-3, total-2, total-1, total];
  } else {
    pages = [1, '…', page-1, page, page+1, '…', total];
  }

  const key = _activeAnalyticsCard;
  const nums = pages.map(p =>
    p === '…'
      ? `<span class="an-pg-ellipsis">…</span>`
      : `<button class="an-pg-num${p === page ? ' an-pg-current' : ''}" onclick="analyticsGoPage('${key}',${p})">${p}</button>`
  ).join('');

  const start = (page - 1) * AN_PAGE_SIZE + 1;
  const end   = Math.min(page * AN_PAGE_SIZE, (document.getElementById('creator-analytics-grid')?._analyticsData?.[key]?.items?.length || 0));
  const totalItems = document.getElementById('creator-analytics-grid')?._analyticsData?.[key]?.items?.length || 0;

  return `
    <div class="an-pager">
      <span class="an-pager-info">Showing ${start}–${end} of ${totalItems}</span>
      <div class="an-pager-controls">
        <button class="an-pg-btn" onclick="analyticsGoPage('${key}',${page-1})" ${page===1?'disabled':''}
          title="Previous page">&#8592;</button>
        ${nums}
        <button class="an-pg-btn" onclick="analyticsGoPage('${key}',${page+1})" ${page===total?'disabled':''}
          title="Next page">&#8594;</button>
      </div>
    </div>`;
}

function analyticsGoPage(key, page) {
  _renderAnalyticsPage(key, page);
}

function analyticsFilterSubs(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('#an-paged-rows .an-sub-row-item').forEach(row => {
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

  // Always set _creatorUser here so switchCreatorTab lazy-loaders never get null
  window._creatorUser = currentUser;

  setText('creator-dash-name',    app.brand    || currentUser.name);
  setText('creator-dash-subject', app.subject  || '');

  // Stats — parallel fetch, no getMyTiers() needed for dashboard numbers
  const [myProducts, myQuizzes, allSubsList, allPurchases] = await Promise.all([
    getMyProducts(),
    getMyQuizzes(),
    loadUserSubs(),
    loadPurchases(),
  ]);
  const allSubs     = allSubsList.filter(s => s.creatorEmail === currentUser.email);
  const myPurchases = allPurchases.filter(pur => myProducts.some(p => p.id === pur.productId));
  const subRevenue  = allSubs.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  const saleRevenue = myPurchases.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
  const revenue     = subRevenue + saleRevenue;

  setText('cstat-subs',      allSubs.length);
  setText('cstat-products',  myProducts.length);
  setText('cstat-quizzes',   myQuizzes.length);
  setText('cstat-revenue',   '₱' + revenue.toLocaleString());
  setText('cstat-purchases', myPurchases.length);

  const withdrawn2   = _getWithdrawn(currentUser.email);
  const totalMoney2  = Math.max(0, revenue - withdrawn2);
  setText('cstat-total-money', '₱' + totalMoney2.toLocaleString());
  window._creatorRevenue    = revenue;
  window._creatorTotalMoney = totalMoney2;

  // Restore whichever tab was active, defaulting to 'products' on first load
  const tabToRestore = window._activeCreatorTab || 'products';
  switchCreatorTab(tabToRestore);
  if (tabToRestore === 'products') await loadCreatorProducts(window._creatorUser);
}

/* ── Tab switcher ── */

/* renderCreatorPending removed — instant approval, no review queue */

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
  // Delegates to the main tab loader which uses single-price model
  const user = window._creatorUser || currentUser;
  await loadCreatorSubscriptions(user);
}



async function saveSubscriptionTier() {
  /* Old tier-based function — now delegates to single-price save */
  await saveCreatorSubPrice();
}

/* FIX 5 — subscribeToCreator: single-subscription model.
   No multi-tier picker overlay — call getCreatorSubscription and
   pass the result straight to _confirmSubscription. */
async function subscribeToCreator(creatorEmail) {
  if (!currentUser) { showToast('Sign in to subscribe.'); return; }
  if (typeof creatorEmail === 'object') creatorEmail = creatorEmail?.email || '';
  if (!creatorEmail) return;
  if (currentUser.email === creatorEmail) { showToast("You can't subscribe to yourself."); return; }

  const subs = await loadUserSubs();
  if (subs.some(s => s.userEmail === currentUser.email && s.creatorEmail === creatorEmail)) {
    showToast('You are already subscribed!'); return;
  }

  const sub = await getCreatorSubscription(creatorEmail);
  if (!sub) { showToast("This creator hasn't set up a subscription yet."); return; }

  await _confirmSubscription(creatorEmail, sub);
}

/* ══════════════════════════════════════
   QUIZ MAKER
   State is managed via window._editingQuizId (set by
   openQuizEditor / openQuizBuilder) and DOM blocks in
   #quiz-questions-list. The old quizQuestions array and
   renderQuizBuilder() have been removed — they were
   overwriting the DOM and wiping edited questions.
══════════════════════════════════════ */

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
