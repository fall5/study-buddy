/* ═══════════════════════════════════════════════════════════
   STUDY BUDDY — profile.js  (v2)
   My Profile  +  View Profile
   ─ Posts rendered exactly like the feed (buildPostHTML)
   ─ Creator store section (products, subscriptions, quizzes)
   ─ Clicking avatar/name on feed → openUserProfile()
   ─ "View Profile" on buddy cards → openUserProfile()
   ═══════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────
   GLOBAL ENTRY — open any user's profile by email
──────────────────────────────────────────────────────────── */

/* Safe wrapper — isSubscribedTo is defined in creator.js which loads after profile.js */
async function _vpIsSubscribedTo(creatorEmail) {
  if (typeof isSubscribedTo === 'function') return isSubscribedTo(creatorEmail);
  if (!currentUser) return false;
  const subs = await loadUserSubs();
  return subs.some(s => s.userEmail === currentUser.email && s.creatorEmail === creatorEmail);
}

async function openUserProfile(email) {
  if (!email) return;
  // Own profile → My Profile tab
  if (currentUser && email.toLowerCase() === currentUser.email.toLowerCase()) {
    appNav('profile');
    return;
  }
  const accounts = await loadAccounts();
  const user = accounts.find(a => a.email.toLowerCase() === email.toLowerCase());
  if (user) {
    // Remember where to go back
    window._vpReturnTo = window.activeAppSection || 'feed';
    await renderViewProfile(user);
  } else {
    showToast('Profile not found.');
  }
}

/* ──────────────────────────────────────────────────────────
   MY PROFILE
──────────────────────────────────────────────────────────── */
async function renderMyProfile(user) {
  window._currentProfileUser = user;
  if (!user) return;
  const section = document.getElementById('app-profile');
  if (!section) return;

  window._profileUser = user;

  const initial   = (user.name || user.email || 'U')[0].toUpperCase();
  const color     = avatarColor(user);
  const isCreator = user.isCreator || false;

  section.innerHTML = `
    <div class="profile-page">

      <div class="profile-banner"><div class="profile-banner-pattern"></div></div>

      <div class="profile-identity">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar-large" style="background:${color}">${escHtml(initial)}</div>
        </div>
        <div class="profile-identity-main">
          <div>
            <div class="profile-name-row">
              <h2 class="profile-name">${escHtml(user.name || 'Your Name')}</h2>
              ${isCreator ? `<span class="creator-badge">✦ Creator</span>` : ''}
            </div>
            <div class="profile-handle">@${escHtml((user.name||'user').toLowerCase().replace(/\s+/g,''))} · Student</div>
            ${isCreator && user.creatorBrand ? `<div class="profile-creator-brand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              ${escHtml(user.creatorBrand)}
            </div>` : ''}
            <p class="profile-bio-text">${escHtml(user.bio || 'No bio yet — click Edit Profile to add one.')}</p>
          </div>
          <div class="profile-action-group">
            <button class="profile-edit-btn" onclick="openProfileEdit()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Profile
            </button>
            ${isCreator ? `<button class="profile-hub-btn" onclick="appNav('creator')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Creator Hub
            </button>` : ''}
          </div>
        </div>
      </div>

      <!-- Stats strip -->
      <div class="profile-stats-strip">
        <div class="profile-stat-item">
          <div class="profile-stat-val" id="pstat-posts">—</div>
          <div class="profile-stat-label">Posts</div>
        </div>
        <div class="profile-stat-item">
          <div class="profile-stat-val" id="pstat-matches">—</div>
          <div class="profile-stat-label">Matches</div>
        </div>
        <div class="profile-stat-item">
          <div class="profile-stat-val" id="pstat-streak">—</div>
          <div class="profile-stat-label">Streak 🔥</div>
        </div>
      </div>

      <!-- Info cards -->
      <div class="profile-body">
        <div class="profile-card">
          <div class="profile-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="8" r="4"/><path d="M6 20v-1a6 6 0 0 1 12 0v1"/></svg>
            About Me
          </div>
          <div class="profile-info-row"><span class="profile-info-label">Course</span><span class="profile-info-value">${escHtml(user.headline||'—')}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Schedule</span><span class="profile-info-value">${escHtml(user.schedule||'—')}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Study Style</span><span class="profile-info-value">${escHtml(user.style||'—')}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Location</span><span class="profile-info-value">${escHtml(user.location||'—')}</span></div>
        </div>
        <div class="profile-card">
          <div class="profile-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            Study Subjects
          </div>
          <div class="subject-tags">
            ${(user.subjects||[]).length
              ? user.subjects.map(s=>`<span class="subject-tag">${escHtml(s)}</span>`).join('')
              : '<span style="font-size:.86rem;color:var(--text-light)">No subjects added yet.</span>'}
          </div>
        </div>
      </div>

      <!-- XP / Streak card (populated by _renderXpCard) -->
      <div id="profile-xp-card"></div>

      <!-- Creator Store (only if creator) — own profile view -->
      ${isCreator ? `
      <div style="margin-top:24px">
        <div class="profile-posts-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          My Store
          <button class="profile-hub-btn" id="mp-store-edit-btn" style="margin-left:auto;font-size:.75rem;padding:5px 12px" onclick="toggleStoreEditMode()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
            Edit Store
          </button>
        </div>
        <div style="display:flex;gap:0;border-bottom:1px solid var(--border-panel);margin:8px 0 16px">
          <button class="creator-tab active" id="mp-tab-products"      onclick="switchMpTab('products')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>Products</button>
          <button class="creator-tab"       id="mp-tab-subscriptions" onclick="switchMpTab('subscriptions')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>Subscriptions</button>
          <button class="creator-tab"       id="mp-tab-quizzes"       onclick="switchMpTab('quizzes')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Quizzes</button>
        </div>
        <div id="mp-panel-products">     <div class="profile-loading">Loading…</div></div>
        <div id="mp-panel-subscriptions" style="display:none"><div class="profile-loading">Loading…</div></div>
        <div id="mp-panel-quizzes"       style="display:none"><div class="profile-loading">Loading…</div></div>
      </div>` : ''}

      <!-- My Posts — full feed cards -->
      <div style="margin-top:24px">
        <div class="profile-posts-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          My Posts
        </div>
        <div id="profile-my-posts" style="display:flex;flex-direction:column;gap:14px">
          <div style="text-align:center;padding:32px;color:var(--text-light);font-size:.88rem">Loading posts…</div>
        </div>
      </div>

    </div>`;

  _loadMyStats(user);
  _renderProfileFeed(user.email, 'profile-my-posts');
  if (isCreator) {
    _loadMpStore(user);
  }
}

/* ──────────────────────────────────────────────────────────
   MY PROFILE — STORE TABS
──────────────────────────────────────────────────────────── */
function switchMpTab(tab) {
  ['products','subscriptions','quizzes'].forEach(t => {
    const btn   = document.getElementById(`mp-tab-${t}`);
    const panel = document.getElementById(`mp-panel-${t}`);
    if (btn)   btn.classList.toggle('active', t===tab);
    if (panel) panel.style.display = t===tab ? '' : 'none';
  });
}

async function _loadMpStore(user) {
  _loadMpProducts(user);
  _loadMpSubs(user);
  _loadMpQuizzes(user);
}

window._mpStoreEditMode = false;

function toggleStoreEditMode() {
  window._mpStoreEditMode = !window._mpStoreEditMode;
  const btn = document.getElementById('mp-store-edit-btn');
  if (btn) {
    btn.style.borderColor = window._mpStoreEditMode ? '#ef4444' : '';
    btn.style.color       = window._mpStoreEditMode ? '#ef4444' : '';
    btn.innerHTML = window._mpStoreEditMode
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Done`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg> Edit Store`;
  }
  const user = window._currentProfileUser || currentUser;
  _loadMpProducts(user);
  _loadMpQuizzes(user);
}

async function unpublishFromStore(id, type) {
  try {
    const table = type === 'quiz' ? 'quizzes' : 'products';
    await sb.from(table).update({ profile_visible: false }).eq('id', id);
    showToast('Removed from store.');
    const user = window._currentProfileUser || currentUser;
    if (type === 'quiz') _loadMpQuizzes(user);
    else _loadMpProducts(user);
  } catch(e) {
    console.error('unpublishFromStore:', e);
    showToast('Could not remove. Please try again.');
  }
}

