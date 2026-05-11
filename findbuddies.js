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

    const actionBtn = isConnected
      ? `<button class="buddy-card-btn buddy-card-btn--primary" onclick="openMessagesWith('${escHtml(b.email)}')">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
           Message
         </button>`
      : isSent
      ? `<button class="buddy-card-btn buddy-card-btn--sent" disabled>✓ Request Sent</button>`
      : `<button class="buddy-card-btn buddy-card-btn--primary" onclick="sendMatchRequest('${escHtml(b.email)}', this)">Connect</button>`;

    const subjects = Array.isArray(b.subjects) ? b.subjects : [];
    const subjId = 'subj-' + b.email.replace(/[^a-z0-9]/gi, '_');
    return `
    <div class="buddy-card">
      <div class="buddy-card-avatar" style="background:${avatarColor(b)};cursor:pointer"
           onclick="openUserProfile('${escHtml(b.email)}')"
           title="View profile">${escHtml(getInitials(b))}</div>
      <div class="buddy-card-body-col">
        <h4 style="cursor:pointer" onclick="openUserProfile('${escHtml(b.email)}')">${escHtml(b.name)}${getCreatorBadgeHTML(b.email)}</h4>
        <p class="buddy-headline">${escHtml(b.headline || 'Student · Study Buddy')}</p>
        <div class="buddy-subjects-wrap">
          <div class="buddy-subjects" id="${subjId}">${subjects.map(s => `<span class="buddy-subj-tag">${escHtml(s)}</span>`).join('')}</div>
          <div class="buddy-subjects-fade hidden" id="${subjId}-fade"></div>
        </div>
        <p class="buddy-card-meta">
          ${b.schedule ? '📅 ' + escHtml(b.schedule) + ' · ' : ''}
          ${b.style    ? '🎯 ' + escHtml(b.style)            : ''}
        </p>
        <div class="buddy-card-spacer"></div>
        <div class="buddy-card-actions">
          <button class="buddy-card-btn" onclick="openUserProfile('${escHtml(b.email)}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            View Profile
          </button>
          ${actionBtn}
        </div>
      </div>
    </div>`;
  }).join('');

  /* ── Init subject-area scroll fade for each card ── */
  requestAnimationFrame(() => {
    pool.forEach(b => {
      const subjId = 'subj-' + b.email.replace(/[^a-z0-9]/gi, '_');
      const el   = document.getElementById(subjId);
      const fade = document.getElementById(subjId + '-fade');
      if (!el || !fade) return;
      const check = () => {
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
        fade.classList.toggle('hidden', atBottom);
      };
      el.addEventListener('scroll', check);
      check();
    });
  });
}

/* ══════════════════════════════════════
   FILTER BUDDIES
══════════════════════════════════════ */
let _buddyCreatorOnly = false;

/* ── Creators-only toggle for Find Buddies ── */
function toggleBuddyCreatorFilter() {
  _buddyCreatorOnly = !_buddyCreatorOnly;
  const btn = document.getElementById('buddy-creator-toggle');
  if (btn) {
    btn.classList.toggle('active', _buddyCreatorOnly);
    btn.title = _buddyCreatorOnly ? 'Show all buddies' : 'Show creators only';
    const lbl = btn.querySelector('.toggle-label');
    if (lbl) lbl.textContent = _buddyCreatorOnly ? 'All' : 'Creators';
  }
  filterBuddies();
}

