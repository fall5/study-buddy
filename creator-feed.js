/* ═══════════════════════════════════════════════════════════
   STUDY BUDDY — creator-feed.js  (v2, complete)

   WHAT THIS FILE DOES
   ───────────────────
   1. Injects a "Share Item" button into the feed composer
      (visible only to approved creators).
   2. Provides a 3-step picker: choose type → choose item →
      write caption → posts to feed with postType +
      linkedItemId set.
   3. Defines buildCreatorPostCardHTML(post) — called by
      renderFeed() in app.js for every creator post — which
      renders the embedded product / subscription / quiz card.
   4. Handles all CTA actions: get/purchase product, subscribe
      to tier, take quiz inline in a modal.

   DEPENDENCIES (already global from your other files)
   ────────────────────────────────────────────────────
   app.js     → currentUser, sbSelect, sbUpdate, sbUpsert,
                savePost, invalidateFeedCache, renderFeed,
                appNav, showToast, escHtml,
                loadCreatorApps, loadProducts,
                getCreatorSubscription, loadQuizzes,
                loadUserSubs, saveUserSubs, _confirmSubscription
   creator.js → getMyProducts, getMyTiers, getMyQuizzes,
                isSubscribedTo

   HOW TO INSTALL
   ──────────────
   1. Save this file as creator-feed.js next to your other JS.
   2. In index.html add as the LAST <script> tag in <body>:
        <script src="creator-feed.js"></script>
   3. Apply the toolbar changes from index-changes.html.
   4. In creator.js add Share buttons per card — see the
      "WIRING INTO CREATOR.JS" block at the bottom of this file.
   ═══════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════
   SECTION 1 — COMPOSER BUTTON VISIBILITY
   Shows the "Share Item" button only for approved creators.
   Patches appNav() so it runs every time the feed loads.
══════════════════════════════════════════════════════════════ */

async function _updateComposerCreatorBtn() {
  const btn = document.getElementById('composer-creator-btn');
  if (!btn || !currentUser) return;
  const apps = await loadCreatorApps();
  const app  = apps.find(a => a.email === currentUser.email);
  btn.style.display = (app && app.status === 'approved') ? '' : 'none';
}

// Patch appNav once so the button visibility refreshes on every feed visit
(function _patchAppNav() {
  const _orig = window.appNav;
  window.appNav = async function (target, ...args) {
    const result = _orig ? await _orig(target, ...args) : undefined;
    if (target === 'feed') _updateComposerCreatorBtn();
    return result;
  };
})();


/* ══════════════════════════════════════════════════════════════
   SECTION 2 — THREE-STEP SHARE PICKER
   Step 1: Choose type  (Product / Subscription Tier / Quiz)
   Step 2: Choose which item from the creator's own items
   Step 3: Write optional caption → submit to feed
══════════════════════════════════════════════════════════════ */