async function _loadMpProducts(user) {
  const el = document.getElementById('mp-panel-products');
  if (!el) return;
  const editMode = window._mpStoreEditMode;
  try {
    const allProducts = await loadProducts();
    const data = allProducts.filter(p => p.creatorEmail === user.email && p.profileVisible);
    const creatorProductIds = data.map(p => p.id);
    const { data: purchaseRows } = creatorProductIds.length
      ? await sb.from('purchases').select('product_id').in('product_id', creatorProductIds)
      : { data: [] };
    const allPurchases = (purchaseRows || []).map(r => ({ productId: r.product_id }));
    if (!data.length) {
      el.innerHTML = `<div class="creator-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg><p>No products published yet. Use Publish in the Creator Hub.</p></div>`;
      return;
    }
    const purchaseCountMap = {};
    allPurchases.forEach(pur => {
      if (data.some(p => p.id === pur.productId)) {
        purchaseCountMap[pur.productId] = (purchaseCountMap[pur.productId] || 0) + 1;
      }
    });
    el.innerHTML = `<div class="creator-products-grid">${data.map(p => {
      const count  = purchaseCountMap[p.id] || 0;
      const earned = count * (p.price || 0);
      const typeIcons  = { notes:'📄', guide:'📘', cheatsheet:'⚡', flashcards:'🗂️', template:'📋', slides:'📊' };
      const typeLabels = { notes:'Notes', guide:'Guide', cheatsheet:'Cheat Sheet', flashcards:'Flashcards', template:'Template', slides:'Slides' };
      const ptype     = (p.type || 'notes').toLowerCase();
      const icon      = typeIcons[ptype] || '📄';
      const typeLabel = typeLabels[ptype] || escHtml(p.type || 'Study Material');
      const isFree    = !p.price || p.price === 0;
      const priceBadge = isFree
        ? `<span class="cp-price-badge cp-price-free">Free</span>`
        : `<span class="cp-price-badge cp-price-paid" title="₱${escHtml(String(p.price))}">₱${escHtml(String(p.price))}</span>`;
      return `
      <div class="cp-card cp-card--${ptype} mp-store-card ${editMode ? 'mp-edit-active' : ''}">
        ${editMode ? `<button class="mp-store-remove-btn" onclick="unpublishFromStore('${escHtml(p.id)}','product')" title="Remove from store"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}
        <div class="cp-band cp-band--${ptype}">
          <span class="cp-band-icon">${icon}</span>
          <div class="cp-band-meta">
            <span class="cp-type-badge">${typeLabel}</span>
            ${priceBadge}
          </div>
        </div>
        <div class="cp-body">
          <h4 class="cp-title" title="${escHtml(p.title||'Untitled')}">${escHtml(p.title||'Untitled')}</h4>
          <p class="cp-desc">${escHtml(p.description||'')}</p>
        </div>
        <div class="cp-foot">
          <div class="cp-stats">
            <span class="cp-stat">
              <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              ${count} sale${count!==1?'s':''}
            </span>
            ${p.price > 0 ? `<div class="cp-stat-div"></div><span class="cp-stat">₱${earned.toLocaleString()} earned</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('')}</div>`;
  } catch(e) {
    if (el) el.innerHTML = `<div class="creator-empty"><p>Could not load products.</p></div>`;
  }
}

/* FIX 1 — _loadMpSubs: uses getCreatorSubscription (single source of truth)
   instead of the old loadSubscriptionTiers filter+sort chain. */
async function _loadMpSubs(user) {
  const el = document.getElementById('mp-panel-subscriptions');
  if (!el) return;
  try {
    const sub = await getCreatorSubscription(user.email);

    if (!sub) {
      el.innerHTML = `<div class="creator-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>No subscription set up yet. <a onclick="appNav('creator')" style="color:var(--purple-bright);cursor:pointer;font-weight:600">Set it up in Creator Hub →</a></p></div>`;
      return;
    }

    const perks = sub.perks ? sub.perks.split(',').map(p => p.trim()).filter(Boolean) : [];
    el.innerHTML = `
      <div class="vp-sub-card">
        <div class="vp-sub-card-glow"></div>
        <div class="vp-sub-card-inner">
          <div class="vp-sub-head"><div class="vp-sub-icon">⭐</div><div><div class="vp-sub-name">${escHtml(sub.name||'Subscription')}</div>${sub.description?`<div class="vp-sub-desc">${escHtml(sub.description)}</div>`:''}</div></div>
          <div class="vp-sub-price-row"><span class="vp-sub-price">₱${(sub.price||0).toLocaleString()}</span><span class="vp-sub-period">/ month</span></div>
          ${perks.length?`<ul class="vp-sub-perks">${perks.map(pk=>`<li class="vp-sub-perk-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13" class="vp-sub-check"><polyline points="20 6 9 17 4 12"/></svg>${escHtml(pk)}</li>`).join('')}</ul>`:''}
        </div>
      </div>`;
  } catch(e) {
    console.error('_loadMpSubs:', e);
    if (el) el.innerHTML = `<div class="creator-empty"><p>Could not load subscription.</p></div>`;
  }
}

async function _loadMpQuizzes(user) {
  const el = document.getElementById('mp-panel-quizzes');
  if (!el) return;
  const editMode = window._mpStoreEditMode;
  try {
    const allQuizzes = await loadQuizzes();
    const quizzes = allQuizzes.filter(q => q.creatorEmail === user.email && q.profileVisible);
    if (!quizzes.length) {
      el.innerHTML = `<div class="creator-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><p>No quizzes published yet.</p></div>`;
      return;
    }
    el.innerHTML = `<div class="vp-quiz-list">${quizzes.map(q=>{
      const qCount = Array.isArray(q.questions) ? q.questions.length : 0;
      const isPaid = q.access === 'paid' || q.access === 'subscription';
      return `
      <div class="vp-quiz-card mp-store-card ${editMode ? 'mp-edit-active' : ''}">
        ${editMode ? `
        <button class="mp-store-remove-btn" onclick="unpublishFromStore('${escHtml(q.id)}','quiz')" title="Remove from store">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>` : ''}
        <div class="vp-quiz-left">
          <div class="vp-quiz-icon">🧠</div>
          <div class="vp-quiz-info">
            <div class="vp-quiz-title">${escHtml(q.title||'Quiz')}</div>
            <div class="vp-quiz-meta">
              ${q.subject ? `<span class="vp-quiz-tag vp-tag-subject">${escHtml(q.subject)}</span>` : ''}
              <span class="vp-quiz-stat">${qCount} Q${qCount!==1?'s':''}</span>
              <span class="vp-quiz-tag ${isPaid ? 'vp-tag-paid' : 'vp-tag-free'}">${isPaid ? '🔒 Subscribers' : '🌐 Free'}</span>
            </div>
          </div>
        </div>
        <div class="vp-quiz-cta">
          <button class="vp-quiz-btn" onclick="(async()=>{
            appNav('creator');
            await new Promise(r=>setTimeout(r,350));
            if(typeof switchCreatorTab==='function') switchCreatorTab('quizzes');
            await new Promise(r=>setTimeout(r,120));
            if(typeof openQuizEditor==='function') openQuizEditor('${escHtml(q.id)}');
          })()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
            Edit
          </button>
        </div>
      </div>`;
    }).join('')}</div>`;
  } catch(e) {
    if (el) el.innerHTML = `<div class="creator-empty"><p>Could not load quizzes.</p></div>`;
  }
}

async function _loadMyStats(user) {
  try {
    const posts   = (await loadPosts()).filter(p=>p.authorEmail===user.email);
    const matches = (await loadMatches()).filter(m=>(m.from===user.email||m.to===user.email)&&m.status==='accepted');
    const p=document.getElementById('pstat-posts');    if(p) p.textContent=posts.length;
    const m=document.getElementById('pstat-matches');  if(m) m.textContent=matches.length;
    /* streak from localStorage (set by quiz player) */
    const streak = parseInt(localStorage.getItem('studybuddy_streak')||'0',10);
    const s=document.getElementById('pstat-streak'); if(s) s.textContent=streak||'—';
    _renderXpCard(user);
  } catch(e){}
}

