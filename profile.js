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
  if (!user) return;
  const section = document.getElementById('app-profile');
  if (!section) return;

  window._profileUser = user;

  const initial   = (user.name || user.email || 'U')[0].toUpperCase();
  const color     = user.avatarColor || AVATAR_COLORS[0];
  const isCreator = user.isCreator || false;

  section.innerHTML = `
    <div class="profile-page">

      <div class="profile-banner"><div class="profile-banner-pattern"></div></div>

      <div class="profile-identity">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar-large" style="background:${color}">${_pEsc(initial)}</div>
        </div>
        <div class="profile-identity-main">
          <div>
            <div class="profile-name-row">
              <h2 class="profile-name">${_pEsc(user.name || 'Your Name')}</h2>
              ${isCreator ? `<span class="creator-badge">✦ Creator</span>` : ''}
            </div>
            <div class="profile-handle">@${_pEsc((user.name||'user').toLowerCase().replace(/\s+/g,''))} · Student</div>
            ${isCreator && user.creatorBrand ? `<div class="profile-creator-brand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              ${_pEsc(user.creatorBrand)}
            </div>` : ''}
            <p class="profile-bio-text">${_pEsc(user.bio || 'No bio yet — click Edit Profile to add one.')}</p>
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
          <div class="profile-stat-val" id="pstat-sessions">—</div>
          <div class="profile-stat-label">Sessions</div>
        </div>
      </div>

      <!-- Info cards -->
      <div class="profile-body">
        <div class="profile-card">
          <div class="profile-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="8" r="4"/><path d="M6 20v-1a6 6 0 0 1 12 0v1"/></svg>
            About Me
          </div>
          <div class="profile-info-row"><span class="profile-info-label">Course</span><span class="profile-info-value">${_pEsc(user.headline||'—')}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Schedule</span><span class="profile-info-value">${_pEsc(user.schedule||'—')}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Study Style</span><span class="profile-info-value">${_pEsc(user.style||'—')}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Location</span><span class="profile-info-value">${_pEsc(user.location||'—')}</span></div>
        </div>
        <div class="profile-card">
          <div class="profile-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            Study Subjects
          </div>
          <div class="subject-tags">
            ${(user.subjects||[]).length
              ? user.subjects.map(s=>`<span class="subject-tag">${_pEsc(s)}</span>`).join('')
              : '<span style="font-size:.86rem;color:var(--text-light)">No subjects added yet.</span>'}
          </div>
        </div>
      </div>

      <!-- Creator Store (only if creator) — own profile view -->
      ${isCreator ? `
      <div style="margin-top:24px">
        <div class="profile-posts-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          My Store
          <button class="profile-hub-btn" style="margin-left:auto;font-size:.75rem;padding:5px 12px" onclick="appNav('creator')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Manage in Hub
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