async function filterBuddies() {
  const query    = (document.getElementById('buddy-search')?.value    || '').toLowerCase();
  const subject  =  document.getElementById('filter-subject')?.value  || '';
  const schedule =  document.getElementById('filter-schedule')?.value || '';
  const course   =  document.getElementById('filter-course')?.value   || '';

  const rawPool = await getBuddyPool();
  const pool = rawPool.filter(b => {
    const subjects = Array.isArray(b.subjects) ? b.subjects : [];
    // Creators-only: check accountType or isCreator flag
    const matchCreator = !_buddyCreatorOnly || b.accountType === 'creator' || b.isCreator;
    return (
      matchCreator &&
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
    btn.classList.remove('buddy-card-btn--primary');
    btn.classList.add('buddy-card-btn--sent');
    btn.disabled = true;
    btn.onclick = null;
  }

  // ── 2. Guard against duplicates — but allow re-send after decline ──
  const existing = await getMatchBetween(currentUser.email, toEmail);
  if (existing) {
    // Already connected or pending — do nothing (optimistic UI already fired)
    if (existing.status === 'accepted' || existing.status === 'pending') return;
    // Declined — delete the stale row so we can create a fresh pending request
    if (existing.status === 'declined') {
      await sbDelete('matches', 'id', existing.id);
      _invalidateMatchCache();
    }
  }

  // ── 3. Write fresh pending row to DB ──
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

/* ═══════════════════════════════════════════════════════════
   FILTER BUTTON — dropdown (desktop) / bottom sheet (mobile)
   MY BUDDIES — toggleable view
   ═══════════════════════════════════════════════════════════ */

function _isMobile() { return window.innerWidth < 640; }

/* ── Open / close router ── */
function toggleBuddyFilter() {
  _isMobile() ? _openSheet() : _toggleDropdown();
}

function closeBuddyFilter() {
  _closeDropdown();
  _closeSheet();
}

/* ── Desktop dropdown ── */
function _toggleDropdown() {
  const btn      = document.getElementById('buddy-filter-btn');
  const dropdown = document.getElementById('buddy-filter-dropdown');
  if (!btn || !dropdown) return;
  if (dropdown.classList.contains('open')) {
    _closeDropdown();
  } else {
    dropdown.classList.add('open');
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', _outsideDropdownClick), 0);
  }
}

function _closeDropdown() {
  const btn      = document.getElementById('buddy-filter-btn');
  const dropdown = document.getElementById('buddy-filter-dropdown');
  if (dropdown) dropdown.classList.remove('open');
  if (btn) { btn.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  document.removeEventListener('click', _outsideDropdownClick);
}

function _outsideDropdownClick(e) {
  const wrap = document.querySelector('.buddy-filter-wrap');
  if (wrap && !wrap.contains(e.target)) _closeDropdown();
}

/* ── Mobile bottom sheet ── */
function _openSheet() {
  const sheet   = document.getElementById('buddy-filter-sheet');
  const overlay = document.getElementById('buddy-sheet-overlay');
  const btn     = document.getElementById('buddy-filter-btn');
  if (sheet)   sheet.classList.add('open');
  if (overlay) overlay.classList.add('open');
  if (btn)     btn.classList.add('open');
  _syncSheetFromMain();
}

function _closeSheet() {
  const sheet   = document.getElementById('buddy-filter-sheet');
  const overlay = document.getElementById('buddy-sheet-overlay');
  const btn     = document.getElementById('buddy-filter-btn');
  if (sheet)   sheet.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  if (btn)     btn.classList.remove('open');
}

/* Sync sheet selects from the main hidden selects when opening */
function _syncSheetFromMain() {
  [['filter-subject','filter-subject-sheet'],
   ['filter-schedule','filter-schedule-sheet'],
   ['filter-course','filter-course-sheet']].forEach(([mainId, sheetId]) => {
    const main  = document.getElementById(mainId);
    const sheet = document.getElementById(sheetId);
    if (main && sheet) sheet.value = main.value;
  });
}

/* Called by each sheet select oninput — mirrors value to main select */
function syncSheetFilter(type) {
  const map = {
    subject:  ['filter-subject-sheet',  'filter-subject'],
    schedule: ['filter-schedule-sheet', 'filter-schedule'],
    course:   ['filter-course-sheet',   'filter-course'],
  };
  const [sheetId, mainId] = map[type] || [];
  const sheet = document.getElementById(sheetId);
  const main  = document.getElementById(mainId);
  if (sheet && main) main.value = sheet.value;
}

/* ── Apply filters ── */
function applyBuddyFilters() {
  /* Sync sheet → main first (handles mobile apply tap) */
  [['filter-subject-sheet','filter-subject'],
   ['filter-schedule-sheet','filter-schedule'],
   ['filter-course-sheet','filter-course']].forEach(([sheetId, mainId]) => {
    const sheet = document.getElementById(sheetId);
    const main  = document.getElementById(mainId);
    if (sheet && main) main.value = sheet.value;
  });
  closeBuddyFilter();
  filterBuddies();
  _updateFilterState();
}

/* ── Clear all filters ── */
function clearBuddyFilters() {
  ['filter-subject','filter-schedule','filter-course',
   'filter-subject-sheet','filter-schedule-sheet','filter-course-sheet'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Reset the creator-only toggle
  _buddyCreatorOnly = false;
  const btn = document.getElementById('buddy-creator-toggle');
  if (btn) {
    btn.classList.remove('active');
    const lbl = btn.querySelector('.toggle-label');
    if (lbl) lbl.textContent = 'Creators';
  }
  closeBuddyFilter();
  filterBuddies();
  _updateFilterState();
}

/* ── Remove one filter pill ── */
function clearOneFilter(key) {
  const map = { subject: 'filter-subject', schedule: 'filter-schedule', course: 'filter-course' };
  const el = document.getElementById(map[key]);
  if (el) el.value = '';
  filterBuddies();
  _updateFilterState();
}

/* ── Update active-filter dot + pills row ── */
function _updateFilterState() {
  const subject  = document.getElementById('filter-subject')?.value  || '';
  const schedule = document.getElementById('filter-schedule')?.value || '';
  const course   = document.getElementById('filter-course')?.value   || '';

  const btn   = document.getElementById('buddy-filter-btn');
  const pills = document.getElementById('buddy-active-pills');
  if (!btn || !pills) return;

  const active = [
    subject  && { key: 'subject',  label: subject },
    schedule && { key: 'schedule', label: schedule },
    course   && { key: 'course',   label: course },
  ].filter(Boolean);

  if (active.length) {
    btn.classList.add('has-filters');
    pills.classList.add('visible');
    pills.innerHTML = active.map(f => `
      <span class="buddy-pill">
        ${escHtml(f.label)}
        <span class="buddy-pill-x" onclick="clearOneFilter('${f.key}')" title="Remove filter">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </span>
      </span>`).join('');
  } else {
    btn.classList.remove('has-filters');
    pills.classList.remove('visible');
    pills.innerHTML = '';
  }
}

/* ═══════════════════════════════════════════════════════════
   MY BUDDIES TOGGLE
   ═══════════════════════════════════════════════════════════ */
let _buddyViewMode = 'discover';

async function toggleBuddyView() {
  _buddyViewMode = _buddyViewMode === 'discover' ? 'buddies' : 'discover';

  const btn      = document.getElementById('buddy-view-toggle');
  const searchEl = document.getElementById('buddy-search');
  const count    = await _countConnected();

  // Update badge count without touching anything else
  const badge = document.getElementById('buddy-connected-count');
  if (badge) badge.textContent = count;

  if (_buddyViewMode === 'buddies') {
    btn.classList.add('active');
    if (searchEl) searchEl.placeholder = 'Search your buddies…';
    closeBuddyFilter();
    _renderBuddiesOnly();
  } else {
    btn.classList.remove('active');
    if (searchEl) searchEl.placeholder = 'Search by name or subject…';
    filterBuddies();
  }
}

async function _countConnected() {
  if (!currentUser) return 0;
  const matches = await _getMatches();
  return matches.filter(m =>
    m.status === 'accepted' &&
    (m.from === currentUser.email || m.to === currentUser.email)
  ).length;
}

async function _renderBuddiesOnly() {
  const [matches, all] = await Promise.all([_getMatches(), loadAccounts()]);
  const query = (document.getElementById('buddy-search')?.value || '').toLowerCase();

  const connectedEmails = matches
    .filter(m => m.status === 'accepted' &&
      (m.from === currentUser?.email || m.to === currentUser?.email))
    .map(m => m.from === currentUser?.email ? m.to : m.from);

  const pool = all.filter(a =>
    connectedEmails.includes(a.email) &&
    (!query || a.name.toLowerCase().includes(query))
  );

  renderBuddies(pool);
}

/* Patch filterBuddies to respect current view mode and update pill state */
const _origFilterBuddies = filterBuddies;
filterBuddies = async function () {
  if (_buddyViewMode === 'buddies') { _renderBuddiesOnly(); return; }
  await _origFilterBuddies();
  _updateFilterState();
};

/* Init connected count badge on page load */
async function _initBuddyToggle() {
  const countEl = document.getElementById('buddy-connected-count');
  if (countEl) countEl.textContent = await _countConnected();
}
document.addEventListener('DOMContentLoaded', _initBuddyToggle);