/* ──────────────────────────────────────────────────────────
   XP / STREAK CARD — injected into own profile
──────────────────────────────────────────────────────────── */
function _renderXpCard(user) {
  const wrap = document.getElementById('profile-xp-card');
  if (!wrap) return;

  /* Read from localStorage (written by quiz player) */
  let xp     = 0, streak = 0, lastDate = '', bestQuizzes = [];
  try {
    xp     = parseInt(localStorage.getItem('studybuddy_xp')||'0', 10);
    streak = parseInt(localStorage.getItem('studybuddy_streak')||'0', 10);
    lastDate= localStorage.getItem('studybuddy_streak_last')||'';
    /* collect personal bests from all quiz keys */
    for (let i=0; i<localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('qbest_')) {
        try {
          const v = JSON.parse(localStorage.getItem(k)||'null');
          if (v) bestQuizzes.push({ title: k.replace('qbest_',''), ...v });
        } catch(e){}
      }
    }
    bestQuizzes.sort((a,b)=>b.pct-a.pct);
  } catch(e){}

  /* XP levels */
  const LEVELS = [
    { name:'Newcomer',  xp:0    },
    { name:'Learner',   xp:200  },
    { name:'Scholar',   xp:500  },
    { name:'Expert',    xp:1000 },
    { name:'Master',    xp:2000 },
    { name:'Legend',    xp:4000 },
  ];
  let lvl = LEVELS[0], nextLvl = LEVELS[1];
  for (let i=0; i<LEVELS.length; i++) {
    if (xp >= LEVELS[i].xp) { lvl=LEVELS[i]; nextLvl=LEVELS[i+1]||null; }
  }
  const pct  = nextLvl ? Math.min(100, Math.round(((xp-lvl.xp)/(nextLvl.xp-lvl.xp))*100)) : 100;
  const lvlN = LEVELS.indexOf(lvl)+1;

  /* Week dots */
  const today = new Date();
  const weekDots = ['M','T','W','T','F','S','S'].map((d, i) => {
    const dayDate = new Date(today);
    dayDate.setDate(today.getDate() - ((today.getDay()||7)-1) + i);
    const isToday = dayDate.toDateString() === today.toDateString();
    const isDone  = lastDate && new Date(lastDate) >= dayDate && !isToday;
    const bg   = isToday ? 'var(--purple-bright)' : isDone ? 'var(--accent)' : 'var(--bg-page)';
    const bdr  = isToday ? 'var(--purple-bright)' : isDone ? 'var(--purple-glow)' : 'var(--border-card)';
    const col  = isToday ? '#fff' : isDone ? 'var(--purple-mid)' : 'var(--text-light)';
    return `<div style="width:30px;height:30px;border-radius:50%;background:${bg};border:1px solid ${bdr};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:${col};">${d}</div>`;
  }).join('');

  /* Recent best quizzes */
  const recentHTML = bestQuizzes.slice(0,3).map(b => {
    const col = b.pct>=80?'#16a34a':b.pct>=50?'#92400e':'#dc2626';
    const bg  = b.pct>=80?'#f0fdf4':b.pct>=50?'#fffbeb':'#fef2f2';
    const bdr = b.pct>=80?'#86efac':b.pct>=50?'#fde68a':'#fca5a5';
    const xpE = Math.round(b.score * 20);
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--bg-page);border:1px solid var(--border-card);border-radius:11px;">
      <div style="width:34px;height:34px;border-radius:50%;background:${bg};border:1px solid ${bdr};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${col};flex-shrink:0;">${b.pct}%</div>
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${escHtml(b.title)}</div>
        <div style="font-size:11px;color:var(--text-light);">${b.score}/${b.total} correct</div>
      </div>
      <div style="margin-left:auto;background:var(--accent);color:var(--purple-mid);padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;">+${xpE} XP</div>
    </div>`;
  }).join('') || `<div style="font-size:.86rem;color:var(--text-light);padding:8px 0;">No quizzes taken yet — take one to start earning XP!</div>`;

  if (!xp && !streak && !bestQuizzes.length) { wrap.innerHTML=''; return; }

  wrap.innerHTML = `
    <div style="margin-top:16px;">
      <div class="profile-card">
        <div class="profile-card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Quiz Progress
        </div>

        <!-- Level + XP bar -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:.86rem;font-weight:600;color:var(--text-primary);">Level ${lvlN} — ${lvl.name}</span>
          <span style="background:var(--accent);color:var(--purple-mid);padding:2px 10px;border-radius:20px;font-size:.72rem;font-weight:700;">${xp.toLocaleString()} XP</span>
        </div>
        <div style="background:var(--border-input);border-radius:4px;height:8px;margin-bottom:6px;">
          <div style="background:var(--purple-bright);border-radius:4px;height:8px;width:${pct}%;transition:width .4s ease;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--text-light);margin-bottom:18px;">
          <span>${xp.toLocaleString()} XP</span>
          <span>${nextLvl ? nextLvl.xp.toLocaleString()+' XP to Level '+(lvlN+1) : 'Max level reached!'}</span>
        </div>

        <!-- Streak + this week -->
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <div style="flex:1;background:var(--bg-panel);border:1px solid var(--border-card);border-radius:11px;padding:12px;text-align:center;">
            <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;color:var(--purple-bright);line-height:1;">${streak}🔥</div>
            <div style="font-size:.72rem;color:var(--text-light);margin-top:4px;">Day streak</div>
          </div>
          <div style="flex:2;background:var(--bg-panel);border:1px solid var(--border-card);border-radius:11px;padding:12px;">
            <div style="font-size:.72rem;color:var(--text-light);margin-bottom:8px;">This week</div>
            <div style="display:flex;gap:5px;">${weekDots}</div>
          </div>
        </div>

        <!-- Recent quizzes -->
        <div style="font-size:.72rem;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Recent quizzes</div>
        <div style="display:flex;flex-direction:column;gap:7px;">${recentHTML}</div>
      </div>
    </div>`;
}
async function renderViewProfile(user) {
  const section = document.getElementById('app-viewprofile');
  if (!section) return;

  window._viewingUser = user;

  const initial   = (user.name||user.email||'?')[0].toUpperCase();
  const color     = avatarColor(user);
  const isCreator = user.isCreator || false;

  // Existing match status
  let matchStatus = 'none';
  if (currentUser) {
    const matches = await loadMatches();
    const m = matches.find(mx =>
      (mx.from===currentUser.email&&mx.to===user.email) ||
      (mx.from===user.email&&mx.to===currentUser.email)
    );
    if (m) {
      if (m.status === 'accepted') {
        matchStatus = 'connected';
      } else if (m.from === currentUser.email) {
        matchStatus = 'sent';      // current user sent the request
      } else {
        matchStatus = 'received';  // current user received the request
      }
    }
  }

  const connectBtn = matchStatus==='connected'
    ? `<button class="profile-match-btn sent" disabled>✓ Connected</button>`
    : matchStatus==='sent'
    ? `<button class="profile-match-btn sent" disabled>⏳ Request Sent</button>`
    : matchStatus==='received'
    ? `<button class="profile-match-btn sent" disabled>⏳ Pending</button>`
    : `<button class="profile-match-btn" id="vp-connect-btn" onclick="connectFromViewProfile('${escHtml(user.email)}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        Add Buddy
       </button>`;

  const messageBtn = matchStatus==='connected'
    ? `<button class="profile-edit-btn" onclick="openMessagesWith('${escHtml(user.email)}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Message
       </button>` : '';

  section.innerHTML = `
    <div class="profile-page">

      <button class="back-btn" id="vp-back-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>

      <div class="profile-banner"><div class="profile-banner-pattern"></div></div>

      <div class="profile-identity">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar-large" style="background:${color}">${escHtml(initial)}</div>
        </div>
        <div class="profile-identity-main">
          <div>
            <div class="profile-name-row">
              <h2 class="profile-name">${escHtml(user.name||'Student')}</h2>
              ${isCreator?`<span class="creator-badge">✦ Creator</span>`:''}
            </div>
            <div class="profile-handle">@${escHtml((user.name||'user').toLowerCase().replace(/\s+/g,''))} · Student</div>
            <p class="profile-bio-text">${escHtml(user.bio||"This student hasn't added a bio yet.")}</p>
          </div>
          <div class="profile-action-group" style="flex-direction:row;flex-wrap:wrap;align-items:flex-start;gap:8px">
            ${connectBtn}${messageBtn}
          </div>
        </div>
      </div>

      <!-- Stats strip -->
      <div class="profile-stats-strip">
        <div class="profile-stat-item">
          <div class="profile-stat-val" id="vp-stat-posts">—</div>
          <div class="profile-stat-label">Posts</div>
        </div>
        <div class="profile-stat-item">
          <div class="profile-stat-val">${(user.subjects||[]).length||'—'}</div>
          <div class="profile-stat-label">Subjects</div>
        </div>
      </div>

      <!-- Info cards -->
      <div class="profile-body">
        <div class="profile-card">
          <div class="profile-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="8" r="4"/><path d="M6 20v-1a6 6 0 0 1 12 0v1"/></svg>
            About
          </div>
          <div class="profile-info-row"><span class="profile-info-label">Course</span><span class="profile-info-value">${escHtml(user.headline||'—')}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Schedule</span><span class="profile-info-value">${escHtml(user.schedule||'—')}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Study Style</span><span class="profile-info-value">${escHtml(user.style||'—')}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Location</span><span class="profile-info-value">${escHtml(user.location||'—')}</span></div>
        </div>
        <div class="profile-card">
          <div class="profile-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            Subjects
          </div>
          <div class="subject-tags">
            ${(user.subjects||[]).length
              ? user.subjects.map(s=>`<span class="subject-tag">${escHtml(s)}</span>`).join('')
              : '<span style="font-size:.86rem;color:var(--text-light)">No subjects listed.</span>'}
          </div>
        </div>
      </div>

      <!-- Creator Store (only if creator) -->
      ${isCreator ? `
      <div style="margin-top:24px">
        <div class="profile-posts-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          ${escHtml(user.creatorBrand || (user.name+"'s"))} Store
        </div>
        <div style="display:flex;gap:0;border-bottom:1px solid var(--border-panel);margin:8px 0 16px">
          <button class="creator-tab active" id="vp-tab-products"       onclick="switchVpTab('products')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>Products</button>
          <button class="creator-tab"        id="vp-tab-subscriptions"  onclick="switchVpTab('subscriptions')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>Subscribe</button>
          <button class="creator-tab"        id="vp-tab-quizzes"        onclick="switchVpTab('quizzes')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Quizzes</button>
        </div>
        <div id="vp-panel-products">      <div class="profile-loading">Loading…</div></div>
        <div id="vp-panel-subscriptions"  style="display:none"><div class="profile-loading">Loading…</div></div>
        <div id="vp-panel-quizzes"        style="display:none"><div class="profile-loading">Loading…</div></div>
      </div>` : ''}

      <!-- Posts by this user — full feed cards -->
      <div style="margin-top:24px">
        <div class="profile-posts-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Posts by ${escHtml((user.name||'this student').split(' ')[0])}
        </div>
        <div id="vp-posts-feed" style="display:flex;flex-direction:column;gap:14px">
          <div style="text-align:center;padding:32px;color:var(--text-light);font-size:.88rem">Loading posts…</div>
        </div>
      </div>

    </div>`;

  // Navigate to section
  appNav('viewprofile');

  // Wire back button
  document.getElementById('vp-back-btn').onclick = () => {
    const ret = window._vpReturnTo || 'feed';
    window._vpReturnTo = null;
    appNav(ret);
  };

  // Load data
  _loadVpStats(user);
  _renderProfileFeed(user.email, 'vp-posts-feed');
  if (isCreator) {
    _loadVpStore(user);
  }
}

async function _loadVpStats(user) {
  try {
    const posts = (await loadPosts()).filter(p=>p.authorEmail===user.email);
    const el = document.getElementById('vp-stat-posts');
    if (el) el.textContent = posts.length;
  } catch(e){}
}

/* ──────────────────────────────────────────────────────────
   SHARED: render profile posts as full feed cards
──────────────────────────────────────────────────────────── */
async function _renderProfileFeed(authorEmail, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const allPosts = await loadPosts();
    const posts = allPosts
      .filter(p => p.authorEmail === authorEmail)
      .sort((a,b) => (b.ts||b.timestamp||0) - (a.ts||a.timestamp||0));

    if (!posts.length) {
      container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-light);font-size:.88rem;border:1.5px dashed var(--border-panel);border-radius:14px">No posts yet.</div>`;
      return;
    }

    const accounts = await loadAccounts();

    const [savedArr, allComments, allJoinReqs, allSessions] = await Promise.all([
      loadSaved(), loadComments(), loadJoinRequests(), loadRooms(),
    ]);

    const savedSetFinal = (savedArr && typeof savedArr==='object' && !Array.isArray(savedArr))
      ? new Set(Object.keys(savedArr).filter(k=>savedArr[k]))
      : new Set(Array.isArray(savedArr)?savedArr:[]);

    const commentMap = {};
    if (Array.isArray(allComments)) {
      allComments.forEach(c => { if(!commentMap[c.postId]) commentMap[c.postId]=[]; commentMap[c.postId].push(c); });
    } else if (typeof allComments==='object') { Object.assign(commentMap, allComments); }

    const joinReqMap = {};
    if (currentUser) {
      allJoinReqs.filter(r=>r.requesterEmail===currentUser.email).forEach(r=>{ joinReqMap[r.postId]=r; });
    }

    const sessionMap = {};
    allSessions.forEach(s=>{ if(s.postId) sessionMap[s.postId]=s; });

    const participantSet = new Set();
    if (currentUser) {
      allSessions.forEach(s=>{ if(s.postId&&(s.participants||[]).includes(currentUser.email)) participantSet.add(s.postId); });
    }

    const matchMap = {};
    if (currentUser) {
      const myMatches = await loadMatches();
      myMatches.forEach(m=>{ if(m.from===currentUser.email) matchMap[m.to]=m; if(m.to===currentUser.email) matchMap[m.from]=m; });
    }

    const accountsMap = {};
    accounts.forEach(a=>{ accountsMap[a.email]=a; accountsMap[a.email.toLowerCase()]=a; });

    const creatorCardMap = {};
    await Promise.all(posts.filter(p=>p.postType&&p.linkedItemId).map(async p=>{
      try { creatorCardMap[p.id] = await buildCreatorPostCardHTML(p); } catch(_){}
    }));

    const ctx = { savedSet:savedSetFinal, commentMap, joinReqMap, sessionMap, participantSet, joinReqs:allJoinReqs, matchMap, creatorCardMap, accountsMap };

    container.innerHTML = posts.map(p => buildPostHTML(p, accounts, ctx)).join('');

  } catch(e) {
    const c = document.getElementById(containerId);
    if (c) c.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-light);font-size:.86rem">Could not load posts.</div>`;
  }
}