async function _loadMpProducts(user) {
  const el = document.getElementById('mp-panel-products');
  if (!el) return;
  try {
    const [allProducts, allPurchases] = await Promise.all([
      loadProducts(),
      loadPurchases ? loadPurchases() : Promise.resolve([]),
    ]);
    const data = allProducts.filter(p => p.creatorEmail === user.email);
    if (!data.length) {
      el.innerHTML = `<div class="creator-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg><p>No products yet. <button class="connect-btn" style="display:inline;width:auto;padding:6px 14px" onclick="appNav('creator')">Add in Hub →</button></p></div>`;
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
      return `
      <div class="creator-product-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span style="font-family:var(--font-display);font-weight:700;font-size:.9rem;color:var(--text-primary)">${_pEsc(p.title||'Untitled')}</span>
          ${p.price > 0 ? `<span style="font-weight:800;color:var(--purple-bright);font-size:.8rem;flex-shrink:0">₱${p.price}</span>` : `<span class="subject-tag" style="font-size:.65rem">Free</span>`}
        </div>
        ${p.subject ? `<span class="buddy-subj-tag" style="font-size:.68rem;margin-bottom:4px;display:inline-block">${_pEsc(p.subject)}</span>` : ''}
        <p style="font-size:.82rem;color:var(--text-light);line-height:1.5;margin:0;flex:1">${_pEsc(p.description||'')}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid var(--border-card)">
          <span style="font-size:.73rem;color:var(--text-light)">${_pEsc(p.type||'notes')}</span>
          <span style="font-size:.73rem;color:var(--text-light)">${count} sale${count !== 1 ? 's' : ''}${p.price > 0 ? ' · ₱' + earned.toLocaleString() : ''}</span>
        </div>
      </div>`;
    }).join('')}</div>`;
  } catch(e) {
    if (el) el.innerHTML = `<div class="creator-empty"><p>Could not load products.</p></div>`;
  }
}

async function _loadMpSubs(user) {
  const el = document.getElementById('mp-panel-subscriptions');
  if (!el) return;
  try {
    const allTiers = await loadSubscriptionTiers();
    const tiers = allTiers.filter(t => t.creatorEmail === user.email);
    if (!tiers.length) {
      el.innerHTML = `<div class="creator-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>No subscription tiers yet.</p></div>`;
      return;
    }
    el.innerHTML = `<div class="creator-subs-grid">${tiers.map(t=>`
      <div class="creator-sub-card">
        <div style="font-family:var(--font-display);font-weight:800;font-size:.95rem;color:var(--text-primary)">${_pEsc(t.name||'Tier')}</div>
        <div style="font-size:.9rem;font-weight:700;color:var(--purple-bright)">₱${t.price||0}<span style="font-size:.7rem;font-weight:400;color:var(--text-light)">/mo</span></div>
        <p style="font-size:.8rem;color:var(--text-light);margin:0;line-height:1.5">${_pEsc(t.description||'')}</p>
      </div>`).join('')}</div>`;
  } catch(e) {
    if (el) el.innerHTML = `<div class="creator-empty"><p>Could not load subscriptions.</p></div>`;
  }
}

async function _loadMpQuizzes(user) {
  const el = document.getElementById('mp-panel-quizzes');
  if (!el) return;
  try {
    const allQuizzes = await loadQuizzes();
    const quizzes = allQuizzes.filter(q => q.creatorEmail === user.email);
    if (!quizzes.length) {
      el.innerHTML = `<div class="creator-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><p>No quizzes yet.</p></div>`;
      return;
    }
    el.innerHTML = `<div class="creator-quiz-grid">${quizzes.map(q=>`
      <div class="creator-quiz-card">
        <div style="font-family:var(--font-display);font-weight:800;font-size:.9rem;color:var(--text-primary)">${_pEsc(q.title||'Quiz')}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          ${q.subject?`<span class="subject-tag" style="font-size:.65rem">${_pEsc(q.subject)}</span>`:''}
          <span style="font-size:.72rem;color:var(--text-light)">${Array.isArray(q.questions)?q.questions.length:0} Qs</span>
          ${q.access==='paid'?`<span style="font-size:.65rem;background:#fef3c7;color:#d97706;border:1px solid #fde68a;border-radius:20px;padding:2px 8px">Subscribers</span>`:`<span style="font-size:.65rem;background:#f0fdf4;color:#16a34a;border:1px solid #86efac;border-radius:20px;padding:2px 8px">Free</span>`}
        </div>
      </div>`).join('')}</div>`;
  } catch(e) {
    if (el) el.innerHTML = `<div class="creator-empty"><p>Could not load quizzes.</p></div>`;
  }
}

