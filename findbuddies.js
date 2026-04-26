/* ═══════════════════════════════════════════════════════════
   STUDY BUDDY — findbuddies.js
   Find Buddies page: render, filter, connect, match requests.

   Dependencies (globals from other files):
     app.js      → currentUser, AVATAR_COLORS, loadAccounts,
                   loadMatches, saveMatches, updateSidebarBadges,
                   renderMatches, getInitials, getCreatorBadgeHTML,
                   escHtml, showToast, findAccountByEmail,
                   openMessagesWith, appNav
     profile.js  → openUserProfile

   This file defines:
     renderBuddies()       — render the buddy card grid
     getBuddyPool()        — returns filtered array of other accounts
     filterBuddies()       — called by search/filter inputs oninput
     sendMatchRequest()    — send a new buddy connect request
     connectFromPost()     — connect from a feed post (used in app.js)
     getMatchBetween()     — utility: find a match between two emails
   ═══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════
   IN-MEMORY MATCH CACHE
   Loaded once per page visit, invalidated on write.
   Avoids repeated Supabase round-trips inside the same
   interaction (e.g. renderBuddies → sendMatchRequest).
══════════════════════════════════════ */
let _buddyMatchCache = null;   // null = stale, array = fresh

async function _getMatches() {
  if (!_buddyMatchCache) _buddyMatchCache = await loadMatches();
  return _buddyMatchCache;
}

function _invalidateMatchCache() {
  _buddyMatchCache = null;
}

/* ══════════════════════════════════════
   UTILITY — getMatchBetween
══════════════════════════════════════ */
async function getMatchBetween(emailA, emailB) {
  const matches = await _getMatches();
  return matches.find(m =>
    (m.from === emailA && m.to === emailB) ||
    (m.from === emailB && m.to === emailA)
  ) || null;
}

/* ══════════════════════════════════════
   GET BUDDY POOL
══════════════════════════════════════ */
async function getBuddyPool() {
  if (!currentUser) return [];
  const all = await loadAccounts();
  return all.filter(a => a.email.toLowerCase() !== currentUser.email.toLowerCase());
}

/* ══════════════════════════════════════
   RENDER BUDDIES
   Batches loadAccounts + loadMatches in parallel.
══════════════════════════════════════ */
async function renderBuddies(filteredPool) {
  const grid = document.getElementById('buddy-grid');
  if (!grid) return;

  const [pool, matches] = await Promise.all([
    filteredPool !== undefined ? Promise.resolve(filteredPool) : getBuddyPool(),
    _getMatches(),
  ]);

  if (!pool.length) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-light);grid-column:1/-1">No students match your filters yet.</div>';
    return;
  }

  grid.innerHTML = pool.map(b => {
    const match = currentUser
      ? matches.find(m =>
          (m.from === currentUser.email && m.to === b.email) ||
          (m.from === b.email && m.to === currentUser.email))
      : null;
    const isConnected = match && match.status === 'accepted';
    const isSent      = match && match.from === (currentUser ? currentUser.email : '') && match.status === 'pending';

    const btnLabel = isConnected ? '✓ Connected' : isSent ? '✓ Request Sent' : 'Connect';
    const btnClass = (isConnected || isSent) ? 'connect-btn requested' : 'connect-btn';
    const disabled = (isConnected || isSent) ? 'disabled' : '';
    const msgBtn   = isConnected
      ? `<button class="buddy-msg-btn" onclick="openMessagesWith('${escHtml(b.email)}')">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
           Message
         </button>`
      : '';

    const subjects = Array.isArray(b.subjects) ? b.subjects : [];
    return `
    <div class="buddy-card">
      <div class="buddy-card-avatar" style="background:${b.avatarColor || AVATAR_COLORS[0]};cursor:pointer"
           onclick="openUserProfile('${escHtml(b.email)}')"
           title="View profile">${escHtml(getInitials(b))}</div>
      <h4 style="cursor:pointer" onclick="openUserProfile('${escHtml(b.email)}')">${escHtml(b.name)}${getCreatorBadgeHTML(b.email)}</h4>
      <p class="buddy-headline">${escHtml(b.headline || 'Student · Study Buddy')}</p>
      <div class="buddy-subjects">${subjects.map(s => `<span class="buddy-subj-tag">${escHtml(s)}</span>`).join('')}</div>
      <p class="buddy-card-meta">
        ${b.schedule ? '📅 ' + escHtml(b.schedule) + ' · ' : ''}
        ${b.style    ? '🎯 ' + escHtml(b.style)            : ''}
      </p>
      <div class="buddy-card-actions">
        <button class="buddy-view-btn" onclick="openUserProfile('${escHtml(b.email)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          View Profile
        </button>
        <button class="${btnClass}" onclick="sendMatchRequest('${escHtml(b.email)}', this)" ${disabled}>
          ${btnLabel}
        </button>
        ${msgBtn}
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════
   FILTER BUDDIES
══════════════════════════════════════ */
async function filterBuddies() {
  const query    = (document.getElementById('buddy-search')?.value    || '').toLowerCase();
  const subject  =  document.getElementById('filter-subject')?.value  || '';
  const schedule =  document.getElementById('filter-schedule')?.value || '';
  const course   =  document.getElementById('filter-course')?.value   || '';

  const rawPool = await getBuddyPool();
  const pool = rawPool.filter(b => {
    const subjects = Array.isArray(b.subjects) ? b.subjects : [];
    return (
      (!query    || b.name.toLowerCase().includes(query) || subjects.some(s => s.toLowerCase().includes(query))) &&
      (!subject  || subjects.includes(subject)) &&
      (!schedule || b.schedule === schedule) &&
      (!course   || b.course === course || b.style === course)
    );
  });
  renderBuddies(pool);
}

/* ══════════════════════════════════════
   SEND MATCH REQUEST
   Optimistic UI: button updates INSTANTLY.
   DB write + background refreshes happen after.
══════════════════════════════════════ */
async function sendMatchRequest(toEmail, btn) {
  if (!currentUser) return;

  // ── 1. Instant visual feedback — no waiting ──
  if (btn) {
    btn.textContent = '✓ Request Sent';
    btn.classList.add('requested');
    btn.disabled = true;
  }

  // ── 2. Guard against duplicates (uses cache, no extra DB call) ──
  const existing = await getMatchBetween(currentUser.email, toEmail);
  if (existing) return;

  // ── 3. Write to DB ──
  const newMatch = {
    id:     'match_' + Date.now(),
    from:   currentUser.email,
    to:     toEmail,
    status: 'pending',
  };
  _invalidateMatchCache();
  const matches = await loadMatches();
  matches.push(newMatch);
  await saveMatches(matches);

  showToast('Connection request sent!');

  // ── 4. Background refresh — fire and forget, doesn't block ──
  Promise.all([renderMatches(), updateSidebarBadges()]);
}

/* ══════════════════════════════════════
   CONNECT FROM POST
   Same optimistic pattern for feed post Connect buttons.
══════════════════════════════════════ */
async function connectFromPost(toEmail, btn) {
  if (!currentUser) return;

  // ── Instant visual feedback ──
  if (btn) {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg> Request Sent`;
    btn.disabled = true;
  }

  const existing = await getMatchBetween(currentUser.email, toEmail);
  if (existing) return;

  const newMatch = {
    id:     'match_' + Date.now(),
    from:   currentUser.email,
    to:     toEmail,
    status: 'pending',
  };
  _invalidateMatchCache();
  const matches = await loadMatches();
  matches.push(newMatch);
  await saveMatches(matches);

  // Background refresh
  updateSidebarBadges();
}