/* ──────────────────────────────────────────────────────────
   CREATOR STORE (view profile)
──────────────────────────────────────────────────────────── */
function switchVpTab(tab) {
  ['products','subscriptions','quizzes'].forEach(t => {
    const btn   = document.getElementById(`vp-tab-${t}`);
    const panel = document.getElementById(`vp-panel-${t}`);
    if (btn)   btn.classList.toggle('active', t===tab);
    if (panel) panel.style.display = t===tab ? '' : 'none';
  });
}

async function _loadVpStore(user) {
  _loadVpProducts(user);
  _loadVpSubs(user);
  _loadVpQuizzes(user);
}

async function _loadVpProducts(user) {
  const el = document.getElementById('vp-panel-products');
  if (!el) return;
  try {
    const allProducts = await loadProducts();
    let purchasedIds = new Set();
    if (currentUser) {
      const { data: purRows } = await sb.from('purchases').select('product_id').eq('user_email', currentUser.email);
      purchasedIds = new Set((purRows || []).map(r => r.product_id));
    }
    const data = allProducts.filter(p => p.creatorEmail === user.email && p.profileVisible);

    if (!data || !data.length) {
      el.innerHTML = `<div class="creator-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg><p>No products yet.</p></div>`;
      return;
    }
    el.innerHTML = `<div class="creator-products-grid">${data.map(p => {
      const typeIcons  = { notes:'📄', guide:'📘', cheatsheet:'⚡', flashcards:'🗂️', template:'📋', slides:'📊' };
      const typeLabels = { notes:'Notes', guide:'Guide', cheatsheet:'Cheat Sheet', flashcards:'Flashcards', template:'Template', slides:'Slides' };
      const ptype      = (p.type || 'notes').toLowerCase();
      const icon       = typeIcons[ptype]  || '📦';
      const typeLabel  = typeLabels[ptype] || (p.type || 'Product');
      const isFree     = !p.price || p.price === 0;
      const owned      = purchasedIds.has(p.id);
      const priceBadge = isFree
        ? `<span class="cp-price-badge cp-price-free">Free</span>`
        : `<span class="cp-price-badge cp-price-paid">₱${escHtml(String(p.price))}</span>`;
      const ctaLabel    = owned ? '✓ Purchased' : (p.price > 0 ? `Buy · ₱${p.price}` : 'Get Free');
      const ctaClass    = owned ? 'cp-btn-cta cp-btn-cta--owned' : 'cp-btn-cta';
      const ctaDisabled = owned ? 'disabled' : '';
      const ctaOnclick  = owned ? '' : `onclick="purchaseProduct('${escHtml(p.id||'')}','${escHtml(p.title||'')}',${p.price||0},this)"`;
      return `
      <div class="cp-card cp-card--${ptype}">
        <div class="cp-band cp-band--${ptype}">
          <span class="cp-band-icon">${icon}</span>
          <div class="cp-band-meta">
            <span class="cp-type-badge">${typeLabel}</span>
            ${priceBadge}
          </div>
        </div>
        <div class="cp-body">
          <h4 class="cp-title" title="${escHtml(p.title||'Untitled')}">${escHtml(p.title||'Untitled')}</h4>
          <p class="cp-desc">${escHtml(p.description||'No description provided.')}</p>
        </div>
        <div class="cp-foot">
          ${p.subject ? `<div class="cp-stats"><span class="cp-stat">${escHtml(p.subject)}</span></div>` : ''}
          <div class="cp-actions">
            <button class="${ctaClass}" style="flex:1" ${ctaOnclick} ${ctaDisabled}>${ctaLabel}</button>
          </div>
        </div>
      </div>`;
    }).join('')}</div>`;
  } catch(e) {
    if (el) el.innerHTML = `<div class="creator-empty"><p>Could not load products.</p></div>`;
  }
}