async function _loadMyStats(user) {
  try {
    const posts   = (await loadPosts()).filter(p=>p.authorEmail===user.email);
    const matches = (await loadMatches()).filter(m=>(m.from===user.email||m.to===user.email)&&m.status==='accepted');
    const rooms   = (await loadRooms()).filter(r=>(r.participants||[]).includes(user.email));
    const p=document.getElementById('pstat-posts');    if(p) p.textContent=posts.length;
    const m=document.getElementById('pstat-matches');  if(m) m.textContent=matches.length;
    const s=document.getElementById('pstat-sessions'); if(s) s.textContent=rooms.length;
  } catch(e){}
}

/* ──────────────────────────────────────────────────────────
   VIEW PROFILE (other users)
──────────────────────────────────────────────────────────── */
async function renderViewProfile(user) {
  const section = document.getElementById('app-viewprofile');
  if (!section) return;

  window._viewingUser = user;

  const initial   = (user.name||user.email||'?')[0].toUpperCase();
  const color     = user.avatarColor || AVATAR_COLORS[0];
  const isCreator = user.isCreator || false;

  // Existing match status
  let matchStatus = 'none';
  if (currentUser) {
    const matches = await loadMatches();
    const m = matches.find(mx =>
      (mx.from===currentUser.email&&mx.to===user.email) ||
      (mx.from===user.email&&mx.to===currentUser.email)
    );
    if (m) matchStatus = m.status === 'accepted' ? 'connected' : 'pending';
  }

  const connectBtn = matchStatus==='connected'
    ? `<button class="profile-match-btn sent" disabled>✓ Connected</button>`
    : matchStatus==='pending'
    ? `<button class="profile-match-btn sent" disabled>⏳ Request Sent</button>`
    : `<button class="profile-match-btn" id="vp-connect-btn" onclick="connectFromViewProfile('${_pEsc(user.email)}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        Add Buddy
       </button>`;

  const messageBtn = matchStatus==='connected'
    ? `<button class="profile-edit-btn" onclick="openMessagesWith('${_pEsc(user.email)}')">
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
          <div class="profile-avatar-large" style="background:${color}">${_pEsc(initial)}</div>
        </div>
        <div class="profile-identity-main">
          <div>
            <div class="profile-name-row">
              <h2 class="profile-name">${_pEsc(user.name||'Student')}</h2>
              ${isCreator?`<span class="creator-badge">✦ Creator</span>`:''}
            </div>
            <div class="profile-handle">@${_pEsc((user.name||'user').toLowerCase().replace(/\s+/g,''))} · Student</div>
            <p class="profile-bio-text">${_pEsc(user.bio||"This student hasn't added a bio yet.")}</p>
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
          <div class="profile-info-row"><span class="profile-info-label">Course</span><span class="profile-info-value">${_pEsc(user.headline||'—')}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Schedule</span><span class="profile-info-value">${_pEsc(user.schedule||'—')}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Study Style</span><span class="profile-info-value">${_pEsc(user.style||'—')}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Location</span><span class="profile-info-value">${_pEsc(user.location||'—')}</span></div>
        </div>
        <div class="profile-card">
          <div class="profile-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            Subjects
          </div>
          <div class="subject-tags">
            ${(user.subjects||[]).length
              ? user.subjects.map(s=>`<span class="subject-tag">${_pEsc(s)}</span>`).join('')
              : '<span style="font-size:.86rem;color:var(--text-light)">No subjects listed.</span>'}
          </div>
        </div>
      </div>

      <!-- Creator Store (only if creator) -->
      ${isCreator ? `
      <div style="margin-top:24px">
        <div class="profile-posts-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          ${_pEsc(user.creatorBrand || (user.name+"'s"))} Store
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
          Posts by ${_pEsc((user.name||'this student').split(' ')[0])}
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
    const [allProducts, myPurchases] = await Promise.all([
      loadProducts(),
      currentUser ? loadPurchases(currentUser.email) : Promise.resolve([]),
    ]);
    const purchasedIds = new Set(myPurchases.map(p => p.productId));
    const data = allProducts.filter(p => p.creatorEmail === user.email);

    if (!data || !data.length) {
      el.innerHTML = `<div class="creator-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg><p>No products yet.</p></div>`;
      return;
    }
    el.innerHTML = `<div class="creator-products-grid">${data.map(p => {
      const owned = purchasedIds.has(p.id);
      const btnLabel = owned ? '✓ Purchased' : (p.price > 0 ? `Buy · ₱${p.price}` : 'Get Free');
      const btnClass = owned ? 'profile-match-btn requested' : 'profile-match-btn';
      const btnDisabled = owned ? 'disabled' : '';
      const onclick = owned ? '' : `onclick="purchaseProduct('${_pEsc(p.id||'')}','${_pEsc(p.title||'')}',${p.price||0},this)"`;
      return `
      <div class="creator-product-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span style="font-family:var(--font-display);font-weight:700;font-size:.9rem;color:var(--text-primary)">${_pEsc(p.title||'Untitled')}</span>
          ${p.price>0?`<span style="font-weight:800;color:var(--purple-bright);font-size:.8rem;flex-shrink:0">₱${p.price}</span>`:`<span class="subject-tag" style="font-size:.65rem">Free</span>`}
        </div>
        ${p.subject?`<span class="buddy-subj-tag" style="font-size:.68rem;margin-bottom:4px;display:inline-block">${_pEsc(p.subject)}</span>`:''}
        <p style="font-size:.82rem;color:var(--text-light);line-height:1.5;margin:0;flex:1">${_pEsc(p.description||'')}</p>
        <button class="${btnClass}" style="width:100%;justify-content:center;margin-top:6px" ${onclick} ${btnDisabled}>
          ${btnLabel}
        </button>
      </div>`;
    }).join('')}</div>`;
  } catch(e) {
    if (el) el.innerHTML = `<div class="creator-empty"><p>Could not load products.</p></div>`;
  }
}