function openCreatorSharePicker() {
  _removeShareModal();
  const overlay = _makeOverlay('_cf-share-modal');
  overlay.innerHTML = `
    <div class="_cf-box" onclick="event.stopPropagation()">
      <div class="_cf-header">
        <span class="_cf-title">Share to Feed</span>
        <button class="_cf-close" onclick="_removeShareModal()">✕</button>
      </div>
      <p class="_cf-sub">What would you like to share?</p>
      <div class="_cf-type-grid">
        <button class="_cf-type-btn" onclick="_cfStep2('product')">
          <span class="_cf-type-icon">📄</span>
          <div>
            <span class="_cf-type-label">Product</span>
            <span class="_cf-type-hint">Notes, guides, cheatsheets…</span>
          </div>
        </button>
        <button class="_cf-type-btn" onclick="_cfStep2('subscription')">
          <span class="_cf-type-icon">🌟</span>
          <div>
            <span class="_cf-type-label">Subscription</span>
            <span class="_cf-type-hint">Offer your study plan</span>
          </div>
        </button>
        <button class="_cf-type-btn" onclick="_cfStep2('quiz')">
          <span class="_cf-type-icon">🧠</span>
          <div>
            <span class="_cf-type-label">Quiz</span>
            <span class="_cf-type-hint">Challenge your followers</span>
          </div>
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function _cfStep2(postType) {
  _removeShareModal();

  let items = [];
  if (postType === 'product')      items = await getMyProducts();
  if (postType === 'subscription') items = await getMyTiers();
  if (postType === 'quiz')         items = await getMyQuizzes();

  /* FIX 2 — labels updated: "Subscription Tier" → "Subscription".
     getMyTiers() (called above) already returns [sub]|[] via the
     alias in creator.js — no call-site change needed here. */
  const labels = { product: 'Product', subscription: 'Subscription', quiz: 'Quiz' };
  const icons  = { product: '📄', subscription: '🌟', quiz: '🧠' };

  const overlay = _makeOverlay('_cf-share-modal');
  overlay.innerHTML = `
    <div class="_cf-box" onclick="event.stopPropagation()">
      <div class="_cf-header">
        <button class="_cf-back" onclick="openCreatorSharePicker()">← Back</button>
        <span class="_cf-title">Choose a ${labels[postType]}</span>
        <button class="_cf-close" onclick="_removeShareModal()">✕</button>
      </div>
      ${!items.length
        ? `<p class="_cf-empty">No ${labels[postType].toLowerCase()} set up yet.
             <a onclick="appNav('creator');_removeShareModal()"
                style="color:var(--purple-bright);cursor:pointer">Set one up first →</a></p>`
        : `<div class="_cf-item-list">
            ${items.map(item => `
              <button class="_cf-item-row"
                      onclick="_cfStep3('${postType}','${escHtml(item.id)}')">
                <span class="_cf-item-icon">${icons[postType]}</span>
                <div class="_cf-item-info">
                  <span class="_cf-item-name">
                    ${escHtml(item.title || item.name || 'Untitled')}
                  </span>
                  <span class="_cf-item-meta">${_cfItemMeta(postType, item)}</span>
                </div>
                <span class="_cf-item-arrow">›</span>
              </button>`).join('')}
           </div>`}
    </div>`;
  document.body.appendChild(overlay);
}

function _cfItemMeta(postType, item) {
  if (postType === 'product') {
    const price = !item.price || item.price === 0 ? 'Free' : `₱${item.price}`;
    return `${item.type || 'Study Material'} · ${price}`;
  }
  if (postType === 'subscription') {
    return !item.price || item.price === 0 ? 'Free' : `₱${item.price}/mo`;
  }
  if (postType === 'quiz') {
    const qs = Array.isArray(item.questions) ? item.questions.length : 0;
    return `${qs} question${qs !== 1 ? 's' : ''} · ${item.access || 'free'}`;
  }
  return '';
}

function _cfStep3(postType, itemId) {
  _removeShareModal();
  const placeholders = {
    product:      'Write something about this study material…',
    subscription: 'Tell your followers why they should subscribe…',
    quiz:         'Challenge your followers — can they beat this quiz? 🧠',
  };
  const labels = { product: 'Product', subscription: 'Subscription', quiz: 'Quiz' };

  const overlay = _makeOverlay('_cf-share-modal');
  overlay.innerHTML = `
    <div class="_cf-box" onclick="event.stopPropagation()">
      <div class="_cf-header">
        <button class="_cf-back" onclick="_cfStep2('${postType}')">← Back</button>
        <span class="_cf-title">Write a Caption</span>
        <button class="_cf-close" onclick="_removeShareModal()">✕</button>
      </div>
      <textarea id="_cf-caption" class="_cf-textarea"
                placeholder="${placeholders[postType]}"></textarea>
      <p class="_cf-hint">
        Your ${labels[postType]} will appear as a preview card below your caption.
      </p>
      <div class="_cf-footer">
        <button class="_cf-cancel" onclick="_removeShareModal()">Cancel</button>
        <button class="_cf-submit" id="_cf-submit-btn"
                onclick="_cfSubmit('${postType}','${itemId}')">
          Share to Feed
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('_cf-caption')?.focus();
}

async function _cfSubmit(postType, itemId) {
  if (!currentUser) return;
  const caption   = (document.getElementById('_cf-caption')?.value || '').trim();
  const submitBtn = document.getElementById('_cf-submit-btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sharing…'; }

  try {
    // Pull subject from the linked item for feed filtering
    let subject = '';
    const tableMap = { product: 'products', subscription: 'subscription_tiers', quiz: 'quizzes' };
    const rows = await sbSelect(tableMap[postType], { id: itemId });
    subject = rows[0]?.subject || '';

    const post = {
      id:            'post_cr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      authorEmail:   currentUser.email,
      body:          caption,
      subject,
      schedule:      '',
      location:      '',
      type:          'creator',
      postType,
      linkedItemId:  itemId,
      isPremium:     false,
      tags:          [],
      likes:         [],
      images:        [],
      videos:        [],
      files:         [],
      gatherBuddies: false,
      ts:            Date.now(),
      timestamp:     Date.now(),
    };

    await savePost(post);

    // Mark feed_visible on the source item
    try {
      const _fvTable = postType === 'product' ? 'products' : postType === 'quiz' ? 'quizzes' : null;
      if (_fvTable) {
        const _fvUpdates = { feed_visible: true };
        if (window._cfPendingProfileVisible && window._cfPendingItemId === itemId) {
          _fvUpdates.profile_visible = true;
          window._cfPendingProfileVisible = false;
        }
        await sb.from(_fvTable).update(_fvUpdates).eq('id', itemId);
      }
    } catch(e) { console.warn('feed_visible:', e); }

    _removeShareModal();
    showToast('🎉 Shared to feed!');
    invalidateFeedCache();
    await renderFeed();
    appNav('feed');

  } catch (err) {
    console.error('_cfSubmit:', err);
    showToast('Could not share. Please try again.');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Share to Feed'; }
  }
}


/* ══════════════════════════════════════════════════════════════
   SECTION 3 — FEED CARD RENDERER
   buildCreatorPostCardHTML(post) is already called by
   renderFeed() in app.js. This file defines it.
══════════════════════════════════════════════════════════════ */