/* FIX 2 — _loadVpSubs: uses getCreatorSubscription directly.
   sub + subscribed are fetched in parallel to halve latency.
   subscribeTo receives sub.id (always current) so no stale id issues. */
async function _loadVpSubs(user) {
  const el = document.getElementById('vp-panel-subscriptions');
  if (!el) return;
  try {
    const [sub, subscribed] = await Promise.all([
      getCreatorSubscription(user.email),
      currentUser ? _vpIsSubscribedTo(user.email) : Promise.resolve(false),
    ]);

    if (!sub) {
      el.innerHTML = `<div class="creator-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>No subscription available yet.</p></div>`;
      return;
    }

    const perks = sub.perks ? sub.perks.split(',').map(p => p.trim()).filter(Boolean) : [];
    el.innerHTML = `
      <div class="vp-sub-card">
        <div class="vp-sub-card-glow"></div>
        <div class="vp-sub-card-inner">
          <div class="vp-sub-head"><div class="vp-sub-icon">⭐</div><div><div class="vp-sub-name">${escHtml(sub.name||'Subscription')}</div>${sub.description?`<div class="vp-sub-desc">${escHtml(sub.description)}</div>`:''}</div></div>
          <div class="vp-sub-price-row"><span class="vp-sub-price">₱${(sub.price||0).toLocaleString()}</span><span class="vp-sub-period">/ month</span></div>
          ${perks.length?`<ul class="vp-sub-perks">${perks.map(pk=>`<li class="vp-sub-perk-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13" class="vp-sub-check"><polyline points="20 6 9 17 4 12"/></svg>${escHtml(pk)}</li>`).join('')}</ul>`:''}
          <button class="vp-sub-btn ${subscribed?'subscribed':''}" onclick="subscribeTo('${escHtml(sub.id||'')}','${escHtml(user.email)}',${sub.price||0},this)" ${subscribed?'disabled':''}>
            ${subscribed?'✓ Subscribed':'Subscribe · ₱'+(sub.price||0).toLocaleString()+'/mo'}
          </button>
          ${subscribed?`<button class="vp-unsub-btn" onclick="cancelSubscription('${escHtml(user.email)}',this)">Cancel Subscription</button>`:''}
        </div>
      </div>`;
  } catch(e) {
    console.error('_loadVpSubs:', e);
    if (el) el.innerHTML = `<div class="creator-empty"><p>Could not load subscription.</p></div>`;
  }
}

async function _loadVpQuizzes(user) {
  const el = document.getElementById('vp-panel-quizzes');
  if (!el) return;
  try {
    const allQuizzes = await loadQuizzes();
    const quizzes = allQuizzes.filter(q => q.creatorEmail === user.email && q.profileVisible);

    // Check if current user is subscribed (paid quizzes need subscription)
    const subscribed = currentUser ? await _vpIsSubscribedTo(user.email) : false;

    if (!quizzes || !quizzes.length) {
      el.innerHTML = `<div class="creator-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><p>No quizzes available yet.</p></div>`;
      return;
    }
    el.innerHTML = `<div class="vp-quiz-list">${quizzes.map(q => {
      const access    = q.access || 'free';
      const price     = Number(q.price) || 0;
      const isFree    = access === 'free';
      const isSubOnly = access === 'subscription' || access === 'paid';
      const isPriced  = access === 'priced';
      const qCount    = Array.isArray(q.questions) ? q.questions.length : 0;
      const lockIcon  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

      // Determine if user can take the quiz
      const canTake = isFree || subscribed && isSubOnly || false;
      // (priced is always gated — openPublicQuiz handles the purchase check)

      // Access badge
      let badge = '';
      if (isFree)         badge = `<span class="vp-quiz-tag vp-tag-free">🌐 Free</span>`;
      else if (isSubOnly) badge = `<span class="vp-quiz-tag vp-tag-paid">🔒 Subscribers</span>`;
      else if (isPriced)  badge = `<span class="vp-quiz-tag vp-tag-priced">💰 ₱${price.toLocaleString()}</span>`;

      // CTA button
      let btn = '';
      if (isFree || (isSubOnly && subscribed)) {
        btn = `<button class="vp-quiz-btn" onclick="openPublicQuiz('${escHtml(q.id||'')}','${escHtml(user.email)}')">Take Quiz</button>`;
      } else if (isSubOnly) {
        btn = `<button class="vp-quiz-btn vp-quiz-btn-locked" onclick="openQuizPaywall('${escHtml(q.id||'')}','${escHtml(q.title||'')}',${qCount},'${escHtml(user.email)}')">🔒 Subscribe</button>`;
      } else if (isPriced) {
        btn = `<button class="vp-quiz-btn" onclick="openPublicQuiz('${escHtml(q.id||'')}','${escHtml(user.email)}')">💰 Unlock · ₱${price.toLocaleString()}</button>`;
      }

      return `
      <div class="vp-quiz-card">
        <div class="vp-quiz-left"><div class="vp-quiz-icon">🧠</div><div class="vp-quiz-info"><div class="vp-quiz-title">${escHtml(q.title||'Quiz')}</div><div class="vp-quiz-meta">${q.subject?`<span class="vp-quiz-tag vp-tag-subject">${escHtml(q.subject)}</span>`:''}<span class="vp-quiz-stat">${qCount} Q${qCount!==1?'s':''}</span>${badge}</div></div></div>
        <div class="vp-quiz-cta">${btn}</div>
      </div>`;
    }).join('')}</div>`;
  } catch(e) {
    if (el) el.innerHTML = `<div class="creator-empty"><p>Could not load quizzes.</p></div>`;
  }
}

/* ──────────────────────────────────────────────────────────
   STORE ACTIONS
──────────────────────────────────────────────────────────── */
function purchaseProduct(id, title, price, btnEl) {
  if (!currentUser) { showToast('Please log in first.'); return; }
  if (price === 0) {
    _recordFreePurchase(id, title, btnEl);
    return;
  }
  openCheckoutModal({
    type:        'product',
    id,
    title,
    price,
    label:       'One-time purchase',
    btnEl,
  });
}

/* FIX 3 — subscribeTo: getCreatorSubscription replaces the
   loadSubscriptionTiers().find() name lookup.
   tierId param kept for backwards-compat but the live sub from DB
   is always used so a stale id never causes a wrong title in checkout. */
async function subscribeTo(tierId, creatorEmail, price, btnEl) {
  if (!currentUser) { showToast('Please log in first.'); return; }
  if (price === 0) {
    await _recordSubscription(tierId, creatorEmail, 0, btnEl);
    showToast('✓ Subscribed for free!');
    return;
  }
  // Get subscription name from DB for the checkout receipt
  const sub = await getCreatorSubscription(creatorEmail);
  openCheckoutModal({
    type:        'subscription',
    id:          sub?.id || tierId,
    title:       sub?.name || 'Subscription',
    price,
    label:       '/ month',
    creatorEmail,
    btnEl,
  });
}