async function _loadVpSubs(user) {
  const el = document.getElementById('vp-panel-subscriptions');
  if (!el) return;
  try {
    const allTiers = await loadSubscriptionTiers();
    const tiers = allTiers
      .filter(t => t.creatorEmail === user.email)
      .sort((a, b) => (a.price || 0) - (b.price || 0));

    const subscribed = currentUser ? await _vpIsSubscribedTo(user.email) : false;

    if (!tiers.length) {
      el.innerHTML = `<div class="creator-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>No subscription tiers available yet.</p></div>`;
      return;
    }
    el.innerHTML = `<div class="creator-subs-grid">${tiers.map(t => `
      <div class="creator-sub-card">
        <div style="font-family:var(--font-display);font-weight:800;font-size:.95rem;color:var(--text-primary)">${_pEsc(t.name||'Tier')}</div>
        <div style="font-size:.9rem;font-weight:700;color:var(--purple-bright)">&#8369;${t.price||0}<span style="font-size:.7rem;font-weight:400;color:var(--text-light)">/mo</span></div>
        <p style="font-size:.8rem;color:var(--text-light);margin:0;line-height:1.5">${_pEsc(t.description||'')}</p>
        <button class="profile-match-btn ${subscribed ? 'sent' : ''}" style="width:100%;justify-content:center;margin-top:8px"
          onclick="subscribeTo('${_pEsc(t.id||'')}','${_pEsc(user.email)}',${t.price||0},this)"
          ${subscribed ? 'disabled' : ''}>
          ${subscribed ? '&#10003; Subscribed' : 'Subscribe &middot; &#8369;' + (t.price||0) + '/mo'}
        </button>
      </div>`).join('')}</div>`;
  } catch(e) {
    if (el) el.innerHTML = `<div class="creator-empty"><p>Could not load subscriptions.</p></div>`;
  }
}