async function buildCreatorPostCardHTML(post) {
  if (!post.postType || !post.linkedItemId) return '';
  try {
    if (post.postType === 'product')      return await _renderProductCard(post);
    if (post.postType === 'subscription') return await _renderSubCard(post);
    if (post.postType === 'quiz')         return await _renderQuizCard(post);
  } catch (err) {
    console.error('buildCreatorPostCardHTML:', err);
  }
  return '';
}

/* ── Product card ──────────────────────────────────────────── */
async function _renderProductCard(post) {
  const rows = await sbSelect('products', { id: post.linkedItemId });
  const p    = rows[0];
  if (!p) return _cfMissingCard('Product no longer available.');

  const isFree     = !p.price || p.price === 0;
  const purchases  = Array.isArray(p.purchases)   ? p.purchases   : [];
  const accessList = Array.isArray(p.access_list) ? p.access_list : [];
  const isOwn      = currentUser?.email === p.creator_email;
  const alreadyHas = currentUser && (
    purchases.includes(currentUser.email) ||
    accessList.includes(currentUser.email)
  );
  const priceStr   = isFree ? 'Free' : `₱${Number(p.price).toLocaleString()}`;
  const typeIcons  = { notes:'📄', guide:'📘', cheatsheet:'⚡', flashcards:'🗂️', slides:'🖥️', template:'📋' };
  const icon       = typeIcons[(p.type || '').toLowerCase()] || '📦';

  let cta = '';
  if (isOwn) {
    cta = `<button class="cf-cta cf-cta-ghost" disabled>Your Product</button>`;
  } else if (alreadyHas) {
    cta = `<button class="cf-cta cf-cta-ghost"
                   onclick="bpOpenProduct('${escHtml(p.id)}')">
             📖 View Material
           </button>`;
  } else {
    cta = `<button class="cf-cta"
                   onclick="cfGetProduct('${escHtml(p.id)}',this)">
             ${isFree ? '📥 Get for Free' : `🛒 Buy · ${escHtml(priceStr)}`}
           </button>`;
  }

  return `
  <div class="cf-card">
    <div class="cf-card-icon">${icon}</div>
    <div class="cf-card-body">
      <div class="cf-card-top">
        <span class="cf-chip">${escHtml(p.type || 'Study Material')}</span>
        <span class="cf-chip ${isFree ? 'cf-chip-free' : 'cf-chip-paid'}">${escHtml(priceStr)}</span>
        ${p.subject ? `<span class="cf-chip cf-chip-sub">📚 ${escHtml(p.subject)}</span>` : ''}
      </div>
      <div class="cf-card-title">${escHtml(p.title || 'Untitled Product')}</div>
      ${p.description
        ? `<div class="cf-card-desc">
             ${escHtml(p.description.slice(0, 130))}${p.description.length > 130 ? '…' : ''}
           </div>`
        : ''}
      <div class="cf-card-actions">${cta}</div>
    </div>
  </div>`;
}

/* ── Subscription card ─────────────────────────────────────── */
/* FIX 3 — _renderSubCard: use getCreatorSubscription(post.authorEmail)
   instead of sbSelect('subscription_tiers', { id: post.linkedItemId }).
   This survives id changes (creator edits their plan) since we always
   look up by creatorEmail — the stable key.
   isSubbed check no longer requires s.tierId match — subscription is
   per-creator, not per-tier-id.
   Labels updated: "Subscription Tier" → "Subscription", "Your Tier" → "Your Plan". */
async function _renderSubCard(post) {
  // Look up by creator email — resilient to plan id changes
  const creatorEmail = post.authorEmail || post.creatorEmail || '';
  const sub = await getCreatorSubscription(creatorEmail);
  if (!sub) return _cfMissingCard("This creator's subscription is no longer available.");

  const isOwn  = currentUser?.email === creatorEmail;
  let isSubbed = false;
  if (currentUser && !isOwn) {
    const subs = await loadUserSubs();
    // Match on creatorEmail only — no tierId dependency
    isSubbed = subs.some(s =>
      s.userEmail    === currentUser.email &&
      s.creatorEmail === creatorEmail
    );
  }

  const priceStr = !sub.price || sub.price === 0
    ? 'Free' : `₱${Number(sub.price).toLocaleString()}/mo`;

  // perks: normalise comma-string or JSONB array → string array
  let perks = [];
  if (Array.isArray(sub.perks)) perks = sub.perks.filter(Boolean);
  else if (typeof sub.perks === 'string' && sub.perks.trim())
    perks = sub.perks.split(',').map(p => p.trim()).filter(Boolean);

  let cta = '';
  if (isOwn) {
    cta = `<button class="cf-cta cf-cta-ghost" disabled>Your Plan</button>`;
  } else if (isSubbed) {
    cta = `<button class="cf-cta cf-cta-ghost" disabled>✓ Already Subscribed</button>`;
  } else {
    cta = `<button class="cf-cta cf-cta-star"
                   onclick="cfSubscribeTier('${escHtml(sub.id)}','${escHtml(creatorEmail)}',${sub.price || 0},this)">
             🌟 Subscribe · ${escHtml(priceStr)}
           </button>`;
  }

  return `
  <div class="cf-card cf-card-sub">
    <div class="cf-card-icon">🌟</div>
    <div class="cf-card-body">
      <div class="cf-card-top">
        <span class="cf-chip">Subscription</span>
        <span class="cf-chip cf-chip-paid">${escHtml(priceStr)}</span>
      </div>
      <div class="cf-card-title">${escHtml(sub.name || 'Study Subscription')}</div>
      ${sub.description
        ? `<div class="cf-card-desc">
             ${escHtml(sub.description.slice(0, 100))}${sub.description.length > 100 ? '…' : ''}
           </div>`
        : ''}
      ${perks.length
        ? `<ul class="cf-perks">
             ${perks.slice(0, 4).map(pk => `<li>✓ ${escHtml(pk)}</li>`).join('')}
           </ul>`
        : ''}
      <div class="cf-card-actions">${cta}</div>
    </div>
  </div>`;
}