async function openPublicQuiz(quizId, creatorEmail) {
  if (!currentUser) { showToast('Please log in to take this quiz.'); return; }

  const allQuizzes = await loadQuizzes();
  const quiz = allQuizzes.find(q => q.id === quizId);
  if (!quiz) { showToast('Quiz not found.'); return; }

  const access   = quiz.access || 'free';
  const price    = Number(quiz.price) || 0;
  const qCount   = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
  const isSubOnly = access === 'subscription' || access === 'paid';
  const isPriced  = access === 'priced';

  // Subscription-gated
  if (isSubOnly) {
    const subscribed = await _vpIsSubscribedTo(creatorEmail);
    if (!subscribed) {
      openQuizPaywall(quizId, quiz.title, qCount, creatorEmail);
      return;
    }
  }

  // Fixed-price gated
  if (isPriced) {
    const rows = await sbSelect('purchases', { user_email: currentUser.email, product_id: quizId });
    const hasPaid = rows.length > 0;
    if (!hasPaid) {
      openQuizPricePaywall(quizId, quiz.title, qCount, price, creatorEmail);
      return;
    }
  }

  // Access granted — launch player
  if (typeof launchQuizPlayer === 'function') {
    launchQuizPlayer(quiz, false);
  } else {
    showToast('Quiz player unavailable.');
  }
}

/* ── Fixed-price quiz paywall ── */
async function openQuizPricePaywall(quizId, quizTitle, questionCount, price, creatorEmail) {
  const existing = document.getElementById('quiz-paywall-modal');
  if (existing) existing.remove();

  const accounts    = await loadAccounts();
  const creator     = accounts.find(a => a.email === creatorEmail);
  const creatorName = creator ? creator.name : creatorEmail.split('@')[0];

  const modal = document.createElement('div');
  modal.id = 'quiz-paywall-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box qpw-box" onclick="event.stopPropagation()">
      <div class="qpw-header">
        <div class="qpw-lock-ring">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--purple-bright)" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 class="qpw-title">Unlock this Quiz</h3>
        <p class="qpw-sub">Pay a one-time fee to unlock <strong>${escHtml(quizTitle || 'this quiz')}</strong> by <strong>@${escHtml(creatorName.toLowerCase().replace(/\s+/g,''))}</strong>.</p>
      </div>
      <div class="qpw-quiz-card">
        <div class="qpw-quiz-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--purple-bright)" stroke-width="2" width="18" height="18">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div>
          <div class="qpw-quiz-name">${escHtml(quizTitle || 'Quiz')}</div>
          <div class="qpw-quiz-meta">${questionCount} question${questionCount !== 1 ? 's' : ''} · One-time unlock · ₱${Number(price).toLocaleString()}</div>
        </div>
      </div>
      <div class="qpw-actions">
        <button class="modal-cancel" onclick="closeQuizPaywall()">Maybe later</button>
        <button class="qpw-subscribe-btn"
          onclick="_confirmQuizPricePurchase('${escHtml(quizId)}','${escHtml(quizTitle||'')}',${price},'${escHtml(creatorEmail)}')">
          Unlock · &#8369;${Number(price).toLocaleString()}
        </button>
      </div>
    </div>`;

  modal.addEventListener('click', e => { if (e.target === modal) closeQuizPaywall(); });
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));
}

async function _confirmQuizPricePurchase(quizId, quizTitle, price, creatorEmail) {
  if (!currentUser) return;

  if (price <= 0) {
    // Free — record and open immediately
    await sbUpsert('purchases', {
      id: 'purch_quiz_' + Date.now(),
      user_email: currentUser.email,
      product_id: quizId,
      price: 0,
    }, 'id');
    closeQuizPaywall();
    await openPublicQuiz(quizId, creatorEmail);
    return;
  }

  openCheckoutModal({
    type:  'quiz',
    id:    quizId,
    title: quizTitle,
    price,
    label: 'One-time quiz unlock',
    creatorEmail,
    onSuccess: async () => {
      await sbUpsert('purchases', {
        id: 'purch_quiz_' + Date.now(),
        user_email: currentUser.email,
        product_id: quizId,
        price,
      }, 'id');
      closeQuizPaywall();
      await openPublicQuiz(quizId, creatorEmail);
    },
  });
}


/* ──────────────────────────────────────────────────────────
   QUIZ PAYWALL MODAL
   Shows subscription tiers and lets the user subscribe inline.
   Called when a non-subscriber clicks a paid quiz.
──────────────────────────────────────────────────────────── */
/* FIX 4 — openQuizPaywall: no tier picker, no hidden inputs, no selectPaywallTier.
   Shows the creator's single subscription plan. If none exists the
   subscribe button is disabled with an explanatory message. */
async function openQuizPaywall(quizId, quizTitle, questionCount, creatorEmail) {
  const existing = document.getElementById('quiz-paywall-modal');
  if (existing) existing.remove();

  // Fetch creator info + single sub in parallel
  const [accounts, sub] = await Promise.all([
    loadAccounts(),
    getCreatorSubscription(creatorEmail),
  ]);

  const creator     = accounts.find(a => a.email === creatorEmail);
  const creatorName = creator ? creator.name : creatorEmail.split('@')[0];

  // Single plan row — or a "no subscription" message
  const planHTML = sub
    ? `<div class="qpw-tier-row qpw-tier-rec">
         <div class="qpw-tier-left">
           <svg viewBox="0 0 24 24" fill="var(--purple-bright)" width="11" height="11">
             <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
           </svg>
           <span class="qpw-tier-name">${escHtml(sub.name || 'Subscription')}</span>
           ${sub.description ? `<span class="qpw-tier-desc">${escHtml(sub.description)}</span>` : ''}
         </div>
         <span class="qpw-tier-price">&#8369;${sub.price || 0}<span class="qpw-tier-period">/mo</span></span>
       </div>`
    : `<div style="font-size:.84rem;color:var(--text-light);text-align:center;padding:12px 0">
         This creator hasn't set up a subscription yet.
       </div>`;

  const modal = document.createElement('div');
  modal.id = 'quiz-paywall-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box qpw-box" onclick="event.stopPropagation()">

      <!-- Lock icon header -->
      <div class="qpw-header">
        <div class="qpw-lock-ring">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--purple-bright)" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h3 class="qpw-title">Subscribers only</h3>
        <p class="qpw-sub">Subscribe to <strong>@${escHtml(creatorName.toLowerCase().replace(/\s+/g,''))}</strong> to unlock this quiz and all premium content.</p>
      </div>

      <!-- Quiz info card -->
      <div class="qpw-quiz-card">
        <div class="qpw-quiz-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--purple-bright)" stroke-width="2"
               width="18" height="18">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div>
          <div class="qpw-quiz-name">${escHtml(quizTitle || 'Quiz')}</div>
          <div class="qpw-quiz-meta">${questionCount} question${questionCount !== 1 ? 's' : ''} · Subscribers only</div>
        </div>
        <div class="qpw-lock-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
      </div>

      <!-- Single plan display -->
      ${sub ? `<p class="qpw-tiers-label">Subscription plan</p>` : ''}
      <div class="qpw-tiers">${planHTML}</div>

      <!-- Actions -->
      <div class="qpw-actions">
        <button class="modal-cancel" onclick="closeQuizPaywall()">Maybe later</button>
        <button class="qpw-subscribe-btn"
          onclick="_confirmQuizPaywallSub('${escHtml(creatorEmail)}')"
          ${!sub ? 'disabled' : ''}>
          ${sub ? `Subscribe &middot; &#8369;${sub.price || 0}/mo` : 'No subscription available'}
        </button>
      </div>

    </div>`;

  modal.addEventListener('click', e => { if (e.target === modal) closeQuizPaywall(); });
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));
}

function closeQuizPaywall() {
  const modal = document.getElementById('quiz-paywall-modal');
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => modal.remove(), 220);
  }
}

/* FIX 5 — selectPaywallTier removed.
   Single-subscription model: no tier picker, nothing to select. */

/* FIX 6 — _confirmQuizPaywallSub: no hidden DOM inputs, no
   loadSubscriptionTiers().find(). Calls getCreatorSubscription
   for the live sub, handles free plans inline. */
async function _confirmQuizPaywallSub(creatorEmail) {
  closeQuizPaywall();

  const sub = await getCreatorSubscription(creatorEmail);
  if (!sub) { showToast("This creator hasn't set up a subscription yet."); return; }

  // Free subscription — record immediately, no checkout needed
  if (!sub.price || sub.price === 0) {
    await _recordSubscription(sub.id, creatorEmail, 0, null);
    showToast('✓ Subscribed for free!');
    return;
  }

  openCheckoutModal({
    type:        'subscription',
    id:          sub.id,
    title:       sub.name || 'Subscription',
    price:       sub.price,
    label:       '/ month',
    creatorEmail,
    btnEl:       null,
  });
}

/* ──────────────────────────────────────────────────────────
   CHECKOUT MODAL — one-click confirm (option 3)
   opts: { type, id, title, price, label, creatorEmail?, btnEl? }
──────────────────────────────────────────────────────────── */
function openCheckoutModal(opts) {
  // Remove any stale modal
  const old = document.getElementById('checkout-modal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'checkout-modal';
  modal.className = 'modal-overlay';

  const isSubscription = opts.type === 'subscription';
  const actionLabel = isSubscription ? `Subscribe · ₱${opts.price}/mo` : `Buy now · ₱${opts.price}`;

  modal.innerHTML = `
    <div class="modal-box" style="max-width:380px;text-align:left;padding:28px 28px 24px" onclick="event.stopPropagation()">

      <!-- Header -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--accent);border:1.5px solid var(--border-panel);
                    display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--purple-bright)" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div>
          <div style="font-family:var(--font-display);font-weight:800;font-size:1rem;color:var(--text-primary)">
            Secure checkout
          </div>
          <div style="font-size:.75rem;color:var(--text-light);margin-top:1px">Demo mode — no real payment</div>
        </div>
      </div>

      <!-- Receipt rows -->
      <div style="background:var(--bg-app);border:1px solid var(--border-card);border-radius:12px;
                  padding:14px 16px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;font-size:.82rem;padding:4px 0;
                    border-bottom:1px solid var(--border-card);margin-bottom:8px">
          <span style="color:var(--text-light)">${isSubscription ? 'Subscription' : 'Product'}</span>
          <span style="color:var(--text-primary);font-weight:600;font-family:var(--font-display);
                       max-width:180px;text-align:right;word-break:break-word">${escHtml(opts.title)}</span>
        </div>
        ${opts.creatorEmail ? `
        <div style="display:flex;justify-content:space-between;font-size:.82rem;padding:4px 0;
                    border-bottom:1px solid var(--border-card);margin-bottom:8px">
          <span style="color:var(--text-light)">Creator</span>
          <span style="color:var(--text-primary)">@${escHtml(opts.creatorEmail.split('@')[0])}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:baseline;
                    font-size:.82rem;padding:4px 0">
          <span style="color:var(--text-light)">${isSubscription ? 'Billed monthly' : 'One-time'}</span>
          <span style="font-family:var(--font-display);font-weight:800;font-size:1.05rem;
                       color:var(--purple-bright)">₱${opts.price}${isSubscription ? '<span style="font-size:.72rem;font-weight:400;color:var(--text-light)">/mo</span>' : ''}</span>
        </div>
      </div>

      <!-- Disclaimer -->
      <p style="font-size:.72rem;color:var(--text-light);text-align:center;margin:0 0 16px;line-height:1.5">
        This is a prototype. No real money is charged.
      </p>

      <!-- Actions -->
      <div style="display:flex;gap:10px">
        <button class="modal-cancel" style="flex:1" onclick="closeCheckoutModal()">Cancel</button>
        <button id="checkout-confirm-btn"
                style="flex:1.6;background:var(--purple-bright);color:#fff;border:2px solid var(--purple-bright);
                       border-radius:10px;padding:10px 18px;font-family:var(--font-display);font-size:.88rem;
                       font-weight:700;cursor:pointer;transition:background .18s,transform .15s"
                onclick="_confirmCheckout()">
          ${actionLabel}
        </button>
      </div>

    </div>`;

  // Store opts for the confirm handler
  modal._checkoutOpts = opts;
  modal.addEventListener('click', e => { if (e.target === modal) closeCheckoutModal(); });
  document.body.appendChild(modal);

  // Trigger open animation on next frame
  requestAnimationFrame(() => modal.classList.add('open'));
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => modal.remove(), 220);
  }
}