async function _loadVpQuizzes(user) {
  const el = document.getElementById('vp-panel-quizzes');
  if (!el) return;
  try {
    const allQuizzes = await loadQuizzes();
    const quizzes = allQuizzes.filter(q => q.creatorEmail === user.email);

    // Check if current user is subscribed (paid quizzes need subscription)
    const subscribed = currentUser ? await _vpIsSubscribedTo(user.email) : false;

    if (!quizzes || !quizzes.length) {
      el.innerHTML = `<div class="creator-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><p>No quizzes available yet.</p></div>`;
      return;
    }
    el.innerHTML = `<div class="creator-quiz-grid">${quizzes.map(q => {
      const isPaid   = q.access === 'paid';
      const canTake  = !isPaid || subscribed;
      const lockIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
      return `
      <div class="creator-quiz-card">
        <div style="font-family:var(--font-display);font-weight:800;font-size:.9rem;color:var(--text-primary)">${_pEsc(q.title||'Quiz')}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
          ${q.subject ? `<span class="subject-tag" style="font-size:.65rem">${_pEsc(q.subject)}</span>` : ''}
          <span style="font-size:.72rem;color:var(--text-light)">${Array.isArray(q.questions) ? q.questions.length : 0} Qs</span>
          ${isPaid
            ? `<span style="font-size:.65rem;background:#fef3c7;color:#d97706;border:1px solid #fde68a;border-radius:20px;padding:2px 8px">Subscribers</span>`
            : `<span style="font-size:.65rem;background:#f0fdf4;color:#16a34a;border:1px solid #86efac;border-radius:20px;padding:2px 8px">Free</span>`}
        </div>
        ${canTake
          ? `<button class="profile-match-btn" style="width:100%;justify-content:center;margin-top:8px"
               onclick="openPublicQuiz('${_pEsc(q.id||'')}','${_pEsc(user.email)}')">
               Take Quiz
             </button>`
          : `<button class="profile-match-btn" style="width:100%;justify-content:center;margin-top:8px;display:flex;align-items:center;gap:6px"
               onclick="openQuizPaywall('${_pEsc(q.id||'')}','${_pEsc(q.title||'')}',${Array.isArray(q.questions)?q.questions.length:0},'${_pEsc(user.email)}')">
               ${lockIcon} Subscribers only
             </button>`}
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

async function subscribeTo(tierId, creatorEmail, price, btnEl) {
  if (!currentUser) { showToast('Please log in first.'); return; }
  if (price === 0) {
    await _recordSubscription(tierId, creatorEmail, 0, btnEl);
    showToast('✓ Subscribed for free!');
    return;
  }
  // Look up tier name for the receipt
  const allTiers = await loadSubscriptionTiers();
  const tier = allTiers.find(t => t.id === tierId) || {};
  openCheckoutModal({
    type:        'subscription',
    id:          tierId,
    title:       tier.name || 'Subscription',
    price,
    label:       '/ month',
    creatorEmail,
    btnEl,
  });
}

async function openPublicQuiz(quizId, creatorEmail) {
  if (!currentUser) { showToast('Please log in to take this quiz.'); return; }

  // Check if quiz is paid and user is subscribed
  const allQuizzes = await loadQuizzes();
  const quiz = allQuizzes.find(q => q.id === quizId);
  if (!quiz) { showToast('Quiz not found.'); return; }

  if (quiz.access === 'paid') {
    const subscribed = await _vpIsSubscribedTo(creatorEmail);
    if (!subscribed) {
      openQuizPaywall(quizId, quiz.title, Array.isArray(quiz.questions) ? quiz.questions.length : 0, creatorEmail);
      return;
    }
  }

  // Launch the shared quiz player (defined in creator.js)
  if (typeof launchQuizPlayer === 'function') {
    launchQuizPlayer(quiz, false);
  } else {
    showToast('Quiz player unavailable.');
  }
}


/* ──────────────────────────────────────────────────────────
   QUIZ PAYWALL MODAL
   Shows subscription tiers and lets the user subscribe inline.
   Called when a non-subscriber clicks a paid quiz.
──────────────────────────────────────────────────────────── */
async function openQuizPaywall(quizId, quizTitle, questionCount, creatorEmail) {
  const old = document.getElementById('quiz-paywall-modal');
  if (old) old.remove();

  // Load creator info + tiers in parallel
  const [accounts, allTiers] = await Promise.all([
    loadAccounts(),
    loadSubscriptionTiers(),
  ]);

  const creator = accounts.find(a => a.email === creatorEmail);
  const creatorName = creator ? creator.name : creatorEmail.split('@')[0];
  const tiers = allTiers
    .filter(t => t.creatorEmail === creatorEmail)
    .sort((a, b) => (a.price || 0) - (b.price || 0));

  const tiersHTML = tiers.length
    ? tiers.map((t, i) => `
        <div class="qpw-tier-row ${i === 0 ? 'qpw-tier-rec' : ''}" onclick="selectPaywallTier('${_pEsc(t.id)}',${t.price||0})">
          <div class="qpw-tier-left">
            ${i === 0 ? `<svg viewBox="0 0 24 24" fill="var(--purple-bright)" width="11" height="11"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>` : ''}
            <span class="qpw-tier-name">${_pEsc(t.name || 'Standard')}</span>
            ${t.description ? `<span class="qpw-tier-desc">${_pEsc(t.description)}</span>` : ''}
          </div>
          <span class="qpw-tier-price">₱${t.price || 0}<span class="qpw-tier-period">/mo</span></span>
        </div>`).join('')
    : `<div style="font-size:.84rem;color:var(--text-light);text-align:center;padding:12px 0">
         This creator hasn't set up subscription tiers yet.
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
        <p class="qpw-sub">Subscribe to <strong>@${_pEsc(creatorName.toLowerCase().replace(/\s+/g,''))}</strong> to unlock this quiz and all premium content.</p>
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
          <div class="qpw-quiz-name">${_pEsc(quizTitle || 'Quiz')}</div>
          <div class="qpw-quiz-meta">${questionCount} question${questionCount !== 1 ? 's' : ''} · Subscribers only</div>
        </div>
        <div class="qpw-lock-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
      </div>

      <!-- Tier list -->
      ${tiers.length ? `<p class="qpw-tiers-label">Choose a plan</p>` : ''}
      <div class="qpw-tiers" id="qpw-tiers">${tiersHTML}</div>

      <!-- Hidden state for selected tier -->
      <input type="hidden" id="qpw-selected-tier" value="${tiers.length ? tiers[0].id : ''}" />
      <input type="hidden" id="qpw-selected-price" value="${tiers.length ? tiers[0].price || 0 : 0}" />

      <!-- Actions -->
      <div class="qpw-actions">
        <button class="modal-cancel" onclick="closeQuizPaywall()">Maybe later</button>
        <button class="qpw-subscribe-btn" onclick="_confirmQuizPaywallSub('${_pEsc(creatorEmail)}')">
          ${tiers.length
            ? `Subscribe · ₱${tiers[0].price || 0}/mo`
            : 'Close'}
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

function selectPaywallTier(tierId, price) {
  document.getElementById('qpw-selected-tier').value  = tierId;
  document.getElementById('qpw-selected-price').value = price;

  // Update active row highlight
  document.querySelectorAll('.qpw-tier-row').forEach(row => {
    row.classList.toggle('qpw-tier-rec', row.getAttribute('onclick').includes(`'${tierId}'`));
  });

  // Update subscribe button label
  const btn = document.querySelector('.qpw-subscribe-btn');
  if (btn) btn.textContent = `Subscribe · ₱${price}/mo`;
}

async function _confirmQuizPaywallSub(creatorEmail) {
  const tierId = document.getElementById('qpw-selected-tier')?.value || '';
  const price  = parseFloat(document.getElementById('qpw-selected-price')?.value || '0') || 0;

  if (!tierId) { closeQuizPaywall(); return; }

  closeQuizPaywall();

  // Reuse the existing checkout modal for the actual payment step
  const allTiers = await loadSubscriptionTiers();
  const tier = allTiers.find(t => t.id === tierId) || {};

  openCheckoutModal({
    type:        'subscription',
    id:          tierId,
    title:       tier.name || 'Subscription',
    price,
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
                       max-width:180px;text-align:right;word-break:break-word">${_pEsc(opts.title)}</span>
        </div>
        ${opts.creatorEmail ? `
        <div style="display:flex;justify-content:space-between;font-size:.82rem;padding:4px 0;
                    border-bottom:1px solid var(--border-card);margin-bottom:8px">
          <span style="color:var(--text-light)">Creator</span>
          <span style="color:var(--text-primary)">@${_pEsc(opts.creatorEmail.split('@')[0])}</span>
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
    } else {
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
  await sbUpsert('purchases', {
    id:          'pur_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    user_email:  currentUser.email,
    product_id:  productId,
    price:       price,
    purchased_at: new Date().toISOString(),
  }, 'id');

  // Optimistic UI — update the triggering button
  if (btnEl) {
    btnEl.textContent = '✓ Purchased';
    btnEl.classList.add('requested');
    btnEl.disabled = true;
  }

  showToast(price === 0 ? `✓ "${title}" added for free!` : `✓ "${title}" purchased!`);
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

  let modal = document.getElementById('profile-edit-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'profile-edit-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:520px;text-align:left;padding:32px" onclick="event.stopPropagation()">
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
          <div id="pe-error" class="login-error" style="display:none"></div>
          <div style="display:flex;gap:10px;margin-top:8px">
            <button class="modal-cancel" onclick="closeProfileEdit()">Cancel</button>
            <button class="profile-save-btn" onclick="saveProfileEdit()">Save Changes</button>
          </div>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target===modal) closeProfileEdit(); });
    document.body.appendChild(modal);
  }

  document.getElementById('pe-name').value     = user.name     || '';
  document.getElementById('pe-bio').value      = user.bio      || '';
  document.getElementById('pe-headline').value = user.headline || '';
  document.getElementById('pe-schedule').value = user.schedule || '';
  document.getElementById('pe-style').value    = user.style    || '';
  document.getElementById('pe-location').value = user.location || '';
  document.getElementById('pe-error').style.display = 'none';
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

  const errEl = document.getElementById('pe-error');
  if (!name) { errEl.textContent='Please enter a display name.'; errEl.style.display='block'; return; }
  errEl.style.display = 'none';

  // Update currentUser in-memory
  Object.assign(user, { name, bio, headline, schedule, style, location });

  // Persist to Supabase
  try {
    await sbUpsert('accounts', {
      email: user.email, name, bio, headline, schedule, style, location,
      password_hash: user.password||'', subjects: user.subjects||[],
      avatar_color: user.avatarColor||'', is_creator: user.isCreator||false,
      creator_brand: user.creatorBrand||'',
    }, 'email');
  } catch(e) {}

  closeProfileEdit();

  // Refresh sidebar chrome
  ['sidebar-name',           v => document.getElementById('sidebar-name') && (document.getElementById('sidebar-name').textContent = name)];
  const snEl = document.getElementById('sidebar-name');   if(snEl) snEl.textContent = name;
  const cEl  = document.getElementById('app-username-chip'); if(cEl) cEl.textContent = name.split(' ')[0];
  const hEl  = document.getElementById('sidebar-handle');
  if(hEl) hEl.textContent = '@'+name.toLowerCase().replace(/\s+/g,'')+ ' · Student';

  // Re-render
  renderMyProfile(user);
  showToast('✓ Profile updated');
}

/* ──────────────────────────────────────────────────────────
   TINY HELPER — local escHtml (mirrors app.js escHtml)
──────────────────────────────────────────────────────────── */
function _pEsc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