/* ── Quiz card ─────────────────────────────────────────────── */
async function _renderQuizCard(post) {
  const rows = await sbSelect('quizzes', { id: post.linkedItemId });
  const quiz = rows[0];
  if (!quiz) return _cfMissingCard('Quiz no longer available.');

  const questions    = Array.isArray(quiz.questions) ? quiz.questions : [];
  const isOwn        = currentUser?.email === quiz.creator_email;
  const access       = quiz.access || 'free';
  const price        = Number(quiz.price) || 0;
  const isFree       = access === 'free';
  const isSubOnly    = access === 'subscription' || access === 'paid'; // 'paid' is legacy
  const isPriced     = access === 'priced';
  const priceStr     = `₱${price.toLocaleString()}`;
  const preview      = questions[0]?.question || '';

  // Determine access
  let canTake = isFree || isOwn;
  if (!canTake && currentUser) {
    if (isSubOnly)  canTake = await isSubscribedTo(quiz.creator_email);
    if (isPriced)   canTake = await _cfHasPaidForQuiz(quiz.id);
  }

  // Badge
  let accessChip = '';
  if (isFree)      accessChip = `<span class="cf-chip cf-chip-free">🌐 Free</span>`;
  else if (isSubOnly) accessChip = `<span class="cf-chip cf-chip-paid">🔒 Subscribers</span>`;
  else if (isPriced)  accessChip = `<span class="cf-chip cf-chip-priced">💰 ${escHtml(priceStr)}</span>`;

  // CTA
  let cta = '';
  if (isOwn) {
    cta = `<button class="cf-cta cf-cta-ghost" disabled>Your Quiz</button>`;
  } else if (canTake) {
    cta = `<button class="cf-cta"
                   onclick="cfOpenQuiz('${escHtml(quiz.id)}')">
             🧠 Take Quiz · ${questions.length} Q${questions.length !== 1 ? 's' : ''}
           </button>`;
  } else if (isSubOnly) {
    cta = `<button class="cf-cta cf-cta-locked"
                   onclick="openQuizPaywall('${escHtml(quiz.id)}','${escHtml(quiz.title||'')}',${questions.length},'${escHtml(quiz.creator_email)}')">
             🔒 Subscribers Only
           </button>`;
  } else if (isPriced) {
    cta = `<button class="cf-cta"
                   onclick="cfPayForQuiz('${escHtml(quiz.id)}','${escHtml(quiz.title||'')}',${price},'${escHtml(quiz.creator_email)}',this)">
             💰 Unlock · ${escHtml(priceStr)}
           </button>`;
  }

  return `
  <div class="cf-card cf-card-quiz">
    <div class="cf-card-icon">🧠</div>
    <div class="cf-card-body">
      <div class="cf-card-top">
        <span class="cf-chip">Quiz</span>
        ${quiz.subject ? `<span class="cf-chip cf-chip-sub">📚 ${escHtml(quiz.subject)}</span>` : ''}
        ${accessChip}
      </div>
      <div class="cf-card-title">${escHtml(quiz.title || 'Untitled Quiz')}</div>
      ${preview
        ? `<div class="cf-card-desc">
             "${escHtml(preview.slice(0, 110))}${preview.length > 110 ? '…' : ''}"
           </div>`
        : ''}
      <div class="cf-card-meta">
        ${questions.length} question${questions.length !== 1 ? 's' : ''} ·
        ${quiz.attempts || 0} attempt${(quiz.attempts || 0) !== 1 ? 's' : ''}
      </div>
      <div class="cf-card-actions">${cta}</div>
    </div>
  </div>`;
}

/* Check if the current user has already paid for a specific quiz */
async function _cfHasPaidForQuiz(quizId) {
  if (!currentUser) return false;
  const rows = await sbSelect('purchases', { user_email: currentUser.email, product_id: quizId });
  return rows.length > 0;
}