async function _confirmCheckout() {
  const modal = document.getElementById('checkout-modal');
  if (!modal) return;
  const opts = modal._checkoutOpts;

  // ── Spinner state ──
  const btn = document.getElementById('checkout-confirm-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:8px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" style="animation:spin .7s linear infinite">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83
                   M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        Processing…
      </span>`;
  }

  // Inject spin keyframe once
  if (!document.getElementById('checkout-spin-style')) {
    const s = document.createElement('style');
    s.id = 'checkout-spin-style';
    s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }

  // ── Fake processing delay ──
  await new Promise(r => setTimeout(r, 1500));

  try {
    if (opts.type === 'product') {
      await _recordPurchase(opts.id, opts.title, opts.price, opts.btnEl);
    } else if (opts.type === 'quiz') {
      // Quiz purchases are handled entirely by the caller's onSuccess callback
      // (cfPayForQuiz in creator-feed.js). Never route through _recordSubscription.
      if (typeof opts.onSuccess === 'function') await opts.onSuccess();
    } else {
      // subscription
      await _recordSubscription(opts.id, opts.creatorEmail, opts.price, opts.btnEl);
    }
    closeCheckoutModal();
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Try again';
    }
    showToast('Something went wrong. Please try again.');
  }
}

/* ──────────────────────────────────────────────────────────
   DB WRITES — product purchase
──────────────────────────────────────────────────────────── */
async function _recordFreePurchase(productId, title, btnEl) {
  await _recordPurchase(productId, title, 0, btnEl);
}

async function _recordPurchase(productId, title, price, btnEl) {
  if (!currentUser) return;

  // Write purchase record to Supabase
  const { error } = await sb.from('purchases').insert({
    id:           'pur_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    user_email:   currentUser.email,
    product_id:   productId,
    price:        Number(price) || 0,
    purchased_at: new Date().toISOString(),
  });
  if (error) {
    console.error('_recordPurchase:', error.message);
    showToast('Purchase could not be recorded. Please try again.');
    if (btnEl) { btnEl.disabled = false; }
    return;
  }

  // Optimistic UI — update the triggering button
  if (btnEl) {
    btnEl.textContent = '✓ Purchased';
    btnEl.classList.add('requested');
    btnEl.disabled = true;
  }

  showToast(price === 0 ? `✓ "${title}" added for free!` : `✓ "${title}" purchased!`);

  // Refresh creator stats if the creator is currently viewing their hub
  if (typeof loadCreatorStats === 'function' && currentUser) {
    loadCreatorStats(currentUser).catch(() => {});
  }
  if (typeof invalidateFeedCache === 'function') invalidateFeedCache();
}

/* ──────────────────────────────────────────────────────────
   DB WRITES — subscription
──────────────────────────────────────────────────────────── */
async function _recordSubscription(tierId, creatorEmail, price, btnEl) {
  if (!currentUser) return;

  // Guard: already subscribed?
  const existing = await loadUserSubs();
  if (existing.some(s => s.userEmail === currentUser.email && s.creatorEmail === creatorEmail)) {
    showToast('You are already subscribed!');
    return;
  }

  const newSub = {
    id:           'sub_' + Date.now(),
    userEmail:    currentUser.email,
    creatorEmail,
    tierId:       tierId || null,
    price:        price,
    since:        Date.now(),
  };
  existing.push(newSub);
  await saveUserSubs(existing);

  // Optimistic UI — update the triggering button
  if (btnEl) {
    btnEl.textContent = '✓ Subscribed';
    btnEl.classList.add('requested');
    btnEl.disabled = true;
  }

  showToast(`✓ Subscribed! ₱${price}/month`);

  // Refresh the feed so subscription CTAs update to "Subscribed" state
  if (typeof invalidateFeedCache === 'function') invalidateFeedCache();
  if (typeof renderFeed          === 'function') renderFeed();

  // Refresh creator stats so their revenue counter updates
  if (typeof loadCreatorStats === 'function' && currentUser) {
    loadCreatorStats(currentUser).catch(() => {});
  }
}

/* ──────────────────────────────────────────────────────────
   CONNECTIONS FROM VIEW PROFILE
──────────────────────────────────────────────────────────── */
async function connectFromViewProfile(toEmail) {
  if (!currentUser) return;
  const btn = document.getElementById('vp-connect-btn');
  if (btn) { btn.disabled=true; btn.style.opacity='.6'; }

  await sendMatchRequest(toEmail);

  if (btn) {
    btn.innerHTML = '⏳ Request Sent';
    btn.classList.add('sent');
    btn.disabled = true;
    btn.style.opacity = '1';
  }
}

async function openMessagesWith(email) {
  window._openChatWith = email;
  await appNav('messages');
  setTimeout(() => { if (typeof openChat === 'function') openChat(email); }, 300);
}

/* ──────────────────────────────────────────────────────────
   PROFILE EDIT MODAL
──────────────────────────────────────────────────────────── */
function openProfileEdit() {
  const user = window._profileUser || currentUser;
  if (!user) return;

  // Always rebuild so subject chips reflect the latest state
  const existing = document.getElementById('profile-edit-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'profile-edit-modal';
  modal.className = 'modal-overlay';

  modal.innerHTML = `
    <div class="modal-box" style="max-width:520px;text-align:left;padding:32px;max-height:90vh;overflow-y:auto" onclick="event.stopPropagation()">
      <h3 class="modal-title">Edit Profile</h3>
      <div class="profile-edit-form">
        <div class="profile-field"><label>Display Name</label><input type="text" id="pe-name" placeholder="Your full name"/></div>
        <div class="profile-field"><label>Bio</label><textarea id="pe-bio" rows="3" placeholder="Tell others about yourself…"></textarea></div>
        <div class="profile-field"><label>Course / Headline</label><input type="text" id="pe-headline" placeholder="e.g. BS Computer Science — 3rd Year"/></div>
        <div class="profile-field"><label>Preferred Schedule</label>
          <select id="pe-schedule"><option value="">Any</option><option>Morning</option><option>Afternoon</option><option>Evening</option><option>Weekends</option></select></div>
        <div class="profile-field"><label>Study Style</label>
          <select id="pe-style"><option value="">Any</option><option>Visual learner</option><option>Audio learner</option><option>Group study</option><option>Solo study</option><option>Pomodoro</option></select></div>
        <div class="profile-field"><label>Location</label>
          <select id="pe-location"><option value="">Any</option><option>Online</option><option>Library</option><option>Campus</option><option>Café</option><option>Dormitory</option></select></div>

        <!-- ── Subject picker ── -->
        <div class="profile-field">
          <label>Study Subjects <span style="font-weight:400;color:var(--text-light);font-size:.8rem">(up to 5)</span></label>
          <div class="pe-subject-chips" id="pe-subject-chips"></div>
          <div class="pe-subject-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="pe-subject-input" placeholder="Search subjects…" autocomplete="off" />
          </div>
          <div class="pe-subject-dropdown" id="pe-subject-dropdown" style="display:none"></div>
        </div>

        <div id="pe-error" class="login-error" style="display:none"></div>
        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="modal-cancel" onclick="closeProfileEdit()">Cancel</button>
          <button class="profile-save-btn" onclick="saveProfileEdit()">Save Changes</button>
        </div>
      </div>
    </div>`;

  modal.addEventListener('click', e => { if (e.target === modal) closeProfileEdit(); });
  document.body.appendChild(modal);

  // Populate fields
  document.getElementById('pe-name').value     = user.name     || '';
  document.getElementById('pe-bio').value      = user.bio      || '';
  document.getElementById('pe-headline').value = user.headline || '';
  document.getElementById('pe-schedule').value = user.schedule || '';
  document.getElementById('pe-style').value    = user.style    || '';
  document.getElementById('pe-location').value = user.location || '';
  document.getElementById('pe-error').style.display = 'none';

  // ── Subject picker state ──
  let selectedSubjects = Array.isArray(user.subjects) ? [...user.subjects] : [];
  const allSubjects    = Object.keys(typeof SUBJECT_CATEGORY_MAP !== 'undefined' ? SUBJECT_CATEGORY_MAP : {});

  function renderChips() {
    const wrap = document.getElementById('pe-subject-chips');
    if (!wrap) return;
    wrap.innerHTML = selectedSubjects.map(s => `
      <span class="pe-subject-chip">
        ${escHtml(s)}
        <button type="button" onclick="_peRemoveSubject('${escHtml(s).replace(/'/g,"\\'")}')">×</button>
      </span>`).join('');
    // Hide input when at cap
    const inp = document.getElementById('pe-subject-input');
    if (inp) inp.style.display = selectedSubjects.length >= 5 ? 'none' : '';
    const wrap2 = document.querySelector('.pe-subject-search-wrap');
    if (wrap2) wrap2.style.display = selectedSubjects.length >= 5 ? 'none' : '';
  }

  window._peSelectedSubjects = selectedSubjects;
  window._peAddSubject = function(s) {
    if (selectedSubjects.includes(s) || selectedSubjects.length >= 5) return;
    selectedSubjects.push(s);
    window._peSelectedSubjects = selectedSubjects;
    renderChips();
    const inp = document.getElementById('pe-subject-input');
    if (inp) { inp.value = ''; }
    document.getElementById('pe-subject-dropdown').style.display = 'none';
  };
  window._peRemoveSubject = function(s) {
    selectedSubjects = selectedSubjects.filter(x => x !== s);
    window._peSelectedSubjects = selectedSubjects;
    renderChips();
  };

  function renderDropdown(query) {
    const dd = document.getElementById('pe-subject-dropdown');
    if (!dd) return;
    if (!query) { dd.style.display = 'none'; return; }
    const q = query.toLowerCase();
    const matches = allSubjects.filter(s =>
      s.toLowerCase().includes(q) && !selectedSubjects.includes(s)
    ).slice(0, 8);
    if (!matches.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = matches.map(s =>
      `<div class="pe-subject-option" onmousedown="event.preventDefault();_peAddSubject('${escHtml(s).replace(/'/g,"\\'")}')">
        <span>${escHtml(s)}</span>
        <span class="pe-subject-cat">${escHtml((typeof SUBJECT_CATEGORY_MAP !== 'undefined' ? SUBJECT_CATEGORY_MAP[s] : '') || '')}</span>
      </div>`
    ).join('');
    dd.style.display = 'block';
  }

  const inp = document.getElementById('pe-subject-input');
  if (inp) {
    inp.addEventListener('input',  () => renderDropdown(inp.value.trim()));
    inp.addEventListener('focus',  () => { if (inp.value.trim()) renderDropdown(inp.value.trim()); });
    inp.addEventListener('blur',   () => setTimeout(() => {
      const dd = document.getElementById('pe-subject-dropdown');
      if (dd) dd.style.display = 'none';
    }, 150));
  }

  renderChips();
  modal.classList.add('open');
}

function closeProfileEdit() {
  const modal = document.getElementById('profile-edit-modal');
  if (modal) modal.classList.remove('open');
}

async function saveProfileEdit() {
  const user = currentUser;
  if (!user) return;
  const name     = document.getElementById('pe-name')?.value.trim()     || '';
  const bio      = document.getElementById('pe-bio')?.value.trim()      || '';
  const headline = document.getElementById('pe-headline')?.value.trim() || '';
  const schedule = document.getElementById('pe-schedule')?.value        || '';
  const style    = document.getElementById('pe-style')?.value           || '';
  const location = document.getElementById('pe-location')?.value        || '';
  const subjects = Array.isArray(window._peSelectedSubjects) ? window._peSelectedSubjects : (user.subjects || []);

  const errEl = document.getElementById('pe-error');
  if (!name) { errEl.textContent='Please enter a display name.'; errEl.style.display='block'; return; }
  errEl.style.display = 'none';

  // Update currentUser in-memory
  Object.assign(user, { name, bio, headline, schedule, style, location, subjects });

  // Persist to Supabase
  try {
    await sbUpsert('accounts', {
      email: user.email, name, bio, headline, schedule, style, location,
      subjects: subjects,
      password_hash: user.password||'', avatar_color: user.avatarColor||'',
      is_creator: user.isCreator||false, creator_brand: user.creatorBrand||'',
    }, 'email');
  } catch(e) { console.error('saveProfileEdit:', e); }

  // Clean up subject picker globals
  window._peSelectedSubjects = null;
  window._peAddSubject        = null;
  window._peRemoveSubject     = null;

  closeProfileEdit();

  // Refresh sidebar chrome
  const snEl = document.getElementById('sidebar-name');   if(snEl) snEl.textContent = name;
  const cEl  = document.getElementById('app-username-chip'); if(cEl) cEl.textContent = name.split(' ')[0];
  const hEl  = document.getElementById('sidebar-handle');
  if(hEl) hEl.textContent = '@'+name.toLowerCase().replace(/\s+/g,'')+ ' · Student';

  // Re-render and invalidate ad pool so targeting uses new subjects immediately
  renderMyProfile(user);
  if (typeof invalidateAdPool === 'function') invalidateAdPool();
  showToast('✓ Profile updated');
}

/* ──────────────────────────────────────────────────────────
   TINY HELPER — local escHtml (mirrors app.js escHtml)
──────────────────────────────────────────────────────────── */