/* Pay fixed price for a quiz then launch it */
async function cfPayForQuiz(quizId, quizTitle, price, creatorEmail, btn) {
  if (!currentUser) { showToast('Please log in first.'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

  try {
    // Guard: already purchased — just open it
    const alreadyPaid = await _cfHasPaidForQuiz(quizId);
    if (alreadyPaid) {
      cfOpenQuiz(quizId);
      if (btn) { btn.disabled = false; btn.textContent = `💰 Unlock · ₱${price}`; }
      return;
    }

    if (price <= 0) {
      // Free — record and open immediately
      const { error: freeErr } = await sb.from('purchases').insert({
        id:           'purch_quiz_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
        user_email:   currentUser.email,
        product_id:   quizId,
        price:        0,
        purchased_at: new Date().toISOString(),
      });
      if (freeErr) console.error('cfPayForQuiz free insert:', freeErr.message);
      const rows = await sbSelect('quizzes', { id: quizId });
      if (rows[0]) cfOpenQuiz(quizId);
      if (btn) { btn.disabled = false; }
      return;
    }

    const priceLabel = `💰 Unlock · ₱${price}`;

    // Open checkout modal
    openCheckoutModal({
      type:  'quiz',
      id:    quizId,
      title: quizTitle,
      price,
      label: 'One-time quiz unlock',
      creatorEmail,
      btnEl: btn,
      onSuccess: async () => {
        const { error: paidErr } = await sb.from('purchases').insert({
          id:           'purch_quiz_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
          user_email:   currentUser.email,
          product_id:   quizId,
          price:        Number(price) || 0,
          purchased_at: new Date().toISOString(),
        });
        if (paidErr) console.error('cfPayForQuiz paid insert:', paidErr.message);
        // Refresh creator stats so revenue registers immediately
        if (typeof loadCreatorStats === 'function' && currentUser) {
          loadCreatorStats(currentUser).catch(() => {});
        }
        if (btn) { btn.disabled = false; btn.textContent = priceLabel; }
        invalidateFeedCache();
        await renderFeed();
        cfOpenQuiz(quizId);
      },
    });

    // Restore button — checkout modal takes over from here.
    // If user cancels, the button must be clickable again.
    if (btn) { btn.disabled = false; btn.textContent = priceLabel; }

  } catch (err) {
    console.error('cfPayForQuiz:', err);
    showToast('Could not process payment. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = `💰 Unlock · ₱${price}`; }
  }
}

function _cfMissingCard(msg) {
  return `<div class="cf-card cf-card-missing">${msg}</div>`;
}


/* ══════════════════════════════════════════════════════════════
   SECTION 4 — CTA ACTION HANDLERS
══════════════════════════════════════════════════════════════ */

/** Get (free) or purchase (paid) a product */
async function cfGetProduct(productId, btn) {
  if (!currentUser) { showToast('Please log in first.'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

  try {
    const rows = await sbSelect('products', { id: productId });
    const p    = rows[0];
    if (!p) throw new Error('Product not found');

    const isFree   = !p.price || p.price === 0;
    const priceStr = `₱${Number(p.price).toLocaleString()}`;

    if (isFree) {
      // Free — record immediately, no checkout needed
      const purchases  = Array.isArray(p.purchases)   ? [...p.purchases]   : [];
      const accessList = Array.isArray(p.access_list) ? [...p.access_list] : [];
      if (!purchases.includes(currentUser.email))  purchases.push(currentUser.email);
      if (!accessList.includes(currentUser.email)) accessList.push(currentUser.email);
      await sbUpsert('purchases', {
        id:         'purch_' + Date.now(),
        user_email: currentUser.email,
        product_id: productId,
        price:      0,
      }, 'id');
      await sbUpdate('products', productId, { purchases, access_list: accessList });
      showToast('📥 Added to your library!');
      if (btn) { btn.disabled = false; }
      invalidateFeedCache();
      await renderFeed();
      return;
    }

    // Paid — open checkout modal; _recordPurchase in profile.js handles DB write on confirm
    openCheckoutModal({
      type:         'product',
      id:           productId,
      title:        p.title || 'Product',
      price:        p.price,
      creatorEmail: p.creator_email,
      btnEl:        btn,
    });

    // Restore button — checkout modal takes over from here
    if (btn) { btn.disabled = false; btn.textContent = `🛒 Buy · ${priceStr}`; }

  } catch (err) {
    console.error('cfGetProduct:', err);
    showToast('Something went wrong. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = 'Buy'; }
  }
}



/* FIX 4 — cfSubscribeTier: delegates to _confirmSubscription (app.js)
   so all subscribe write logic lives in one place.
   Removed the existing-sub id re-use pattern — it was causing silent
   UNIQUE(user_email, creator_email) constraint violations when the
   same user subscribed again after the creator recreated their plan
   (new sub id, same email pair). saveUserSubs now upserts on the
   unique pair so _confirmSubscription is safe to call directly. */
async function cfSubscribeTier(tierId, creatorEmail, price, btn) {
  if (!currentUser) { showToast('Please log in first.'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Subscribing…'; }

  try {
    // Resolve the live subscription from DB (handles stale tierId gracefully)
    const sub = await getCreatorSubscription(creatorEmail);
    if (!sub) { showToast("This creator hasn't set up a subscription yet."); return; }

    // Route through checkout modal — same as product/quiz purchases
    openCheckoutModal({
      type:         'subscription',
      id:           sub.id,
      title:        sub.name || 'Subscription',
      price:        sub.price || 0,
      creatorEmail,
      btnEl:        btn,
    });

    // Restore button — checkout modal takes over from here
    if (btn) { btn.disabled = false; btn.textContent = '🌟 Subscribe'; }

  } catch (err) {
    console.error('cfSubscribeTier:', err);
    showToast('Subscription failed. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = '🌟 Subscribe'; }
  }
}

/** Open a quiz — delegates to launchQuizPlayer (creator.js/app.js)
    so the feed uses the same polished player as Creator Hub and Backpack. */
async function cfOpenQuiz(quizId) {
  if (!currentUser) { showToast('Please log in first.'); return; }

  const rows = await sbSelect('quizzes', { id: quizId });
  const quiz = rows[0];
  if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) {
    showToast('Quiz not available.');
    return;
  }

  // Normalise the quiz object shape to match what launchQuizPlayer expects
  const normalised = {
    id:          quiz.id,
    title:       quiz.title       || '',
    subject:     quiz.subject     || '',
    questions:   quiz.questions   || [],
    attempts:    quiz.attempts    || 0,
    creatorEmail: quiz.creator_email || '',
  };

  if (typeof launchQuizPlayer === 'function') {
    launchQuizPlayer(normalised, false);
  } else {
    showToast('Quiz player not available. Please refresh the page.');
  }
}


/* ══════════════════════════════════════════════════════════════
   SECTION 5 — UTILITIES
══════════════════════════════════════════════════════════════ */

function _removeShareModal() {
  document.getElementById('_cf-share-modal')?.remove();
}

function _makeOverlay(id) {
  const el = document.createElement('div');
  el.id    = id;
  el.style.cssText = [
    'position:fixed', 'inset:0', 'background:rgba(0,0,0,.55)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'z-index:9999', 'padding:16px', 'overflow-y:auto',
  ].join(';');
  return el;
}

// Share → opens destination picker first
function shareProductToFeed(productId) { _openPublishPicker('product', productId); }
function shareTierToFeed(tierId)       { _cfStep3('subscription', tierId); }
function shareQuizToFeed(quizId)       { _openPublishPicker('quiz', quizId); }

function _openPublishPicker(postType, itemId) {
  _removeShareModal();
  const typeLabel = postType === 'product' ? 'Product' : 'Quiz';
  const overlay   = _makeOverlay('_cf-share-modal');

  overlay.innerHTML = `
    <div class="_cf-box" onclick="event.stopPropagation()">
      <div class="_cf-header">
        <span class="_cf-title">📢 Publish ${typeLabel}</span>
        <button class="_cf-close" onclick="_removeShareModal()">✕</button>
      </div>
      <p class="_cf-sub">Choose where to publish. You can publish to one or both destinations.</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px" id="_cf-dest-opts">
        <div class="_cf-dest-opt" data-dest="profile">
          <div class="_cf-dest-icon">👤</div>
          <div style="flex:1;min-width:0">
            <div class="_cf-dest-title">My Store / Profile</div>
            <div class="_cf-dest-desc">Visible on your profile page under Products or Quizzes</div>
          </div>
          <div class="_cf-dest-check"></div>
        </div>
        <div class="_cf-dest-opt" data-dest="feed">
          <div class="_cf-dest-icon">📰</div>
          <div style="flex:1;min-width:0">
            <div class="_cf-dest-title">Feed</div>
            <div class="_cf-dest-desc">Appears in the public feed for all users to discover</div>
          </div>
          <div class="_cf-dest-check"></div>
        </div>
      </div>
      <div class="_cf-footer">
        <button class="_cf-cancel" onclick="_removeShareModal()">Cancel</button>
        <button class="_cf-submit" onclick="_cfDestNext('${postType}','${itemId}')">Next →</button>
      </div>
    </div>`;

  // Wire toggles after inserting HTML
  overlay.querySelectorAll('._cf-dest-opt').forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      opt.classList.toggle('selected');
    });
  });

  document.body.appendChild(overlay);
}

async function _cfDestNext(postType, itemId) {
  const selected = [...document.querySelectorAll('._cf-dest-opt.selected')].map(o => o.dataset.dest);
  if (!selected.length) { showToast('Please select at least one destination.'); return; }

  const profileChk = selected.includes('profile');
  const feedChk    = selected.includes('feed');

  if (profileChk) {
    try {
      const table = postType === 'product' ? 'products' : 'quizzes';
      await sb.from(table).update({ profile_visible: true }).eq('id', itemId);
    } catch(e) { console.error('profile publish:', e); showToast('Could not publish to profile.'); return; }
  }

  if (feedChk) {
    window._cfPendingProfileVisible = !!profileChk;
    window._cfPendingItemId         = itemId;
    _cfStep3(postType, itemId);
  } else {
    _removeShareModal();
    const dest = postType === 'product' ? 'store' : 'quizzes';
    showToast(`✅ Published to your ${dest}!`);
    if (typeof loadCreatorProducts === 'function' && postType === 'product') loadCreatorProducts(window._creatorUser || currentUser);
    if (typeof loadCreatorQuizzes  === 'function' && postType === 'quiz')    loadCreatorQuizzes(window._creatorUser || currentUser);
  }
}


/* ══════════════════════════════════════════════════════════════
   SECTION 6 — STYLES  (injected once into <head>)
══════════════════════════════════════════════════════════════ */

(function _injectStyles() {
  if (document.getElementById('_cf-styles')) return;
  const s = document.createElement('style');
  s.id = '_cf-styles';
  s.textContent = `

  /* ─── DESTINATION PICKER ─────────────────────────────────── */
  ._cf-dest-opt {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 16px; border-radius: var(--radius-lg); cursor: pointer;
    border: 1.5px solid var(--border-card);
    background: var(--bg-card);
    transition: border-color .15s, background .15s;
    user-select: none;
  }
  ._cf-dest-opt.selected {
    border-color: var(--brand-accent);
    background: var(--accent);
  }
  ._cf-dest-icon  { font-size: 1.4rem; flex-shrink: 0; }
  ._cf-dest-title { font-weight: 700; font-size: .88rem; color: var(--text-primary); margin-bottom: 2px; }
  ._cf-dest-desc  { font-size: .76rem; color: var(--text-light); line-height: 1.4; }
  ._cf-dest-check {
    flex-shrink: 0;
    width: 22px; height: 22px; border-radius: 50%;
    border: 2px solid var(--border-panel);
    transition: background .15s, border-color .15s;
  }
  ._cf-dest-opt.selected ._cf-dest-check {
    background: var(--brand-accent);
    border-color: var(--brand-accent);
  }

  /* ─── SHARE PICKER & QUIZ MODAL ─────────────────────────── */
  ._cf-box {
    background: var(--bg-card);
    border-radius: var(--radius-xl);
    padding: 24px 26px;
    width: 100%; max-width: 460px;
    box-shadow: 0 20px 60px rgba(0,0,0,.28);
  }

  ._cf-header {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 16px;
  }
  ._cf-title {
    flex: 1;
    font-family: var(--font-display);
    font-size: 1.02rem; font-weight: 700;
    color: var(--text-primary);
  }
  ._cf-sub {
    font-size: .88rem; color: var(--text-light);
    margin-bottom: 16px;
  }
  ._cf-close, ._cf-back {
    background: none; border: none; cursor: pointer;
    color: var(--text-light); font-size: .85rem;
    padding: 4px 8px; border-radius: var(--radius-xs);
    transition: background .15s;
  }
  ._cf-close:hover, ._cf-back:hover { background: var(--accent); }

  /* Step 1 — type picker */
  ._cf-type-grid { display: flex; flex-direction: column; gap: 10px; }
  ._cf-type-btn {
    display: flex; align-items: center; gap: 14px;
    background: var(--bg-panel);
    border: 1.5px solid var(--border-panel);
    border-radius: var(--radius-lg); padding: 14px 16px;
    cursor: pointer; text-align: left; width: 100%;
    transition: border-color .15s, background .15s;
  }
  ._cf-type-btn:hover { border-color: var(--brand-accent); background: var(--accent); }
  ._cf-type-icon  { font-size: 1.6rem; flex-shrink: 0; }
  ._cf-type-label {
    display: block;
    font-family: var(--font-display); font-weight: 700;
    font-size: .93rem; color: var(--text-primary);
  }
  ._cf-type-hint  {
    display: block;
    font-size: .76rem; color: var(--text-light); margin-top: 2px;
  }

  /* Step 2 — item list */
  ._cf-item-list {
    display: flex; flex-direction: column; gap: 8px;
    max-height: 320px; overflow-y: auto;
  }
  ._cf-item-row {
    display: flex; align-items: center; gap: 12px;
    background: var(--bg-panel);
    border: 1.5px solid var(--border-panel);
    border-radius: var(--radius-md); padding: 12px 14px;
    cursor: pointer; text-align: left; width: 100%;
    transition: border-color .15s;
  }
  ._cf-item-row:hover { border-color: var(--brand-accent); }
  ._cf-item-icon  { font-size: 1.3rem; flex-shrink: 0; }
  ._cf-item-info  { flex: 1; min-width: 0; }
  ._cf-item-name  {
    display: block; font-weight: 600; font-size: .9rem;
    color: var(--text-primary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  ._cf-item-meta  { display: block; font-size: .75rem; color: var(--text-light); margin-top: 2px; }
  ._cf-item-arrow { color: var(--text-light); font-size: 1.3rem; }
  ._cf-empty      {
    color: var(--text-light); font-size: .88rem;
    text-align: center; padding: 24px 0;
  }

  /* Step 3 — caption */
  ._cf-textarea {
    width: 100%; min-height: 90px; resize: vertical;
    padding: 12px 14px;
    border: 1.5px solid var(--border-input); border-radius: var(--radius-md);
    font-family: var(--font-body); font-size: .92rem;
    background: var(--bg-panel); color: var(--text-primary);
    outline: none; transition: border-color .2s;
    display: block;
  }
  ._cf-textarea:focus { border-color: var(--brand-accent); }
  ._cf-hint { font-size: .77rem; color: var(--text-light); margin: 8px 0 18px; }

  /* Footer buttons */
  ._cf-footer { display: flex; gap: 10px; justify-content: flex-end; }
  ._cf-cancel {
    padding: 9px 20px;
    border: 1.5px solid var(--border-input); border-radius: var(--radius-md);
    background: transparent; color: var(--text-primary);
    font-family: var(--font-body); font-size: .88rem; cursor: pointer;
  }
  ._cf-submit {
    padding: 9px 22px; border: none; border-radius: var(--radius-md);
    background: var(--gold-base); color: #fff;
    font-family: var(--font-display); font-size: .88rem; font-weight: 700;
    cursor: pointer; transition: background .18s, opacity .18s;
  }
  ._cf-submit:hover:not(:disabled) { background: var(--gold-mid); }
  ._cf-submit:disabled { opacity: .55; cursor: default; }


  /* ─── EMBEDDED FEED CARD ─────────────────────────────────── */
  .cf-card {
    display: flex; gap: 14px; align-items: flex-start;
    background: var(--bg-panel);
    border: 1.5px solid var(--border-panel);
    border-radius: var(--radius-lg); padding: 16px 18px;
    margin: 10px 0 2px;
    transition: border-color .2s, background var(--trans);
  }
  .cf-card:hover        { border-color: var(--brand-accent); }
  .cf-card-sub          { border-left: 3px solid var(--brand-accent); }
  .cf-card-quiz         { border-left: 3px solid var(--navy-soft); }
  .cf-card-missing      {
    font-size: .82rem; color: var(--text-light);
    font-style: italic; padding: 10px 14px;
    background: var(--bg-panel); border-radius: var(--radius-md);
    margin: 10px 0 2px;
  }

  .cf-card-icon  { font-size: 1.9rem; flex-shrink: 0; margin-top: 2px; }
  .cf-card-body  { flex: 1; min-width: 0; }

  .cf-card-top   { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 6px; }
  .cf-chip {
    font-size: .7rem; font-weight: 700; padding: 2px 9px;
    border-radius: var(--radius-pill); white-space: nowrap;
    background: var(--accent); color: var(--navy-base);
    border: 1px solid var(--border-panel);
  }
  .cf-chip-free   { background: #d1fae5; color: #065f46; border-color: #a7f3d0; }
  .cf-chip-paid   { background: #fef3c7; color: #92400e; border-color: #fde68a; }
  .cf-chip-priced { background: #fefce8; color: #a16207; border-color: #fde68a; }
  .cf-chip-sub    { background: var(--accent); color: var(--navy-base); }

  .cf-card-title {
    font-family: var(--font-display);
    font-size: .97rem; font-weight: 700;
    color: var(--text-primary); margin-bottom: 4px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cf-card-desc  { font-size: .8rem; color: var(--text-light); margin-bottom: 8px; line-height: 1.45; }
  .cf-card-meta  { font-size: .75rem; color: var(--text-light); margin-bottom: 10px; }

  .cf-perks {
    list-style: none; margin: 0 0 10px; padding: 0;
    font-size: .78rem; color: var(--text-primary);
    display: flex; flex-direction: column; gap: 3px;
  }
  .cf-card-actions { display: flex; gap: 8px; flex-wrap: wrap; }

  /* CTA buttons */
  .cf-cta {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 8px 16px; border: none; border-radius: var(--radius-sm);
    background: var(--gold-base); color: #fff;
    font-family: var(--font-display); font-size: .82rem; font-weight: 700;
    cursor: pointer; transition: background .18s, opacity .18s;
  }
  .cf-cta:hover:not(:disabled) { background: var(--gold-mid); }
  .cf-cta:disabled              { opacity: .55; cursor: default; }
  .cf-cta-ghost {
    background: transparent; color: var(--navy-base);
    border: 1.5px solid var(--navy-soft);
  }
  .cf-cta-ghost:hover:not(:disabled) { background: var(--accent); border-color: var(--navy-base); }
  .cf-cta-star   { background: linear-gradient(135deg, var(--gold-base), var(--gold-light)); }
  .cf-cta-locked {
    background: var(--accent); color: var(--text-light);
    border: 1.5px solid var(--border-panel);
  }
  `;
  document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════
   WIRING INTO CREATOR.JS
   ──────────────────────
   Add a "Share to Feed" button inside each card builder.

   PRODUCT card — inside .cp-product-actions (or equivalent):
   ───────────────────────────────────────────────────────────
   <button class="cp-btn-secondary"
           onclick="shareProductToFeed('${p.id}')">
     📢 Share to Feed
   </button>

   SUBSCRIPTION card — inside the subscription card actions:
   ───────────────────────────────────────────────────────────
   <button class="cp-btn-secondary"
           onclick="shareTierToFeed('${sub.id}')">
     📢 Share to Feed
   </button>

   QUIZ card — inside the quiz card actions:
   ───────────────────────────────────────────────────────────
   <button class="cp-btn-secondary"
           onclick="shareQuizToFeed('${quiz.id}')">
     📢 Share to Feed
   </button>
══════════════════════════════════════════════════════════════ */
