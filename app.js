/* ═══════════════════════════════════════
   STUDY BUDDY — app.js  (v2)
   ─ Email-override bug fixed
   ─ Full messaging system
   ─ Realistic test accounts + posts + matches
   ═══════════════════════════════════════ */

/* ──────────────────────────────────────
   STORAGE KEYS
   ────────────────────────────────────── */
const STORAGE_JOINED       = 'sb_joined';      // legacy — kept for backward compat, unused in new flow
const STORAGE_NIGHT        = 'sb-night';

/* ──────────────────────────────────────
   AVATAR COLORS
   ────────────────────────────────────── */
const AVATAR_COLORS = [
  'linear-gradient(135deg,#7c3aed,#a78bfa)',
  'linear-gradient(135deg,#6d28d9,#c4b5fd)',
  'linear-gradient(135deg,#8b5cf6,#ddd6fe)',
  'linear-gradient(135deg,#5b21b6,#a78bfa)',
  'linear-gradient(135deg,#4c1d95,#8b5cf6)',
  'linear-gradient(135deg,#3b0764,#7c3aed)',
  'linear-gradient(135deg,#6d28d9,#f5f3ff)',
  'linear-gradient(135deg,#7c3aed,#ede9fe)',
];

/* ══════════════════════════════════════
   SUPABASE DATA LAYER
   Replaces all localStorage read/write for persistent data.
   sb = supabase client (initialised in index.html)
   Pattern: every load/save function now talks to Supabase.
   localStorage is kept ONLY for STORAGE_NIGHT (theme pref).
══════════════════════════════════════ */

/* ── Generic helpers ── */
async function sbSelect(table, filters = {}) {
  let q = sb.from(table).select('*');
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  const { data, error } = await q;
  if (error) { console.error('sbSelect', table, error.message); return []; }
  return data || [];
}

async function sbUpsert(table, row, conflictCol = 'id') {
  const { error } = await sb.from(table).upsert(row, { onConflict: conflictCol });
  if (error) console.error('sbUpsert', table, error.message);
}

async function sbUpdate(table, id, fields) {
  const { error } = await sb.from(table).update(fields).eq('id', id);
  if (error) console.error('sbUpdate', table, error.message);
}

async function sbDelete(table, col, val) {
  const { error } = await sb.from(table).delete().eq(col, val);
  if (error) console.error('sbDelete', table, error.message);
}

async function sbDeleteWhere(table, filters) {
  let q = sb.from(table).delete();
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  const { error } = await q;
  if (error) console.error('sbDeleteWhere', table, error.message);
}

/* ══════════════════════════════════════
   ACCOUNTS
══════════════════════════════════════ */
async function loadAccounts() {
  const rows = await sbSelect('accounts');
  return rows.map(rowToAccount);
}

async function saveAccounts(arr) {
  for (const a of arr) {
    await sbUpsert('accounts', accountToRow(a), 'email');
  }
}

function accountToRow(a) {
  return {
    email:         a.email,
    password_hash: a.password || a.password_hash || '',
    name:          a.name || '',
    initials:      a.initials || '',
    headline:      a.headline || '',
    location:      a.location || '',
    bio:           a.bio || '',
    subjects:      a.subjects || [],
    avatar_color:  a.avatarColor || a.avatar_color || '',
    schedule:      a.schedule || '',
    style:         a.style || '',
    is_creator:    a.isCreator || a.is_creator || false,
    creator_brand: a.creatorBrand || a.creator_brand || '',
  };
}

function rowToAccount(r) {
  return {
    email:       r.email,
    password:    r.password_hash,
    name:        r.name,
    initials:    r.initials || getInitialsFromName(r.name),
    headline:    r.headline,
    location:    r.location,
    bio:         r.bio,
    subjects:    r.subjects || [],
    avatarColor: r.avatar_color,
    schedule:    r.schedule,
    style:       r.style,
    isCreator:   r.is_creator,
    creatorBrand:r.creator_brand,
  };
}

function getInitialsFromName(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('');
}

async function findAccountByEmail(email) {
  if (!email) return null;
  const rows = await sbSelect('accounts', { email: email.toLowerCase() });
  return rows.length ? rowToAccount(rows[0]) : null;
}


/* ══════════════════════════════════════
   POSTS
══════════════════════════════════════ */
async function loadPosts() {
  const rows = await sbSelect('posts');
  return rows.map(rowToPost);
}

async function savePosts(arr) {
  // Batch upsert — single network call regardless of array size
  if (!arr || !arr.length) return;
  const rows = arr.map(postToRow);
  const { error } = await sb.from('posts').upsert(rows, { onConflict: 'id' });
  if (error) console.error('savePosts:', error.message);
}

async function savePost(p) {
  // Single-post save — used for likes, edits etc.
  await sbUpsert('posts', postToRow(p), 'id');
}

function postToRow(p) {
  // Normalise media: original posts used p.images, new ones use p.media
  const media = p.media || p.images || [];
  return {
    id:              p.id,
    author_email:    p.authorEmail,
    body:            p.body || '',
    subject:         p.subject || '',
    schedule:        p.schedule || '',
    location:        p.location || '',
    type:            p.type || 'general',
    post_type:       p.postType || null,
    linked_item_id:  p.linkedItemId || null,
    is_premium:      p.isPremium || false,
    tags:            p.tags || [],
    likes:           p.likes || [],
    media:           media,
    files:           p.files || [],
    access_list:     p.accessList || [],
    access_requests: p.accessRequests || [],
    created_at:      p.ts
                       ? new Date(p.ts).toISOString()
                       : p.timestamp
                         ? new Date(p.timestamp).toISOString()
                         : new Date().toISOString(),
  };
}

function rowToPost(r) {
  const media    = r.media || [];
  const rawTags  = r.tags || [];
  // Decode gatherBuddies from the sentinel tag (no extra DB column needed)
  const gatherBuddies = r.gather_buddies || rawTags.includes('__gather_buddies__');
  // Decode groupChatId from sentinel tag  e.g. '__gc_gc_1234567_abcd__'
  const gcTag      = rawTags.find(t => t.startsWith('__gc_') && t.endsWith('__'));
  const groupChatId = r.group_chat_id || (gcTag ? gcTag.slice(5, -2) : null);
  // Strip all sentinels from display tags
  const tags     = rawTags.filter(t => t !== '__gather_buddies__' && !(t.startsWith('__gc_') && t.endsWith('__')));
  return {
    id:             r.id,
    authorEmail:    r.author_email,
    body:           r.body,
    subject:        r.subject,
    schedule:       r.schedule,
    location:       r.location,
    type:           r.type,
    postType:       r.post_type || null,
    linkedItemId:   r.linked_item_id || null,
    isPremium:      r.is_premium,
    tags,
    likes:          r.likes || [],
    media:          media,
    images:         media,   // alias — buildPostHTML reads p.images
    files:          r.files || [],
    accessList:     r.access_list || [],
    accessRequests: r.access_requests || [],
    gatherBuddies,
    groupChatId,
    ts:             new Date(r.created_at).getTime(),
    timestamp:      new Date(r.created_at).getTime(), // alias for old code
  };
}


/* ══════════════════════════════════════
   COMMENTS
══════════════════════════════════════ */
async function loadComments() {
  const rows = await sbSelect('comments');
  // Return as object keyed by postId like the original
  const obj = {};
  for (const r of rows) {
    if (!obj[r.post_id]) obj[r.post_id] = [];
    obj[r.post_id].push({ id: r.id, userEmail: r.user_email, text: r.text, ts: new Date(r.created_at).getTime() });
  }
  return obj;
}

async function saveComments(obj) {
  // obj is { postId: [{id,userEmail,text,ts},...] }
  for (const [postId, comments] of Object.entries(obj)) {
    for (const c of comments) {
      await sbUpsert('comments', {
        id:         c.id,
        post_id:    postId,
        user_email: c.userEmail,
        text:       c.text,
        created_at: c.ts ? new Date(c.ts).toISOString() : new Date().toISOString(),
      }, 'id');
    }
  }
}

async function getCommentsForPost(postId) {
  const rows = await sbSelect('comments', { post_id: postId });
  return rows.map(r => ({ id: r.id, userEmail: r.user_email, text: r.text, ts: new Date(r.created_at).getTime() }));
}

async function addComment(postId, userEmail, text) {
  const comment = { id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), post_id: postId, user_email: userEmail, text };
  await sbUpsert('comments', comment, 'id');
  return comment;
}


/* ══════════════════════════════════════
   SAVED POSTS
══════════════════════════════════════ */
async function loadSaved() {
  if (!currentUser) return {};
  const rows = await sbSelect('saved_posts', { user_email: currentUser.email });
  const obj = {};
  for (const r of rows) obj[r.post_id] = true;
  return obj;
}

async function saveSaved(obj) {
  // obj is { postId: true }
  if (!currentUser) return;
  // Delete all saved for this user, re-insert
  await sbDeleteWhere('saved_posts', { user_email: currentUser.email });
  for (const postId of Object.keys(obj)) {
    if (obj[postId]) {
      await sbUpsert('saved_posts', { user_email: currentUser.email, post_id: postId }, 'user_email,post_id');
    }
  }
}

async function isPostSaved(postId) {
  if (!currentUser) return false;
  const rows = await sbSelect('saved_posts', { user_email: currentUser.email, post_id: postId });
  return rows.length > 0;
}

async function toggleSavePost(postId) {
  if (!currentUser) return;
  const saved = await isPostSaved(postId);
  if (saved) {
    await sbDeleteWhere('saved_posts', { user_email: currentUser.email, post_id: postId });
  } else {
    await sbUpsert('saved_posts', { user_email: currentUser.email, post_id: postId }, 'user_email,post_id');
  }
}

/* ══════════════════════════════════════
   JOIN REQUESTS
══════════════════════════════════════ */
async function loadJoinRequests() {
  if (!currentUser) return [];
  // Fix 5 — only fetch rows where current user is involved (requester OR host)
  const { data: asRequester } = await sb.from('join_requests')
    .select('*').eq('requester_email', currentUser.email);
  const { data: asHost } = await sb.from('join_requests')
    .select('*').eq('host_email', currentUser.email);
  const rows = [...(asRequester || []), ...(asHost || [])];
  // Deduplicate by id
  const seen = new Set();
  return rows
    .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .map(r => ({
      id:             r.id,
      postId:         r.post_id,
      requesterEmail: r.requester_email,
      hostEmail:      r.host_email,
      status:         r.status,
      ts:             new Date(r.created_at).getTime(),
    }));
}

async function saveJoinRequests(arr) {
  for (const jr of arr) {
    await sbUpsert('join_requests', {
      id:              jr.id,
      post_id:         jr.postId,
      requester_email: jr.requesterEmail,
      host_email:      jr.hostEmail,
      status:          jr.status,
    }, 'id');
  }
}

async function getMyJoinRequest(postId) {
  if (!currentUser) return null;
  const all = await loadJoinRequests();
  return all.find(r => r.postId === postId && r.requesterEmail === currentUser.email) || null;
}

async function getPendingJoinRequestsForHost() {
  if (!currentUser) return [];
  const all = await loadJoinRequests();
  return all.filter(r => r.hostEmail === currentUser.email && r.status === 'pending');
}

async function getPendingJoinRequestCount() {
  const reqs = await getPendingJoinRequestsForHost();
  return reqs.length;
}

/* ══════════════════════════════════════
   SESSIONS / ROOMS
══════════════════════════════════════ */
async function loadSessions() {
  const rows = await sbSelect('sessions');
  return rows.map(rowToSession);
}

async function saveSessions(arr) {
  for (const s of arr) await sbUpsert('sessions', sessionToRow(s), 'id');
}

function sessionToRow(s) {
  return {
    id:           s.id,
    post_id:      s.postId || null,
    host_email:   s.hostEmail,
    title:        s.title || s.name || '',
    subject:      s.subject || '',
    mode:         s.mode || 'video',
    participants: s.participants || [],
    room_notes:   s.roomNotes || [],
    room_chat:    s.roomChat || [],
    wb_access:    s.wbAccess || [],
    wb_data:      s.wbData   || null,
  };
}

function rowToSession(r) {
  return {
    id:           r.id,
    postId:       r.post_id,
    hostEmail:    r.host_email,
    title:        r.title,
    name:         r.title,
    subject:      r.subject || '',
    mode:         r.mode,
    participants: r.participants || [],
    roomNotes:    r.room_notes || [],
    roomChat:     r.room_chat || [],
    wbAccess:     r.wb_access  || [],
    wbData:       r.wb_data    || null,
    createdAt:    new Date(r.created_at).getTime(),
  };
}

async function getSessionByPost(postId) {
  const all = await loadSessions();
  return all.find(s => s.postId === postId) || null;
}

async function ensureSession(postId, hostEmail) {
  const existing = await getSessionByPost(postId);
  if (existing) return existing;
  const newSession = {
    id:           'room_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    postId, hostEmail, title: '', mode: 'video',
    participants: [hostEmail], roomNotes: [], roomChat: [],
  };
  await sbUpsert('sessions', sessionToRow(newSession), 'id');
  return newSession;
}

async function addParticipantToSession(postId, email) {
  const s = await getSessionByPost(postId);
  if (!s) return;
  if (!s.participants.includes(email)) {
    s.participants.push(email);
    await sbUpsert('sessions', sessionToRow(s), 'id');
  }
}

async function isSessionParticipant(postId, email) {
  const s = await getSessionByPost(postId);
  return s ? s.participants.includes(email) : false;
}

async function getParticipantCount(postId) {
  const s = await getSessionByPost(postId);
  return s ? s.participants.length : 0;
}

async function loadRooms() { return await loadSessions(); }
async function saveRooms(arr) { await saveSessions(arr); }


/* ══════════════════════════════════════
   MATCHES
══════════════════════════════════════ */
async function loadMatches() {
  if (!currentUser) return [];
  // Fix 5 — only fetch matches involving current user
  const { data: asSender }   = await sb.from('matches').select('*').eq('from_email', currentUser.email);
  const { data: asReceiver } = await sb.from('matches').select('*').eq('to_email',   currentUser.email);
  const rows = [...(asSender || []), ...(asReceiver || [])];
  const seen = new Set();
  return rows
    .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .map(r => ({
      id:     r.id,
      from:   r.from_email,
      to:     r.to_email,
      status: r.status,
      ts:     new Date(r.created_at).getTime(),
    }));
}

async function saveMatches(arr) {
  for (const m of arr) {
    await sbUpsert('matches', {
      id:         m.id,
      from_email: m.from,
      to_email:   m.to,
      status:     m.status,
    }, 'id');
  }
}

/* ══════════════════════════════════════
   MESSAGES
══════════════════════════════════════ */


/* ══════════════════════════════════════
   CREATOR APPS
══════════════════════════════════════ */
async function loadCreatorApps() {
  const rows = await sbSelect('creator_apps');
  return rows.map(r => ({
    email:        r.email,
    brand:        r.brand,
    bio:          r.bio,
    subject:      r.subject,
    contentTypes: r.content_types || [],
    price:        r.price,
    status:       r.status,
    appliedAt:    new Date(r.applied_at).getTime(),
    approvedAt:   r.approved_at ? new Date(r.approved_at).getTime() : null,
  }));
}

async function saveCreatorApps(arr) {
  for (const a of arr) {
    await sbUpsert('creator_apps', {
      email:         a.email,
      brand:         a.brand || '',
      bio:           a.bio || '',
      subject:       a.subject || '',
      content_types: a.contentTypes || [],
      price:         a.price || 0,
      status:        a.status || 'pending',
      approved_at:   a.approvedAt ? new Date(a.approvedAt).toISOString() : null,
    }, 'email');
  }
}

/* ══════════════════════════════════════
   PRODUCTS
══════════════════════════════════════ */
async function loadProducts() {
  const rows = await sbSelect('products');
  return rows.map(r => ({
    id:           r.id,
    creatorEmail: r.creator_email,
    title:        r.title,
    description:  r.description,
    type:         r.type,
    price:        r.price,
    subject:      r.subject,
    content:      r.content,
    purchases:    r.purchases || [],
    createdAt:    new Date(r.created_at).getTime(),
    updatedAt:    new Date(r.updated_at).getTime(),
  }));
}

async function saveProducts(arr) {
  for (const p of arr) {
    await sbUpsert('products', {
      id:            p.id,
      creator_email: p.creatorEmail,
      title:         p.title || '',
      description:   p.description || '',
      type:          p.type || 'notes',
      price:         p.price || 0,
      subject:       p.subject || '',
      content:       p.content || '',
      purchases:     p.purchases || [],
      updated_at:    new Date().toISOString(),
    }, 'id');
  }
}

/* ══════════════════════════════════════
   SUBSCRIPTION TIERS
══════════════════════════════════════ */
async function loadSubscriptionTiers() {
  const rows = await sbSelect('subscription_tiers');
  return rows.map(r => ({
    id:           r.id,
    creatorEmail: r.creator_email,
    name:         r.name,
    description:  r.description,
    price:        r.price,
    createdAt:    new Date(r.created_at).getTime(),
  }));
}

async function saveSubscriptionTiers(arr) {
  for (const t of arr) {
    await sbUpsert('subscription_tiers', {
      id:            t.id,
      creator_email: t.creatorEmail,
      name:          t.name || '',
      description:   t.description || '',
      price:         t.price || 0,
    }, 'id');
  }
}

/* ══════════════════════════════════════
   USER SUBSCRIPTIONS
══════════════════════════════════════ */
async function loadUserSubs() {
  const rows = await sbSelect('user_subscriptions');
  return rows.map(r => ({
    id:           r.id,
    userEmail:    r.user_email,
    creatorEmail: r.creator_email,
    tierId:       r.tier_id,
    price:        r.price,
    since:        new Date(r.since).getTime(),
  }));
}

async function saveUserSubs(arr) {
  for (const s of arr) {
    await sbUpsert('user_subscriptions', {
      id:            s.id,
      user_email:    s.userEmail,
      creator_email: s.creatorEmail,
      tier_id:       s.tierId || null,
      price:         s.price || 0,
      since:         s.since ? new Date(s.since).toISOString() : new Date().toISOString(),
    }, 'id');
  }
}

/* ══════════════════════════════════════
   QUIZZES
══════════════════════════════════════ */
async function loadQuizzes() {
  const rows = await sbSelect('quizzes');
  return rows.map(r => ({
    id:           r.id,
    creatorEmail: r.creator_email,
    title:        r.title,
    subject:      r.subject,
    access:       r.access,
    questions:    r.questions || [],
    attempts:     r.attempts || 0,
    createdAt:    new Date(r.created_at).getTime(),
    updatedAt:    new Date(r.updated_at).getTime(),
  }));
}

async function saveQuizzes(arr) {
  for (const q of arr) {
    await sbUpsert('quizzes', {
      id:            q.id,
      creator_email: q.creatorEmail,
      title:         q.title || '',
      subject:       q.subject || '',
      access:        q.access || 'free',
      questions:     q.questions || [],
      attempts:      q.attempts || 0,
      updated_at:    new Date().toISOString(),
    }, 'id');
  }
}

/* ══════════════════════════════════════
   LEGACY localStorage stubs
   (kept for backward compat — do nothing)
══════════════════════════════════════ */


/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
let currentUser      = null;
let nightMode        = false;
let aboutOpen        = false;
let activeAppSection = 'feed';
let activeMatchTab   = 'received';
let searchHighlight  = -1;

/* ══════════════════════════════════════
   PUBLIC PAGE NAVIGATION
══════════════════════════════════════ */
const PUBLIC_PAGES = ['home','signin','register','p4'];

function navigate(target) {
  PUBLIC_PAGES.forEach(p => {
    const el = document.getElementById('page-' + p);
    if (el) el.classList.toggle('active', p === target);
  });
  const app = document.getElementById('page-app');
  if (app) app.classList.remove('active');
  closeAboutPanel();
  window.scrollTo(0, 0);
}

async function logoClick() {
  if (currentUser) { appNav('feed'); } else { navigate('home'); }
}

/* ══════════════════════════════════════
   APP SECTION NAVIGATION
══════════════════════════════════════ */
const APP_SECTIONS = ['feed','findbuddies','mymatches','messages','notepad','sessions','creator','profile','viewprofile'];

async function appNav(target) {
  APP_SECTIONS.forEach(s => {
    const el  = document.getElementById('app-'  + s);
    const nav = document.getElementById('snav-' + s);
    if (el)  el.classList.toggle('active',  s === target);
    if (nav) nav.classList.toggle('active', s === target);
  });
  activeAppSection = target;
  closeSearch();
  window.scrollTo(0, 0);

  if (target === 'findbuddies') { await cacheCreators(); await renderBuddies(); }
  if (target === 'mymatches')   await renderMatches();
  if (target === 'feed')        { invalidateFeedCache(); await cacheCreators(); await renderFeed(); }
  if (target === 'messages')    await initMessagesPage();
  if (target === 'notepad')     await initNotepadPage();
  if (target === 'sessions')    await initSessionsPage();
  if (target === 'creator')     await initCreatorPage();
  if (target === 'profile')     { if (typeof renderMyProfile === 'function') renderMyProfile(currentUser); }
  if (target === 'viewprofile') { /* rendered by renderViewProfile() call */ }
}

/* ══════════════════════════════════════
   REGISTRATION  (email-override fix)
══════════════════════════════════════ */
async function handleRegister() {
  const nameEl  = document.getElementById('reg-name');
  const emailEl = document.getElementById('reg-email');
  const passEl  = document.getElementById('reg-password');
  const confEl  = document.getElementById('reg-confirm');
  const errEl   = document.getElementById('register-error');
  const okEl    = document.getElementById('register-success');

  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (okEl)  { okEl.style.display  = 'none'; okEl.textContent  = ''; }

  const name     = (nameEl  ? nameEl.value  : '').trim();
  const email    = (emailEl ? emailEl.value : '').trim().toLowerCase();
  const password =  passEl  ? passEl.value  : '';
  const confirm  =  confEl  ? confEl.value  : '';

  const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };

  if (!name)                                            { showErr('Please enter your full name.');                              return; }
  if (!email)                                           { showErr('Please enter your email address.');                         return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))      { showErr('Please enter a valid email address.');                      return; }
  if (password.length < 6)                              { showErr('Password must be at least 6 characters.');                 return; }
  if (password !== confirm)                             { showErr('Passwords do not match. Please check and try again.');     return; }

  // Strict uniqueness — email is NEVER reused or borrowed
  if (await findAccountByEmail(email)) {
    showErr('An account with this email already exists. Try signing in.');
    return;
  }

  const all        = await loadAccounts();
  const colorIndex = all.length % AVATAR_COLORS.length;
  const words      = name.split(/\s+/).filter(Boolean);
  const initials   = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();

  // Completely new object — no shared reference to any existing account
  const newAccount = {
    email,      // the registrant's own unique email
    password,
    name,
    initials,
    headline: 'Student · Study Buddy',
    location: '📍 Philippines',
    bio: `Hi, I'm ${words[0]}! I just joined Study Buddy and I'm excited to find great study partners.`,
    subjects: [],
    avatarColor: AVATAR_COLORS[colorIndex],
    schedule: '',
    style: '',
  };

  // Push a deep clone to prevent any mutation leak
  all.push(JSON.parse(JSON.stringify(newAccount)));
  await saveAccounts(all);

  [nameEl, emailEl, passEl, confEl].forEach(el => { if (el) el.value = ''; });
  hidePwStrength();

  if (okEl) { okEl.innerHTML = '✓ Account created! Taking you to your feed…'; okEl.style.display = 'block'; }
  setTimeout(async () => { await loginWith(newAccount); }, 1200);
}

function updatePasswordStrength(value) {
  const wrap  = document.getElementById('pw-strength-wrap');
  const fill  = document.getElementById('pw-strength-fill');
  const label = document.getElementById('pw-strength-label');
  if (!wrap || !fill || !label) return;
  if (!value) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  let score = 0;
  if (value.length >= 6)          score++;
  if (value.length >= 10)         score++;
  if (/[A-Z]/.test(value))        score++;
  if (/[0-9]/.test(value))        score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  const levels = [
    {pct:'20%', color:'#ef4444', text:'Weak'},
    {pct:'40%', color:'#f97316', text:'Fair'},
    {pct:'60%', color:'#eab308', text:'Good'},
    {pct:'80%', color:'#22c55e', text:'Strong'},
    {pct:'100%',color:'#16a34a', text:'Very Strong'},
  ];
  const lvl = levels[Math.min(Math.max(score - 1, 0), levels.length - 1)];
  fill.style.width      = lvl.pct;
  fill.style.background = lvl.color;
  label.textContent     = lvl.text;
  label.style.color     = lvl.color;
}
function hidePwStrength() {
  const w = document.getElementById('pw-strength-wrap');
  if (w) w.style.display = 'none';
}

/* ══════════════════════════════════════
   LOGIN / LOGOUT
══════════════════════════════════════ */
async function handleLogin() {
  const emailInput = document.getElementById('login-email');
  const passInput  = document.getElementById('login-password');
  const errEl      = document.getElementById('login-error');

  const email    = ((emailInput ? emailInput.value : '') || '').trim().toLowerCase();
  const password =  (passInput  ? passInput.value  : '') || '';
  if (!errEl) return;

  const account = await findAccountByEmail(email);
  if (!account || account.password !== password) {
    errEl.textContent   = 'Invalid email or password. Please try again.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  if (emailInput) emailInput.value = '';
  if (passInput)  passInput.value  = '';
  await loginWith(account);
}

async function loginWith(account) {
  // Always load a fresh copy from the DB to ensure integrity
  const fresh = await findAccountByEmail(account.email) || account;
  currentUser      = JSON.parse(JSON.stringify(fresh));

  PUBLIC_PAGES.forEach(p => {
    const el = document.getElementById('page-' + p);
    if (el) el.classList.remove('active');
  });

  const appEl = document.getElementById('page-app');
  if (!appEl) { console.error('page-app not found'); return; }
  appEl.classList.add('active');

  await applyCurrentUserToChrome();
  await cacheCreators();
  await appNav('feed');
}

function handleLogout() {
  currentUser     = null;

  ['login-email','login-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const appEl = document.getElementById('page-app');
  if (appEl) appEl.classList.remove('active');
  navigate('home');
}

/* ══════════════════════════════════════
   LOGOUT MODAL
══════════════════════════════════════ */
function openLogoutModal() {
  const m = document.getElementById('logout-modal');
  if (m) m.classList.add('open');
}
function closeLogoutModal(e) {
  if (e && e.target !== document.getElementById('logout-modal')) return;
  const m = document.getElementById('logout-modal');
  if (m) m.classList.remove('open');
}
function confirmLogout() {
  const m = document.getElementById('logout-modal');
  if (m) m.classList.remove('open');
  handleLogout();
}

/* ══════════════════════════════════════
   APPLY CURRENT USER TO NAV CHROME
══════════════════════════════════════ */
async function applyCurrentUserToChrome() {
  const u = currentUser;
  if (!u) return;
  const init = getInitials(u);

  setText('app-username-chip', u.name ? u.name.split(' ')[0] : '');
  setText('app-avatar-chip',   init);
  setText('sidebar-avatar',    init);
  setText('sidebar-name',      u.name || '');
  setText('composer-avatar',   init);

  // Update sidebar handle with dynamic username
  const handleEl = document.getElementById('sidebar-handle');
  if (handleEl) {
    const handle = u.name ? '@' + u.name.toLowerCase().replace(/\s+/g,'') : '@user';
    handleEl.textContent = handle + ' · Student';
  }

  applyAvatarColor(u.avatarColor, [
    document.getElementById('app-avatar-chip'),
    document.getElementById('sidebar-avatar'),
    document.getElementById('composer-avatar'),
  ]);

  await updateSidebarBadges();
}

async function updateSidebarBadges() {
  if (!currentUser) return;

  // Buddy match pending badge
  const pendingCount = (await loadMatches()).filter(m =>
    m.to === currentUser.email && m.status === 'pending'
  ).length;
  const matchBadge = document.querySelector('#snav-mymatches .sidebar-badge');
  if (matchBadge) matchBadge.textContent = pendingCount || '';

  // Messages badge = conversation count
  const convCount = await getUnreadCount();
  const msgBadge  = document.querySelector('#snav-messages .sidebar-badge');
  if (msgBadge) msgBadge.textContent = convCount || '';

  // Feed badge = pending join requests (shown on feed nav item)
  const joinCount = await getPendingJoinRequestCount();
  const feedBadge = document.getElementById('feed-jr-badge');
  if (feedBadge) {
    feedBadge.textContent = joinCount || '';
    feedBadge.style.display = joinCount ? '' : 'none';
  }
}

/* ══════════════════════════════════════
   MY PROFILE
══════════════════════════════════════ */
/* ══════════════════════════════════════
   VIEW ANOTHER USER'S PROFILE
══════════════════════════════════════ */

/* ══════════════════════════════════════
   ABOUT PANEL
══════════════════════════════════════ */
function toggleAboutPanel() {
  const panel = document.getElementById('about-panel');
  const btn   = document.getElementById('learn-more-btn');
  if (!panel || !btn) return;
  aboutOpen = !aboutOpen;
  panel.classList.toggle('open', aboutOpen);
  btn.textContent = aboutOpen ? 'Hide Info ▲' : 'Learn More';
  if (aboutOpen) setTimeout(() => panel.scrollIntoView({ behavior:'smooth', block:'nearest' }), 80);
}
function closeAboutPanel() {
  const panel = document.getElementById('about-panel');
  const btn   = document.getElementById('learn-more-btn');
  if (!panel || !btn) return;
  aboutOpen = false;
  panel.classList.remove('open');
  btn.textContent = 'Learn More';
}

/* ══════════════════════════════════════
   NIGHT MODE
══════════════════════════════════════ */
function toggleNightMode() {
  nightMode = !nightMode;
  document.body.classList.toggle('night', nightMode);
  const moon = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  const sun  = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  document.querySelectorAll('.night-icon-svg').forEach(svg => { svg.innerHTML = nightMode ? sun : moon; });
  try { localStorage.setItem(STORAGE_NIGHT, nightMode ? '1' : '0'); } catch (_) {}
}

/* ══════════════════════════════════════
   LIVE SEARCH
══════════════════════════════════════ */
async function handleSearchInput(query) {
  const dropdown = document.getElementById('search-dropdown');
  if (!dropdown) return;

  const q = (query || '').trim().toLowerCase();
  if (!q) { closeSearch(); return; }

  const accounts = await loadAccounts();
  const results  = accounts.filter(a => {
    if (!currentUser) return false;
    if (a.email.toLowerCase() === currentUser.email.toLowerCase()) return false;
    return a.name.toLowerCase().includes(q);
  });

  searchHighlight = -1;

  if (!results.length) {
    dropdown.innerHTML = `<div class="search-no-results">No students found for "<strong>${escHtml(query)}</strong>"</div>`;
    dropdown.classList.add('open');
    return;
  }

  dropdown.innerHTML = results.slice(0, 8).map((a, i) => {
    const init = getInitials(a);
    return `
    <div class="search-result-item" data-email="${escHtml(a.email)}" data-index="${i}"
      onclick="selectSearchResult('${escHtml(a.email)}')"
      onmouseenter="highlightSearchItem(${i})">
      <div class="sr-avatar" style="background:${a.avatarColor || AVATAR_COLORS[0]}">${escHtml(init)}</div>
      <div class="sr-info">
        <div class="sr-name">${escHtml(a.name)}</div>
        <div class="sr-headline">${escHtml(a.headline || 'Student · Study Buddy')}</div>
      </div>
    </div>`;
  }).join('');

  dropdown.classList.add('open');
}

function handleSearchKeydown(e) {
  const dropdown = document.getElementById('search-dropdown');
  if (!dropdown || !dropdown.classList.contains('open')) return;
  const items = dropdown.querySelectorAll('.search-result-item');
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    searchHighlight = Math.min(searchHighlight + 1, items.length - 1);
    highlightSearchItem(searchHighlight);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    searchHighlight = Math.max(searchHighlight - 1, 0);
    highlightSearchItem(searchHighlight);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const active = dropdown.querySelector('.search-result-item.highlighted');
    if (active) selectSearchResult(active.dataset.email);
  } else if (e.key === 'Escape') {
    closeSearch();
  }
}

function highlightSearchItem(index) {
  const dropdown = document.getElementById('search-dropdown');
  if (!dropdown) return;
  dropdown.querySelectorAll('.search-result-item').forEach((el, i) => {
    el.classList.toggle('highlighted', i === index);
    el.style.background = i === index ? 'var(--accent)' : '';
  });
  searchHighlight = index;
}

function selectSearchResult(email) {
  const input = document.getElementById('app-search-input');
  if (input) input.value = '';
  closeSearch();
  appNav('feed');
}

function closeSearch() {
  const dropdown = document.getElementById('search-dropdown');
  if (dropdown) { dropdown.classList.remove('open'); dropdown.innerHTML = ''; }
  searchHighlight = -1;
}

document.addEventListener('click', e => {
  const wrap = document.getElementById('app-search-wrap');
  if (wrap && !wrap.contains(e.target)) closeSearch();
});

/* ══════════════════════════════════════
   FEED — FULLY UPGRADED
══════════════════════════════════════ */

// ── Composer state ────────────────────────────────
let composerImages = [];   // [{ dataUrl, name, type }]
let composerGatherBuddies = false;  // Gather Buddies toggle state
let composerVideos = [];   // [{ dataUrl, name, type }]
let composerFiles  = [];   // [{ name, size, dataUrl, type }]
let composerExpanded = false;

function expandComposer() {
  composerExpanded = true;
  const expanded = document.getElementById('composer-expanded');
  const simple   = document.getElementById('composer-actions-simple');
  if (expanded) expanded.style.display = 'flex';
  if (simple)   simple.style.display   = 'none';
  const ta = document.getElementById('post-input');
  if (ta) ta.focus();
}

// Auto-expand when typing
document.addEventListener('DOMContentLoaded', () => {
  const ta = document.getElementById('post-input');
  if (ta) {
    ta.addEventListener('focus', expandComposer);
  }
});

function composerAutoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  if (!composerExpanded) expandComposer();
}

function toggleEmojiPicker() {
  const ep = document.getElementById('emoji-picker');
  if (ep) ep.style.display = ep.style.display === 'none' ? 'flex' : 'none';
}

function insertEmoji(emoji) {
  const ta  = document.getElementById('post-input');
  if (!ta) return;
  const s   = ta.selectionStart;
  const e   = ta.selectionEnd;
  ta.value  = ta.value.slice(0, s) + emoji + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + emoji.length;
  ta.focus();
  const ep = document.getElementById('emoji-picker');
  if (ep) ep.style.display = 'none';
}

function handleImageAttach(input) {
  const files = Array.from(input.files || []);
  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    if (composerImages.length >= 10) { alert('Max 10 images per post.'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      composerImages.push({ dataUrl: e.target.result, name: file.name, type: file.type });
      renderComposerPreviews();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function handleVideoAttach(input) {
  const files = Array.from(input.files || []);
  files.forEach(file => {
    if (!file.type.startsWith('video/')) return;
    if (composerVideos.length >= 3) { alert('Max 3 videos per post.'); return; }
    if (file.size > 50 * 1024 * 1024) { alert(`"${file.name}" exceeds 50 MB limit.`); return; }
    const reader = new FileReader();
    reader.onload = e => {
      composerVideos.push({ dataUrl: e.target.result, name: file.name, type: file.type });
      renderComposerPreviews();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function handleFileAttach(input) {
  const files = Array.from(input.files || []);
  files.forEach(file => {
    if (composerFiles.length >= 5) { alert('Max 5 file attachments per post.'); return; }
    if (file.size > 20 * 1024 * 1024) { alert(`"${file.name}" exceeds 20 MB limit.`); return; }
    const reader = new FileReader();
    reader.onload = e => {
      composerFiles.push({ name: file.name, size: file.size, dataUrl: e.target.result, type: file.type });
      renderComposerPreviews();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderComposerPreviews() {
  const wrap = document.getElementById('composer-img-preview');
  if (!wrap) return;
  const total = composerImages.length + composerVideos.length;
  const gridCls = total === 1 ? 'one' : total === 2 ? 'two' : 'multi';

  const imgHTML = composerImages.map((img, i) => `
    <div class="composer-media-item">
      <img src="${img.dataUrl}" alt="${escHtml(img.name)}" onclick="openLightbox('${img.dataUrl}')">
      <button class="composer-media-remove" onclick="removeComposerImage(${i})">✕</button>
    </div>`).join('');

  const vidHTML = composerVideos.map((v, i) => `
    <div class="composer-media-item composer-media-video">
      <video src="${v.dataUrl}" controls preload="metadata"></video>
      <button class="composer-media-remove" onclick="removeComposerVideo(${i})">✕</button>
    </div>`).join('');

  const mediaGrid = (imgHTML || vidHTML)
    ? `<div class="composer-media-grid ${gridCls}">${imgHTML}${vidHTML}</div>` : '';

  const fileHTML = composerFiles.map((f, i) => `
    <div class="composer-file-chip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span title="${escHtml(f.name)}">${escHtml(f.name)}</span>
      <span style="opacity:.6;font-size:.7rem">${formatFileSize(f.size)}</span>
      <button onclick="removeComposerFile(${i})">✕</button>
    </div>`).join('');

  wrap.innerHTML = mediaGrid + (fileHTML ? `<div class="composer-files-row">${fileHTML}</div>` : '');
}

function removeComposerImage(i) { composerImages.splice(i, 1); renderComposerPreviews(); }
function removeComposerVideo(i) { composerVideos.splice(i, 1); renderComposerPreviews(); }
function removeComposerFile(i)  { composerFiles.splice(i, 1);  renderComposerPreviews(); }

// ── Feed filter state ──────────────────────────────
let feedFiltersActive = false;

// Fix 3 — debounce: filter input waits 300 ms before re-rendering
let _feedFilterTimer = null;
function applyFeedFilters() {
  clearTimeout(_feedFilterTimer);
  _feedFilterTimer = setTimeout(_doApplyFeedFilters, 300);
}

async function _doApplyFeedFilters() {
  const q        = (document.getElementById('feed-search-input')?.value    || '').toLowerCase().trim();
  const subject  =  document.getElementById('feed-filter-subject')?.value  || '';
  const schedule =  document.getElementById('feed-filter-schedule')?.value || '';
  const location =  document.getElementById('feed-filter-location')?.value || '';

  feedFiltersActive = !!(q || subject || schedule || location);
  const clearBtn = document.getElementById('feed-filter-clear');
  if (clearBtn) clearBtn.style.display = feedFiltersActive ? '' : 'none';

  // Filters are pure JS over cached data — no DB call needed
  await renderFeed();
}

async function clearFeedFilters() {
  const ids = ['feed-search-input','feed-filter-subject','feed-filter-schedule','feed-filter-location'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  feedFiltersActive = false;
  const clearBtn = document.getElementById('feed-filter-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  await renderFeed();
}

// ── Feed cache ────────────────────────────────────
const _feedCache = {
  posts:       null,
  accounts:    null,
  saved:       null,
  comments:    null,
  joinReqs:    null,
  sessions:    null,
  matches:     null,
  ts:          0,
  TTL:         30_000,   // 30 s — re-fetch from DB at most every 30 s
};

function invalidateFeedCache(keys = null) {
  if (!keys) {
    // Full invalidation
    Object.keys(_feedCache).forEach(k => {
      if (k !== 'TTL') _feedCache[k] = null;
    });
    _feedCache.ts = 0;
  } else {
    keys.forEach(k => { _feedCache[k] = null; });
    _feedCache.ts = 0;
  }
}

async function _loadFeedData() {
  const now = Date.now();
  if (_feedCache.posts && (now - _feedCache.ts) < _feedCache.TTL) return; // still fresh

  // Fix 4 — all 7 loads in one parallel Promise.all (was sequential)
  const [posts, accounts, saved, comments, joinReqs, sessions, matches] = await Promise.all([
    loadPosts(),
    loadAccounts(),
    loadSaved(),
    loadComments(),
    loadJoinRequests(),
    loadRooms(),
    currentUser ? loadMatches() : Promise.resolve([]),
  ]);

  _feedCache.posts    = posts;
  _feedCache.accounts = accounts;
  _feedCache.saved    = saved;
  _feedCache.comments = comments;
  _feedCache.joinReqs = joinReqs;
  _feedCache.sessions = sessions;
  _feedCache.matches  = matches;
  _feedCache.ts       = Date.now();
}

// ── Render feed ────────────────────────────────────
async function renderFeed() {
  const list = document.getElementById('feed-list');
  if (!list) return;

  // Load all feed data in parallel (cached — no extra DB calls if fresh)
  await _loadFeedData();
  const allPosts = _feedCache.posts    || [];
  const accounts = _feedCache.accounts || [];

  // Apply filters (pure JS — no DB calls)
  const q        = (document.getElementById('feed-search-input')?.value    || '').toLowerCase().trim();
  const subject  =  document.getElementById('feed-filter-subject')?.value  || '';
  const schedule =  document.getElementById('feed-filter-schedule')?.value || '';
  const location =  document.getElementById('feed-filter-location')?.value || '';

  const filtered = [...allPosts]
    .sort((a, b) => (b.ts || b.timestamp || 0) - (a.ts || a.timestamp || 0))
    .filter(p => {
      const author = accounts.find(a => a.email.toLowerCase() === (p.authorEmail||'').toLowerCase());
      const body   = (p.body || '').toLowerCase();
      const title  = (p.title || '').toLowerCase();
      const tags   = (p.tags || []).join(' ').toLowerCase();
      const matchQ = !q || body.includes(q) || title.includes(q) || tags.includes(q) ||
                     (author && author.name.toLowerCase().includes(q));
      const matchSubject  = !subject  || p.subject  === subject;
      const matchSchedule = !schedule || p.schedule === schedule;
      const matchLocation = !location || p.location === location;
      return matchQ && matchSubject && matchSchedule && matchLocation;
    });

  if (!filtered.length) {
    const msg = feedFiltersActive
      ? 'No posts match your filters. <button onclick="clearFeedFilters()" style="background:none;border:none;color:var(--purple-bright);cursor:pointer;font-weight:700;text-decoration:underline">Clear filters</button>'
      : 'No posts yet — be the first to share something! 🎓';
    list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-light)">${msg}</div>`;
    return;
  }

  // Read from cache — already loaded above in _loadFeedData()
  const savedArr   = _feedCache.saved    || [];
  const allComments = _feedCache.comments || {};
  const allJoinReqs = _feedCache.joinReqs || [];
  const allSessions = _feedCache.sessions || [];

  const savedSet      = new Set(Object.keys(savedArr).length
    ? Object.keys(savedArr)  // {postId:true} format
    : []);
  // Handle both {postId:true} and flat array formats
  const savedSetFinal = savedArr && typeof savedArr === 'object' && !Array.isArray(savedArr)
    ? new Set(Object.keys(savedArr).filter(k => savedArr[k]))
    : new Set(Array.isArray(savedArr) ? savedArr : []);

  const commentMap    = {};
  if (Array.isArray(allComments)) {
    allComments.forEach(c => { if (!commentMap[c.postId]) commentMap[c.postId] = []; commentMap[c.postId].push(c); });
  } else if (typeof allComments === 'object') {
    Object.assign(commentMap, allComments);
  }

  const joinReqMap    = {};
  if (currentUser) {
    allJoinReqs.filter(r => r.requesterEmail === currentUser.email)
               .forEach(r => { joinReqMap[r.postId] = r; });
  }

  const sessionMap    = {};
  allSessions.forEach(s => { if (s.postId) sessionMap[s.postId] = s; });

  const participantSet = new Set();
  if (currentUser) {
    allSessions.forEach(s => {
      if (s.postId && (s.participants || []).includes(currentUser.email)) {
        participantSet.add(s.postId);
      }
    });
  }

  // Build matchMap from cache
  const matchMap = {};
  if (currentUser) {
    (_feedCache.matches || []).forEach(m => {
      if (m.from === currentUser.email) matchMap[m.to]   = m;
      if (m.to   === currentUser.email) matchMap[m.from] = m;
    });
  }

  // Build accountsMap for fast lookup in comment rendering
  const accountsMap = {};
  accounts.forEach(a => { accountsMap[a.email] = a; accountsMap[a.email.toLowerCase()] = a; });

  // Pre-build creator post cards (async, done once before .map)
  const creatorCardMap = {};
  const creatorPosts = filtered.filter(p => p.postType && p.linkedItemId);
  if (creatorPosts.length) {
    await Promise.all(creatorPosts.map(async p => {
      try { creatorCardMap[p.id] = await buildCreatorPostCardHTML(p); } catch(_) {}
    }));
  }

  const ctx = { savedSet: savedSetFinal, commentMap, joinReqMap, sessionMap, participantSet, joinReqs: allJoinReqs, matchMap, creatorCardMap, accountsMap };

  list.innerHTML = filtered.map(p => buildPostHTML(p, accounts, ctx)).join('');

  if (currentUser) {
    const ca = document.getElementById('composer-avatar');
    if (ca) {
      setText('composer-avatar', getInitials(currentUser));
      ca.style.background = currentUser.avatarColor || AVATAR_COLORS[0];
    }
  }

  // Check URL hash for shared post
  const hash = window.location.hash;
  if (hash && hash.startsWith('#post_')) {
    const target = document.getElementById('post-' + hash.slice(1));
    if (target) {
      setTimeout(() => target.scrollIntoView({ behavior:'smooth', block:'center' }), 200);
      target.style.boxShadow = '0 0 0 3px var(--purple-bright)';
      setTimeout(() => { target.style.boxShadow = ''; }, 2500);
    }
  }
}

// Sync helper — builds comment HTML from pre-fetched ctx (no DB calls)
function buildCommentsHTMLSync(postId, ctx) {
  const coms = (ctx.commentMap || {})[postId] || [];
  if (!coms.length) return '<div class="comments-empty">No comments yet. Be the first! \U0001F4AC</div>';
  const accs = ctx.accountsMap || {};
  return '<div class="comments-list">' + coms.map(function(c) {
    var u     = accs[c.userEmail] || accs[(c.userEmail || '').toLowerCase()];
    var name  = u ? u.name : 'Unknown';
    var init  = u ? getInitials(u) : '?';
    var color = u ? (u.avatarColor || AVATAR_COLORS[0]) : AVATAR_COLORS[0];
    var email = escHtml(c.userEmail || '');
    return '<div class="comment-item">' +
      '<div class="comment-avatar" style="background:' + color + '">' + escHtml(init) + '</div>' +
      '<div class="comment-bubble">' +
        '<div class="comment-author" >' + escHtml(name) + '</div>' +
        '<div class="comment-text">' + escHtml(c.text || '') + '</div>' +
        '<div class="comment-time">' + formatTimeAgo(c.ts) + '</div>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function buildPostHTML(p, accounts, ctx = {}) {
  if (!p || !p.authorEmail) return '';
  const author = accounts.find(a => a.email.toLowerCase() === p.authorEmail.toLowerCase());
  if (!author) return '';

  const name      = author.name        || 'Unknown User';
  const initials  = getInitials(author);
  const color     = author.avatarColor || AVATAR_COLORS[0];
  const headline  = author.headline    || 'Student';
  const timeStr   = formatTimeAgo(p.ts || p.timestamp);
  const tags      = Array.isArray(p.tags) ? p.tags : [];
  const likes     = Array.isArray(p.likes) ? p.likes : [];
  const liked     = currentUser && likes.includes(currentUser.email);
  const likeCount = likes.length;
  const saved     = ctx.savedSet ? ctx.savedSet.has(p.id) : false;
  const comments  = ctx.commentMap ? (ctx.commentMap[p.id] || []) : [];
  const isOwnPost = currentUser && p.authorEmail === currentUser.email;

  // ── Join request state ───────────────────────────────────────────
  const myRequest   = !isOwnPost && currentUser && ctx.joinReqMap ? (ctx.joinReqMap[p.id] || null) : null;
  const reqStatus   = myRequest ? myRequest.status : 'none';
  const session     = ctx.sessionMap ? (ctx.sessionMap[p.id] || null) : null;
  const partCount   = session ? session.participants.length : 1;
  const amParticipant = !!(currentUser && ctx.participantSet && ctx.participantSet.has(p.id));

  let joinBtnHTML = '';
  if (!isOwnPost && currentUser && p.gatherBuddies) {
    // Only show Request to Join when the post has Gather Buddies enabled
    const joinBtnLabel  = reqStatus === 'pending'  ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Pending…`
                        : reqStatus === 'accepted' ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg> ✓ Joined`
                        : reqStatus === 'declined' ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Request Again`
                        :                            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Request to Join`;
    const joinBtnClass  = reqStatus === 'pending'  ? 'post-action-btn pending-join'
                        : reqStatus === 'accepted' ? 'post-action-btn joined'
                        : 'post-action-btn';
    const joinDisabled  = (reqStatus === 'pending' || reqStatus === 'accepted') ? 'disabled' : '';
    const joinOnclick   = reqStatus === 'none' || reqStatus === 'declined'
                        ? `sendJoinRequest('${escHtml(p.id)}', this)`
                        : reqStatus === 'pending' ? `cancelJoinRequest('${escHtml(p.id)}', this)` : '';

    joinBtnHTML = `<button class="${joinBtnClass}" onclick="${joinOnclick}" ${joinDisabled}>
      ${joinBtnLabel}
    </button>`;
  } else if (isOwnPost && p.gatherBuddies) {
    // Own post with Gather Buddies — show manage requests button
    const pending = ctx.joinReqs ? ctx.joinReqs.filter(r => r.postId === p.id && r.status === 'pending').length : 0;
    joinBtnHTML = `<button class="post-action-btn ${pending ? 'host-requests' : ''}" onclick="openJoinRequestsPanel('${escHtml(p.id)}')" title="Manage join requests">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      ${pending ? `${pending} Request${pending !== 1 ? 's' : ''}` : `${partCount} Joined`}
    </button>`;
  }

  // Meta chips (subject, schedule, location)
  const metaChips = [
    p.subject  ? `<span class="post-meta-chip">📚 ${escHtml(p.subject)}</span>`  : '',
    p.schedule ? `<span class="post-meta-chip">🕐 ${escHtml(p.schedule)}</span>` : '',
    p.location ? `<span class="post-meta-chip">📍 ${escHtml(p.location)}</span>` : '',
  ].filter(Boolean).join('');

  // Images — Facebook-style responsive grid
  const images   = Array.isArray(p.images) ? p.images : [];
  const imgCount = images.length;
  let imagesHTML = '';
  if (imgCount > 0) {
    const cls = imgCount === 1 ? 'one' : imgCount === 2 ? 'two' : imgCount === 3 ? 'three' : imgCount === 4 ? 'four' : 'many';
    const shown = imgCount > 5 ? images.slice(0, 5) : images;
    const extra = imgCount > 5 ? imgCount - 5 : 0;
    imagesHTML = `<div class="post-images ${cls}">
      ${shown.map((img, idx) => {
        const isLast = extra > 0 && idx === shown.length - 1;
        return `<div class="post-img-wrap" onclick="openLightbox('${img}')">
          <img class="post-img" src="${img}" alt="Post image" loading="lazy">
          ${isLast ? `<div class="post-img-more">+${extra}</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  // Videos — native player
  const videos   = Array.isArray(p.videos) ? p.videos : [];
  let videosHTML = '';
  if (videos.length) {
    videosHTML = `<div class="post-videos">${videos.map(v =>
      `<div class="post-video-wrap"><video class="post-video" src="${v.dataUrl}" controls preload="metadata" playsinline></video></div>`
    ).join('')}</div>`;
  }

  // Files — downloadable
  const files    = Array.isArray(p.files) ? p.files : [];
  let filesHTML  = '';
  if (files.length) {
    filesHTML = `<div class="post-file-attachments">
      ${files.map(f => {
        const icon = _getFileIcon(f.name);
        const dl = f.dataUrl ? `href="${f.dataUrl}" download="${escHtml(f.name)}"` : 'href="#"';
        return `<a class="post-file-item" ${dl} target="_blank">
          <span class="post-file-icon">${icon}</span>
          <div class="post-file-meta">
            <span class="post-file-name">${escHtml(f.name)}</span>
            ${f.size ? `<span class="post-file-size">${formatFileSize(f.size)}</span>` : ''}
          </div>
          <svg class="post-file-dl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </a>`;
      }).join('')}
    </div>`;
  }

  // Connect / Message button (only for other users' posts)
  let socialBtn = '';
  if (!isOwnPost && currentUser) {
    // Use ctx.matchMap if available (pre-fetched in renderFeed), else skip
    const match = ctx.matchMap ? ctx.matchMap[p.authorEmail] || null : null;
    if (match && match.status === 'accepted') {
      socialBtn = `<button class="post-action-btn" onclick="goToChat('${escHtml(p.authorEmail)}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Message
      </button>`;
    } else if (!match) {
      socialBtn = `<button class="post-action-btn" onclick="connectFromPost('${escHtml(p.authorEmail)}', this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        Connect
      </button>`;
    }
  }

  // ── Session participant bar ──────────────────────────────────────
  let sessionBar = '';
  if (session && session.participants.length > 1) {
        const displayParts = session.participants.slice(0, 5);
    const extra        = session.participants.length - displayParts.length;
    const avatarChips  = displayParts.map(email => {
      const u     = accounts.find(a => a.email === email);
      const init  = u ? getInitials(u) : '?';
      const color = u ? (u.avatarColor || AVATAR_COLORS[0]) : AVATAR_COLORS[0];
      return `<div class="sp-av" style="background:${color}" title="${escHtml(u ? u.name : email)}">${escHtml(init)}</div>`;
    }).join('');
    sessionBar = `
    <div class="post-session-bar">
      <div class="session-participant-avatars">${avatarChips}</div>
      <span>${session.participants.length} joined${extra > 0 ? ` (+${extra} more)` : ''}</span>
    </div>`;
  }

  // Creator post card (product / subscription / quiz embedded card)
  const creatorCard = ctx.creatorCardMap ? (ctx.creatorCardMap[p.id] || '') : '';

  return `
  <div class="feed-post" id="post-${escHtml(p.id)}">
    <div class="post-header">
      <div class="post-avatar" style="background:${color};cursor:pointer"
           onclick="openUserProfile('${escHtml(p.authorEmail)}')"
           title="View profile">${escHtml(initials)}</div>
      <div style="flex:1">
        <div class="post-author" style="cursor:pointer" onclick="openUserProfile('${escHtml(p.authorEmail)}')">${escHtml(name)}${getCreatorBadgeHTML(p.authorEmail)}</div>
        <div class="post-meta">${escHtml(headline)} · ${timeStr}</div>
      </div>
    </div>
    ${sessionBar}
    ${metaChips ? `<div class="post-meta-chips">${metaChips}</div>` : ''}
    <div class="post-body">${escHtml(p.body)}</div>
    ${creatorCard}
    ${imagesHTML}
    ${videosHTML}
    ${filesHTML}
    ${tags.length ? `<div class="post-tags">${tags.map(t=>`<span class="post-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}

    <!-- Action bar -->
    <div class="post-actions">
      <button class="post-action-btn ${liked?'liked':''}" onclick="toggleLike('${escHtml(p.id)}', this)">
        <svg viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span class="like-count-${escHtml(p.id)}">${likeCount}</span> Like${likeCount !== 1 ? 's' : ''}
      </button>
      <button class="post-action-btn" onclick="toggleComments('${escHtml(p.id)}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="comment-count-${escHtml(p.id)}">${comments.length}</span> Comment${comments.length !== 1 ? 's' : ''}
      </button>
      ${joinBtnHTML}
      <button class="post-action-btn ${saved?'saved':''}" onclick="toggleSave('${escHtml(p.id)}', this)">
        <svg viewBox="0 0 24 24" fill="${saved?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        ${saved ? 'Saved' : 'Save'}
      </button>
      <button class="post-action-btn" onclick="sharePost('${escHtml(p.id)}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Share
      </button>
      ${socialBtn}
    </div>

    <!-- Comments section (collapsed by default) -->
    <div class="post-comments" id="comments-${escHtml(p.id)}" style="display:none">
      <div class="comments-list" id="comments-list-${escHtml(p.id)}">
        ${buildCommentsHTMLSync(p.id, ctx)}
      </div>
      <div class="comment-input-row">
        <div class="comment-input-avatar" id="comment-avatar-${escHtml(p.id)}"
             style="background:${currentUser ? (currentUser.avatarColor||AVATAR_COLORS[0]) : AVATAR_COLORS[0]}">
          ${currentUser ? escHtml(getInitials(currentUser)) : '?'}
        </div>
        <input type="text"
               id="comment-input-${escHtml(p.id)}"
               placeholder="Write a comment…"
               onkeydown="if(event.key==='Enter')submitComment('${escHtml(p.id)}')" />
        <button class="comment-send-btn" onclick="submitComment('${escHtml(p.id)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  </div>`;
}

async function renderCommentsHTML(postId) {
  const comments = await getCommentsForPost(postId);
  const accounts = await loadAccounts();
  if (!comments.length) return '<div class="comments-empty">No comments yet. Be the first! 💬</div>';

  return `<div class="comments-list">${comments.map(c => {
    const user  = accounts.find(a => a.email === c.userEmail);
    const name  = user ? user.name : 'Unknown';
    const init  = user ? getInitials(user) : '?';
    const color = user ? (user.avatarColor||AVATAR_COLORS[0]) : AVATAR_COLORS[0];
    return `
    <div class="comment-item">
      <div class="comment-avatar" style="background:${color}">${escHtml(init)}</div>
      <div class="comment-bubble">
        <div class="comment-author" >${escHtml(name)}</div>
        <div class="comment-text">${escHtml(c.text)}</div>
        <div class="comment-time">${formatTimeAgo(c.ts)}</div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ── Interactions ────────────────────────────────────

async function toggleLike(postId, btn) {
  if (!currentUser) return;

  // Fetch only the one post row — not the full table
  const { data: rows, error } = await sb.from('posts').select('id,likes').eq('id', postId).single();
  if (error || !rows) return;

  const likes = Array.isArray(rows.likes) ? [...rows.likes] : [];
  const alreadyLiked = likes.includes(currentUser.email);
  const newLikes = alreadyLiked
    ? likes.filter(e => e !== currentUser.email)
    : [...likes, currentUser.email];

  // Single targeted update — not a full-table upsert
  await sb.from('posts').update({ likes: newLikes }).eq('id', postId);

  // Keep cache in sync
  if (_feedCache.posts) {
    const cached = _feedCache.posts.find(p => p.id === postId);
    if (cached) cached.likes = newLikes;
  }

  const post = { likes: newLikes };

  // Update button in-place (no full re-render)
  if (btn) {
    const newLiked = !alreadyLiked;
    btn.classList.toggle('liked', newLiked);
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', newLiked ? 'currentColor' : 'none');
    const countEl = btn.querySelector(`[class^="like-count-"]`);
    if (countEl) {
      const n = post.likes.length;
      countEl.textContent = n;
      // Also update the text node after the span
      btn.childNodes.forEach(node => {
        if (node.nodeType === 3) {
          node.textContent = ` Like${n !== 1 ? 's' : ''}`;
        }
      });
    }
  }
}

async function toggleComments(postId) {
  const section = document.getElementById('comments-' + postId);
  if (!section) return;
  const isOpen = section.style.display !== 'none';
  section.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) {
    // Refresh comments when opening
    const listEl = document.getElementById('comments-list-' + postId);
    if (listEl) listEl.innerHTML = await renderCommentsHTML(postId);
    const input = document.getElementById('comment-input-' + postId);
    if (input) input.focus();
  }
}

async function submitComment(postId) {
  if (!currentUser) return;
  const input = document.getElementById('comment-input-' + postId);
  const text  = (input ? input.value : '').trim();
  if (!text) return;

  await addComment(postId, currentUser.email, text);
  if (input) input.value = '';

  // Refresh comment list in-place
  const listEl = document.getElementById('comments-list-' + postId);
  if (listEl) listEl.innerHTML = await renderCommentsHTML(postId);

  // Update comment count on the button
  const countEl = document.querySelector(`.comment-count-${postId}`);
  if (countEl) {
    const n = await getCommentsForPost(postId).length;
    countEl.textContent = n;
    // Update label
    const btn = countEl.closest('.post-action-btn');
    if (btn) {
      btn.childNodes.forEach(node => {
        if (node.nodeType === 3) node.textContent = ` Comment${n !== 1 ? 's' : ''}`;
      });
    }
  }
}

async function toggleSave(postId, btn) {
  if (!currentUser) return;
  await toggleSavePost(postId);
  const nowSaved = await isPostSaved(postId);
  if (btn) {
    btn.classList.toggle('saved', nowSaved);
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', nowSaved ? 'currentColor' : 'none');
    btn.childNodes.forEach(node => {
      if (node.nodeType === 3) node.textContent = ' ' + (nowSaved ? 'Saved' : 'Save');
    });
  }
}

/* ══════════════════════════════════════
   GATHER BUDDIES TOGGLE
══════════════════════════════════════ */
function toggleGatherBuddies() {
  composerGatherBuddies = !composerGatherBuddies;
  const btn = document.getElementById('gather-buddies-btn');
  if (!btn) return;
  if (composerGatherBuddies) {
    btn.classList.add('active');
    btn.title = 'Gather Buddies ON — request to join will appear on your post';
  } else {
    btn.classList.remove('active');
    btn.title = 'Gather Buddies — allow others to request to join your study session';
  }
}

/* ══════════════════════════════════════
   CREATE GROUP CHAT FOR POST
   Returns the new group chat id (string).
══════════════════════════════════════ */
async function createGroupChatForPost(postId, name) {
  if (!currentUser) return null;
  const gcId = 'gc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  await sbUpsert('group_chats', {
    id:         gcId,
    post_id:    postId,
    name:       name || 'Study Group',
    host_email: currentUser.email,
    members:    [currentUser.email],
    created_at: new Date().toISOString(),
  }, 'id');
  return gcId;
}

/* ══════════════════════════════════════
   JOIN REQUESTS MODAL
   Host clicks "X Requests" on post → modal opens inline.
══════════════════════════════════════ */
let _jrModalPostId = null;

async function openJoinRequestsPanel(postId) {
  if (!currentUser) return;
  _jrModalPostId = postId;

  const modal = document.getElementById('join-requests-modal');
  const list  = document.getElementById('join-requests-list');
  if (!modal || !list) return;

  modal.classList.add('open');
  list.innerHTML = '<div class="jr-loading">Loading…</div>';

  const [allJRs, accounts] = await Promise.all([
    loadJoinRequests(),
    loadAccounts(),
  ]);

  const postJRs = allJRs.filter(r => r.postId === postId);
  const pending  = postJRs.filter(r => r.status === 'pending');
  const accepted = postJRs.filter(r => r.status === 'accepted');
  const declined = postJRs.filter(r => r.status === 'declined');

  if (!postJRs.length) {
    list.innerHTML = '<div class="jr-empty">No join requests yet for this post.</div>';
    return;
  }

  function renderJRCard(r, type) {
    const acc   = accounts.find(a => a.email === r.requesterEmail);
    const name  = acc ? escHtml(acc.name) : escHtml(r.requesterEmail);
    const init  = acc ? escHtml(getInitials(acc)) : '?';
    const color = acc ? (acc.avatarColor || AVATAR_COLORS[0]) : AVATAR_COLORS[0];
    const headline = acc && acc.headline ? escHtml(acc.headline) : 'Student';

    const actions = type === 'pending'
      ? `<button class="jr-accept-btn" onclick="acceptJoinRequest('${escHtml(r.id)}','${escHtml(postId)}','${escHtml(r.requesterEmail)}',this)">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
           Accept
         </button>
         <button class="jr-decline-btn" onclick="declineJoinRequest('${escHtml(r.id)}','${escHtml(postId)}',this)">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
           Decline
         </button>`
      : type === 'accepted'
        ? `<span class="jr-status-badge accepted">✓ Joined</span>`
        : `<span class="jr-status-badge declined">Declined</span>`;

    return `
    <div class="jr-card" id="jr-card-${escHtml(r.id)}">
      <div class="jr-card-avatar" style="background:${color}">${init}</div>
      <div class="jr-card-info">
        <div class="jr-card-name">${name}</div>
        <div class="jr-card-sub">${headline}</div>
      </div>
      <div class="jr-card-actions">${actions}</div>
    </div>`;
  }

  let html = '';
  if (pending.length) {
    html += `<div class="jr-section-label">Pending (${pending.length})</div>`;
    html += pending.map(r => renderJRCard(r, 'pending')).join('');
  }
  if (accepted.length) {
    html += `<div class="jr-section-label">Accepted</div>`;
    html += accepted.map(r => renderJRCard(r, 'accepted')).join('');
  }
  if (declined.length) {
    html += `<div class="jr-section-label">Declined</div>`;
    html += declined.map(r => renderJRCard(r, 'declined')).join('');
  }
  list.innerHTML = html;
}

function closeJoinRequestsModal(e) {
  if (e && e.target !== document.getElementById('join-requests-modal')) return;
  document.getElementById('join-requests-modal')?.classList.remove('open');
  _jrModalPostId = null;
}

/* ══════════════════════════════════════
   ACCEPT JOIN REQUEST
   Updates status → auto-adds requester to group chat.
══════════════════════════════════════ */
async function acceptJoinRequest(jrId, postId, requesterEmail, btn) {
  if (!currentUser) return;

  // Optimistic UI — disable card buttons
  const card = btn ? btn.closest('.jr-card') : null;
  if (card) {
    card.querySelectorAll('button').forEach(b => b.disabled = true);
    card.style.opacity = '0.6';
  }

  // 1. Mark accepted — use update (not upsert) to avoid overwriting required columns with null
  await sbUpdate('join_requests', jrId, { status: 'accepted' });
  invalidateFeedCache(['joinReqs']);

  // 2. Auto-join requester into the group chat — fetch only this post
  const { data: postRow } = await sb.from('posts').select('id,tags').eq('id', postId).single();
  const post = postRow ? rowToPost(postRow) : null;
  console.log('[accept] post found:', !!post, 'groupChatId:', post?.groupChatId);
  if (post && post.groupChatId) {
    const { data: gc, error: gcErr } = await sb
      .from('group_chats').select('*').eq('id', post.groupChatId).single();
    console.log('[accept] gc found:', !!gc, gcErr?.message);
    if (gc) {
      const members = Array.isArray(gc.members) ? [...gc.members] : [];
      if (!members.includes(requesterEmail)) {
        members.push(requesterEmail);
        // Use sbUpdate — only patch members, never overwrite other columns
        await sbUpdate('group_chats', gc.id, { members });
        console.log('[accept] members updated:', members);
      }
    }
  }

  showToast('Accepted! Buddy added to the group chat.');
  updateSidebarBadges();
  renderFeed();                        // refresh post badge count
  openJoinRequestsPanel(postId);       // re-render the modal
}

/* Decline join request */
async function declineJoinRequest(jrId, postId, btn) {
  if (!currentUser) return;
  const card = btn ? btn.closest('.jr-card') : null;
  if (card) {
    card.querySelectorAll('button').forEach(b => b.disabled = true);
    card.style.opacity = '0.6';
  }
  // Use update (not upsert) to avoid overwriting required columns with null
  await sbUpdate('join_requests', jrId, { status: 'declined' });
  invalidateFeedCache(['joinReqs']);
  showToast('Request declined.');
  updateSidebarBadges();
  renderFeed();
  openJoinRequestsPanel(postId);
}

/* ══════════════════════════════════════
   SEND JOIN REQUEST
   Called from post action button (non-owner).
   Optimistic UI → writes to DB.
══════════════════════════════════════ */
async function sendJoinRequest(postId, btn) {
  if (!currentUser) return;

  // Hard guard — postId must be a non-empty string
  if (!postId || typeof postId !== 'string') {
    console.error('sendJoinRequest: invalid postId', postId);
    return;
  }

  const existing = await getMyJoinRequest(postId);
  if (existing && (existing.status === 'pending' || existing.status === 'accepted')) return;

  // Fetch only the fields we need from this post — not the full table
  const { data: postRow } = await sb.from('posts').select('id,author_email').eq('id', postId).single();
  if (!postRow) { console.error('sendJoinRequest: post not found', postId); return; }
  const hostEmail = postRow.author_email;
  if (!hostEmail || hostEmail === currentUser.email) return;

  // Optimistic UI
  if (btn) {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Pending…`;
    btn.className = 'post-action-btn pending-join';
    btn.disabled  = true;
  }

  // Always use the postId param — never trust existing.postId (could be null from a prior bad row)
  const jrId = (existing && existing.id) ? existing.id : 'jr_' + Date.now();
  await sbUpsert('join_requests', {
    id:              jrId,
    post_id:         postId,           // always the param, never from existing
    requester_email: currentUser.email,
    host_email:      hostEmail,
    status:          'pending',
  }, 'id');

  invalidateFeedCache(['joinReqs']);
  showToast('Join request sent!');
  updateSidebarBadges();
}

/* ══════════════════════════════════════
   CANCEL JOIN REQUEST
   Requester withdraws a pending request.
══════════════════════════════════════ */
async function cancelJoinRequest(postId, btn) {
  if (!currentUser) return;
  if (!postId || typeof postId !== 'string') return;

  const existing = await getMyJoinRequest(postId);
  if (!existing || existing.status !== 'pending') return;

  if (btn) {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Request to Join`;
    btn.className = 'post-action-btn';
    btn.disabled  = false;
    btn.onclick   = () => sendJoinRequest(postId, btn);
  }

  await sbDelete('join_requests', 'id', existing.id);
  invalidateFeedCache(['joinReqs']);
  showToast('Request cancelled.');
  updateSidebarBadges();
}

function sharePost(postId) {
  const url = window.location.href.split('#')[0] + '#post_' + postId;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).catch(() => fallbackCopy(url));
  } else {
    fallbackCopy(url);
  }
  showShareToast();
  // Also update the hash so the URL reflects the shared post
  history.replaceState(null, '', '#post_' + postId);
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
}

function showShareToast() {
  const toast = document.getElementById('share-toast');
  if (!toast) return;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

/* connectFromPost → findbuddies.js */


// ── Image lightbox ──────────────────────────────────
function openLightbox(src) {
  let lb = document.getElementById('img-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'img-lightbox';
    lb.className = 'img-lightbox';
    lb.innerHTML = '<img id="lb-img" src="" alt="Full image">';
    lb.addEventListener('click', () => lb.classList.remove('open'));
    document.body.appendChild(lb);
  }
  document.getElementById('lb-img').src = src;
  lb.classList.add('open');
}

// ── Post submission ─────────────────────────────────
async function submitPost() {
  const input = document.getElementById('post-input');
  const text  = (input ? input.value : '').trim();
  if (!text && composerImages.length === 0) return;
  if (!currentUser) return;

  const subject  = document.getElementById('composer-subject')?.value  || '';
  const schedule = document.getElementById('composer-schedule')?.value || '';
  const location = document.getElementById('composer-location')?.value || '';

  // ── Build tags with sentinels ──
  const tags   = [];
  if (subject) tags.push(subject);
  if (composerGatherBuddies) tags.push('__gather_buddies__');

  const postId      = 'post_' + Date.now();
  const snapImages  = composerImages.map(img => img.dataUrl);
  const snapVideos  = composerVideos.map(v  => ({ dataUrl: v.dataUrl, name: v.name, type: v.type }));
  const snapFiles   = composerFiles.map(f  => ({ name: f.name, size: f.size, dataUrl: f.dataUrl, type: f.type }));
  const snapGather  = composerGatherBuddies;

  // ── Fix B: Reset composer & inject post card INSTANTLY ──
  _resetComposer(input);

  const newPost = {
    id:            postId,
    authorEmail:   currentUser.email,
    timestamp:     Date.now(),
    ts:            Date.now(),
    body:          text,
    tags:          [...tags],
    subject,
    schedule,
    location,
    likes:         [],
    images:        snapImages,
    videos:        snapVideos,
    files:         snapFiles,
    gatherBuddies: snapGather,
    groupChatId:   null,            // filled in background if Gather Buddies
  };

  // Inject optimistic card at top of feed immediately — user sees it now
  _injectOptimisticPost(newPost);

  // ── Fix A + C + D: all DB work fires in background ──
  _persistPost(newPost, postId, subject, snapGather, tags).catch(err => {
    console.error('submitPost background save failed:', err);
    // Remove the optimistic card if save failed
    const el = document.getElementById('post-' + postId);
    if (el) {
      el.style.border = '2px solid #ef4444';
      el.insertAdjacentHTML('afterbegin',
        '<div style="color:#ef4444;font-size:.8rem;padding:8px 12px">⚠️ Failed to save post. Please refresh.</div>');
    }
  });
}

/* ══════════════════════════════════════
   RESET COMPOSER — extracted so it runs instantly on click
══════════════════════════════════════ */
function _resetComposer(input) {
  if (input) { input.value = ''; input.style.height = 'auto'; }
  composerImages        = [];
  composerVideos        = [];
  composerFiles         = [];
  composerExpanded      = false;
  composerGatherBuddies = false;
  const gatherBtn = document.getElementById('gather-buddies-btn');
  if (gatherBtn) gatherBtn.classList.remove('active');
  const expanded = document.getElementById('composer-expanded');
  const simple   = document.getElementById('composer-actions-simple');
  if (expanded) expanded.style.display = 'none';
  if (simple)   simple.style.display   = 'flex';
  const ep = document.getElementById('emoji-picker');
  if (ep) ep.style.display = 'none';
  ['composer-subject','composer-schedule','composer-location'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderComposerPreviews();
}

/* ══════════════════════════════════════
   INJECT OPTIMISTIC POST
   Renders the card into the feed immediately, no DB wait.
   Shows a subtle "Saving…" shimmer that disappears once persisted.
══════════════════════════════════════ */
function _injectOptimisticPost(post) {
  const list = document.getElementById('feed-list');
  if (!list) return;

  // Build minimal card using cached accounts — no DB call
  const accounts   = _feedCache.accounts || [];
  const ctx        = {
    savedSet:     new Set(),
    commentMap:   {},
    joinReqMap:   {},
    sessionMap:   {},
    participantSet: new Set(),
    joinReqs:     [],
    matchMap:     {},
    accountsMap:  {},
    creatorCardMap: {},
  };
  accounts.forEach(a => { ctx.accountsMap[a.email] = a; });

  const html = buildPostHTML(post, accounts, ctx);
  if (!html) return;

  // Wrap in a saving-state container
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const card = wrapper.firstElementChild;
  if (card) {
    card.style.opacity   = '0.85';
    card.style.animation = 'fadeUp .25s ease both';
    card.dataset.optimistic = 'true';
  }

  // Prepend before existing posts (after composer if present)
  const firstPost = list.querySelector('.feed-post');
  if (firstPost) {
    list.insertBefore(wrapper.firstElementChild || wrapper, firstPost);
  } else {
    list.innerHTML = '';
    list.appendChild(wrapper.firstElementChild || wrapper);
  }
}

/* ══════════════════════════════════════
   PERSIST POST (background — Fix A + C + D)
   Single insert of only the new post row.
   No loadPosts(), no savePosts(allPosts) loop.
══════════════════════════════════════ */
async function _persistPost(post, postId, subject, snapGather, tags) {
  // Fix C — create group chat in background (doesn't block card appearing)
  let groupChatId = null;
  if (snapGather) {
    groupChatId = await createGroupChatForPost(postId, subject || 'Study Session');
    if (groupChatId) {
      post.groupChatId = groupChatId;
      tags.push('__gc_' + groupChatId + '__');
      post.tags = [...tags];
    }
  }

  // Fix A — insert ONLY the new post, not the whole table
  const row = postToRow(post);
  const { error } = await sb.from('posts').insert([row]);
  if (error) throw new Error(error.message);

  // Update the optimistic card to full opacity now it's confirmed saved
  const card = document.getElementById('post-' + postId);
  if (card) {
    card.style.opacity   = '1';
    card.removeAttribute('data-optimistic');
  }

  // Fix D — no full renderFeed() needed; just update cache & sidebar
  invalidateFeedCache(['posts']);
  updateSidebarBadges();
}

/* ══════════════════════════════════════
   PROFILE POSTS
══════════════════════════════════════ */
async function renderProfilePosts(email, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const posts = (await loadPosts()).filter(p => p.authorEmail === email)
    .sort((a, b) => (b.ts || b.timestamp || 0) - (a.ts || a.timestamp || 0));

  if (!posts.length) {
    el.innerHTML = '<div class="profile-posts-empty">No posts yet.</div>';
    return;
  }

  el.innerHTML = posts.map(p => `
  <div class="profile-post-item" onclick="appNav('feed');setTimeout(()=>scrollToPost('${escHtml(p.id)}'),80)">
    <div class="profile-post-body">${escHtml(p.body)}</div>
    <div class="profile-post-meta">
      <span>❤️ ${Array.isArray(p.likes) ? p.likes.length : 0}</span>
      <span>💬 ${p._commentCount||0}</span>
      <span>🕐 ${formatTimeAgo(p.ts || p.timestamp)}</span>
    </div>
  </div>`).join('');
}

function scrollToPost(postId) {
  const el = document.getElementById('post-' + postId);
  if (el) {
    el.scrollIntoView({ behavior:'smooth', block:'center' });
    el.style.boxShadow = '0 0 0 3px var(--purple-bright)';
    setTimeout(() => { el.style.boxShadow = ''; }, 2000);
  }
}

/* ══════════════════════════════════════
   FIND BUDDIES → findbuddies.js
══════════════════════════════════════ */

/* ══════════════════════════════════════
   MATCHES
══════════════════════════════════════ */
async function renderMatches() {
  await renderReceivedMatches();
  await renderSentMatches();
  await updateSidebarBadges();
}

async function renderReceivedMatches() {
  const el = document.getElementById('matches-received');
  if (!el || !currentUser) return;

  const accounts = await loadAccounts();
  const received = (await loadMatches()).filter(m =>
    m.to === currentUser.email && m.status === 'pending'
  );

  const tabCount = document.querySelector('#tab-received .tab-count');
  if (tabCount) tabCount.textContent = received.length || '0';

  if (!received.length) {
    el.innerHTML = '<p style="color:var(--text-light);padding:20px 0;">No pending received requests.</p>';
    return;
  }

  el.innerHTML = received.map(m => {
    const sender = accounts.find(a => a.email.toLowerCase() === m.from.toLowerCase());
    if (!sender) return '';
    const init  = getInitials(sender);
    const color = sender.avatarColor || AVATAR_COLORS[0];
    return `
    <div class="match-card">
      <div class="match-card-avatar" style="background:${color}">${escHtml(init)}</div>
      <div class="match-card-info">
        <h4>${escHtml(sender.name)}</h4>
        <p>${escHtml(sender.headline || 'Student')}</p>
      </div>
      <div class="match-card-actions">
        <button class="match-accept"  onclick="acceptMatch('${escHtml(m.from)}')">Accept</button>
        <button class="match-decline" onclick="declineMatch('${escHtml(m.from)}')">Decline</button>
      </div>
    </div>`;
  }).join('');
}

async function renderSentMatches() {
  const el = document.getElementById('matches-sent');
  if (!el || !currentUser) return;

  const accounts = await loadAccounts();
  const sent     = (await loadMatches()).filter(m => m.from === currentUser.email);

  const tabCount = document.querySelector('#tab-sent .tab-count');
  if (tabCount) tabCount.textContent = sent.length || '0';

  if (!sent.length) {
    el.innerHTML = "<p style=\"color:var(--text-light);padding:20px 0;\">You haven't sent any match requests yet.</p>";
    return;
  }

  el.innerHTML = sent.map(m => {
    const target = accounts.find(a => a.email.toLowerCase() === m.to.toLowerCase());
    if (!target) return '';
    const init  = getInitials(target);
    const color = target.avatarColor || AVATAR_COLORS[0];
    const statusLabel = m.status === 'accepted'
      ? '<span class="match-status received">✓ Connected</span>'
      : m.status === 'declined'
      ? '<span class="match-status pending" style="background:#fee2e2;color:#dc2626">✗ Declined</span>'
      : '<span class="match-status pending">⏳ Pending</span>';
    return `
    <div class="match-card">
      <div class="match-card-avatar" style="background:${color}">${escHtml(init)}</div>
      <div class="match-card-info">
        <h4>${escHtml(target.name)}</h4>
        <p>${escHtml(target.headline || 'Student')}</p>
      </div>
      ${statusLabel}
    </div>`;
  }).join('');
}

async function acceptMatch(fromEmail) {
  if (!currentUser) return;
  const matches = await loadMatches();
  const m = matches.find(x => x.from === fromEmail && x.to === currentUser.email);
  if (m) m.status = 'accepted';
  await saveMatches(matches);

  // Auto-create a conversation on accept

  showToast('Connection accepted! You can now message them.');
  await renderMatches();
  await renderBuddies();
  await updateSidebarBadges();
}

async function declineMatch(fromEmail) {
  if (!currentUser) return;
  const matches = await loadMatches();
  const m = matches.find(x => x.from === fromEmail && x.to === currentUser.email);
  if (m) m.status = 'declined';
  await saveMatches(matches);
  await renderMatches();
  await updateSidebarBadges();
}

async function switchMatchTab(tab) {
  activeMatchTab = tab;
  document.getElementById('tab-received').classList.toggle('active', tab === 'received');
  document.getElementById('tab-sent').classList.toggle('active',     tab === 'sent');
  const rec  = document.getElementById('matches-received');
  const sent = document.getElementById('matches-sent');
  if (rec)  rec.style.display  = tab === 'received' ? 'flex' : 'none';
  if (sent) sent.style.display = tab === 'sent'     ? 'flex' : 'none';
  await renderMatches();
}


/** Short human-readable timestamp for conversation list */
function formatShortTime(timestamp) {
  if (!timestamp) return '';
  const now  = Date.now();
  const diff = now - timestamp;
  const date = new Date(timestamp);
  if (diff < 86400000) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (diff < 604800000) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Human-readable file size */
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024)    return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

/* ══════════════════════════════════════
   FILE HELPERS
══════════════════════════════════════ */
function _getFileIcon(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  const map = { pdf:'📄', doc:'📝', docx:'📝', txt:'📄', ppt:'📊', pptx:'📊', xls:'📊', xlsx:'📊', zip:'📦', rar:'📦' };
  return map[ext] || '📎';
}

/* ══════════════════════════════════════
   UTILITIES
══════════════════════════════════════ */
function getInitials(u) {
  if (!u) return '?';
  if (u.initials) return u.initials;
  if (!u.name)    return '?';
  const words = u.name.split(/\s+/).filter(Boolean);
  return words.length >= 2
    ? (words[0][0] + words[words.length-1][0]).toUpperCase()
    : u.name.slice(0,2).toUpperCase();
}

function applyAvatarColor(color, elements) {
  elements.forEach(el => { if (el && color) el.style.background = color; });
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Some time ago';
  const diff = Date.now() - timestamp;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m} minute${m>1?'s':''} ago`;
  if (h < 24) return `${h} hour${h>1?'s':''} ago`;
  if (d < 7)  return `${d} day${d>1?'s':''} ago`;
  return new Date(timestamp).toLocaleDateString();
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function setText(id, text) {
  try { const el = document.getElementById(id); if (el) el.textContent = text != null ? String(text) : ''; } catch(e) {}
}
function setVal(id, val) {
  try { const el = document.getElementById(id); if (el) el.value = val != null ? val : ''; } catch(e) {}
}
function getVal(id) {
  try { const el = document.getElementById(id); return el ? el.value.trim() : ''; } catch(_) { return ''; }
}


/* ══════════════════════════════════════
   SESSIONS SYSTEM  (Virtual Study Rooms)
   Storage: sb_rooms
   { id, name, subject, mode, hostEmail,
     participants:[email], sharedNotes:[{noteId,sharedBy,ts}],
     createdAt, active }
══════════════════════════════════════ */

const STORAGE_ROOMS = 'sb_rooms';


/* ══════════════════════════════════════
   SESSION PAGE STATE
══════════════════════════════════════ */
let activeRoomId        = null;
let localStream         = null;
let micEnabled          = true;
let camEnabled          = true;
let screenSharing       = false;
let screenStream        = null;

// ── Pomodoro state ─────────────────────────────────────
const POMO_FOCUS_SECS  = 25 * 60;
const POMO_BREAK_SECS  = 5  * 60;
let pomoInterval   = null;
let pomoSeconds    = POMO_FOCUS_SECS;
let pomoMode       = 'focus';   // 'focus' | 'break'
let pomoRounds     = 0;
let pomoRunning    = false;

/* ══════════════════════════════════════
   PAGE INIT
══════════════════════════════════════ */
async function initSessionsPage() {
  renderRoomsList();
  if (!activeRoomId) showLobby();
  else {
    const allRooms = await loadRooms();
    const room = allRooms.find(r => r.id === activeRoomId);
    if (room) showRoomView(room);
  }
}

/* ══════════════════════════════════════
   ROOMS LIST
══════════════════════════════════════ */
async function renderRoomsList() {
  const container = document.getElementById('rooms-list');
  if (!container) return;
  const rooms = await loadRooms();

  if (!rooms.length) {
    container.innerHTML = `<div class="sr-rooms-empty">No rooms yet.<br>Create one to get started!</div>`;
    return;
  }

  container.innerHTML = rooms.map(room => {
    const isActive  = room.id === activeRoomId;
    const partCount = (room.participants || []).length;
    const isLive    = room.active && partCount > 0;
    const modeIcon  = room.mode === 'video' ? '📹' : '🎙';
    return `
    <div class="sr-room-card ${isActive ? 'active' : ''}" onclick="joinRoom('${escHtml(room.id)}')">
      <span class="sr-card-dot ${isLive ? 'live' : 'idle'}"></span>
      <div class="sr-card-body">
        <div class="sr-card-name">${modeIcon} ${escHtml(room.title || room.name || 'Untitled Room')}</div>
        <div class="sr-card-meta">${escHtml(room.subject || 'General')} · ${partCount} member${partCount !== 1 ? 's' : ''}</div>
      </div>
      ${partCount > 0 ? `<span class="sr-card-count">${partCount}</span>` : ''}
    </div>`;
  }).join('');

  const anyLive = rooms.some(r => r.active && (r.participants || []).length > 0);
  const liveBadge = document.getElementById('sessions-live-badge');
  if (liveBadge) liveBadge.style.display = anyLive ? '' : 'none';
}

/* ══════════════════════════════════════
   CREATE ROOM MODAL
══════════════════════════════════════ */
async function openCreateRoomModal() {
  const modal = document.getElementById('create-room-modal');
  if (modal) modal.classList.add('open');
}
function closeCreateRoomModal(e) {
  if (e && e.target !== document.getElementById('create-room-modal')) return;
  document.getElementById('create-room-modal')?.classList.remove('open');
}

async function createRoom() {
  if (!currentUser) return;
  const nameEl    = document.getElementById('room-name-input');
  const subjectEl = document.getElementById('room-subject-input');
  const modeEl    = document.getElementById('room-mode-select');
  const name    = (nameEl    ? nameEl.value    : '').trim();
  const subject = (subjectEl ? subjectEl.value : '').trim();
  const mode    = (modeEl    ? modeEl.value    : 'video') || 'video';
  if (!name) { showToast('Please enter a room name.'); return; }

  const newRoom = {
    id:           'room_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    title:        name,
    name:         name,
    subject:      subject,
    hostEmail:    currentUser.email,
    mode,
    participants: [currentUser.email],
    roomNotes:    [],
    roomChat:     [],
    active:       true,
    createdAt:    Date.now(),
  };
  const rooms = await loadRooms();
  rooms.push(newRoom);
  await saveRooms(rooms);

  const modal = document.getElementById('create-room-modal');
  if (modal) modal.classList.remove('open');

  await renderRoomsList();
  await joinRoom(newRoom.id);
}

/* ══════════════════════════════════════
   JOIN / LEAVE
══════════════════════════════════════ */
async function joinRoom(roomId) {
  if (!currentUser) return;
  if (activeRoomId && activeRoomId !== roomId) await leaveRoom(true);

  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === roomId);
  if (!room) return;

  if (!room.participants.includes(currentUser.email)) {
    room.participants.push(currentUser.email);
  }
  if (!room.roomNotes)  room.roomNotes  = [];
  if (!room.messages)   room.messages   = [];
  room.active = true;
  await saveRooms(rooms);

  activeRoomId = roomId;
  await renderRoomsList();
  showRoomView(room);
  await startLocalMedia(room.mode);
  setTimeout(refreshLocalTile, 250);
}

async function leaveRoom(silent) {
  if (!activeRoomId) return;

  stopLocalMedia();
  pomodoroStop();
  destroyRoomWhiteboard();

  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);

  if (room) {
    room.participants = room.participants.filter(e => e !== currentUser.email);

    if (room.participants.length === 0) {
      // Auto-delete empty room from DB
      await sb.from('sessions').delete().eq('id', room.id);
    } else {
      room.active = true;
      await saveRooms(rooms);
    }
  }

  activeRoomId = null;
  await renderRoomsList();
  if (!silent) showLobby();
}

/* ══════════════════════════════════════
   ROOM UI — LOBBY / VIEW
══════════════════════════════════════ */
function showLobby() {
  document.getElementById('sessions-lobby').style.display = 'flex';
  document.getElementById('room-view').style.display      = 'none';
}

async function showRoomView(room) {
  document.getElementById('sessions-lobby').style.display = 'none';
  document.getElementById('room-view').style.display      = 'flex';

  setText('room-header-name',    room.name || room.title || 'Room');
  setText('room-header-subject', room.subject || '');

  switchRoomTab('video');
  renderVideoGrid(room);
  renderParticipants(room);
}

/* ══════════════════════════════════════
   TAB SWITCHING
══════════════════════════════════════ */
async function switchRoomTab(tab) {
  const tabs   = ['video', 'whiteboard', 'chat'];
  const panels = { video: 'rpanel-video', whiteboard: 'rpanel-whiteboard', chat: 'rpanel-chat' };

  tabs.forEach(t => {
    const tabEl   = document.getElementById('rtab-' + t);
    const panelEl = document.getElementById(panels[t]);
    if (tabEl)   tabEl.classList.toggle('active', t === tab);
    if (panelEl) {
      panelEl.style.display = t === tab ? 'flex' : 'none';
      panelEl.classList.toggle('active', t === tab);
    }
  });

  if (tab === 'chat')        { await renderRoomChat(); clearChatBadge(); }
  if (tab === 'whiteboard')  { await initRoomWhiteboard(); }
}

/* Sub-tab switcher inside Notes panel (Notes / Draw) */


/* ══════════════════════════════════════
   MEDIA
══════════════════════════════════════ */
async function startLocalMedia(mode) {
  /* Delegate to WebRTC module — acquires media AND sets up peer connections */
  const accounts = await loadAccounts();
  SBCall.setAccountCache(accounts);
  await SBCall.start(activeRoomId, currentUser.email, sb, { video: mode === 'video' });
  /* Keep localStream reference for refreshLocalTile compatibility */
  localStream = SBCall.getLocalStream();
  micEnabled  = true;
  camEnabled  = mode === 'video';
  updateMediaButtons();
  /* refreshLocalTile paints the stream onto the existing vtile-local
     tile that renderVideoGrid already created — no duplicate spawn */
  refreshLocalTile();
}

function stopLocalMedia() {
  SBCall.leave();
  localStream   = null;
  screenSharing = false;
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  micEnabled = camEnabled = screenSharing = false;
}

function toggleMic() {
  SBCall.toggleMic();
  micEnabled = !micEnabled;
  updateMediaButtons();
  refreshLocalTile();
}

function toggleCam() {
  SBCall.toggleCam();
  camEnabled = !camEnabled;
  updateMediaButtons();
  refreshLocalTile();
}

async function toggleScreenShare() {
  if (screenSharing) {
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    screenSharing = false;
    updateMediaButtons(); refreshLocalTile();
    return;
  }
  try {
    screenStream  = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    screenSharing = true;
    screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      screenSharing = false; screenStream = null;
      updateMediaButtons(); refreshLocalTile();
    });
    updateMediaButtons(); refreshLocalTile();
  } catch (_) {}
}

function updateMediaButtons() {
  const micBtn = document.getElementById('btn-toggle-mic');
  const micLbl = document.getElementById('mic-label');
  if (micBtn) {
    micBtn.classList.toggle('muted-btn', !micEnabled);
    micBtn.querySelector('.mic-on').style.display  = micEnabled ? '' : 'none';
    micBtn.querySelector('.mic-off').style.display = micEnabled ? 'none' : '';
  }
  if (micLbl) micLbl.textContent = micEnabled ? 'Mute' : 'Unmute';

  const camBtn = document.getElementById('btn-toggle-cam');
  const camLbl = document.getElementById('cam-label');
  if (camBtn) {
    camBtn.classList.toggle('muted-btn', !camEnabled);
    camBtn.querySelector('.cam-on').style.display  = camEnabled ? '' : 'none';
    camBtn.querySelector('.cam-off').style.display = camEnabled ? 'none' : '';
  }
  if (camLbl) camLbl.textContent = camEnabled ? 'Stop Video' : 'Start Video';

  const scrBtn = document.getElementById('btn-toggle-screen');
  const scrLbl = document.getElementById('screen-label');
  if (scrBtn) scrBtn.classList.toggle('active-media', screenSharing);
  if (scrLbl) scrLbl.textContent = screenSharing ? 'Stop Share' : 'Share Screen';
}

function refreshLocalTile() {
  const tile = document.getElementById('vtile-local');
  if (!tile) return;
  const videoEl  = tile.querySelector('video');
  const avatarEl = tile.querySelector('.video-tile-avatar');
  const stream   = screenSharing ? screenStream : localStream;
  const hasVideo = stream && stream.getVideoTracks().some(t => t.enabled);

  if (videoEl) {
    if (hasVideo) {
      videoEl.srcObject = stream;
      videoEl.style.display = '';
      videoEl.play().catch(() => {}); // force play (required on Safari/iOS)
      if (avatarEl) avatarEl.style.display = 'none';
    } else {
      videoEl.srcObject = null;
      videoEl.style.display = 'none';
      if (avatarEl) avatarEl.style.display = 'flex';
    }
  }
  const label = tile.querySelector('.video-tile-label');
  if (label) {
    const micOff = label.querySelector('.tile-mic-off');
    if (micOff) micOff.style.display = micEnabled ? 'none' : '';
  }
}

async function renderVideoGrid(room) {
  const grid = document.getElementById('video-grid');
  if (!grid || !currentUser) return;
  const accounts = await loadAccounts();

  grid.innerHTML = room.participants.map(email => {
    const u      = accounts.find(a => a.email === email);
    const name   = u ? u.name : email;
    const init   = u ? getInitials(u) : '?';
    const color  = u ? (u.avatarColor || AVATAR_COLORS[0]) : AVATAR_COLORS[0];
    const isSelf = email === currentUser.email;
    const tileId = isSelf ? 'vtile-local' : 'vtile-' + email.replace(/[^a-z0-9]/gi, '_');

    return `
    <div class="video-tile" id="${escHtml(tileId)}">
      <video autoplay playsinline ${isSelf ? 'muted' : ''} style="display:none"></video>
      <div class="video-tile-avatar" style="display:flex">
        <div class="video-tile-av-circle" style="background:${color}">${escHtml(init)}</div>
        <div class="video-tile-name">${escHtml(name)}${isSelf ? ' (You)' : ''}</div>
      </div>
      <div class="video-tile-label">
        ${escHtml(isSelf ? 'You' : name.split(' ')[0])}
        <span class="tile-mic-off" style="${isSelf && !micEnabled ? '' : 'display:none'}">🔇</span>
      </div>
    </div>`;
  }).join('');

  if (localStream || screenStream) refreshLocalTile();
}

async function renderParticipants(room) {
  const strip = document.getElementById('participants-list');
  if (!strip) return;
  const accounts = await loadAccounts();
  strip.innerHTML = room.participants.map(email => {
    const u     = accounts.find(a => a.email === email);
    const init  = u ? getInitials(u) : '?';
    const color = u ? (u.avatarColor || AVATAR_COLORS[0]) : AVATAR_COLORS[0];
    const name  = u ? u.name : email;
    return `<div class="sr-participant-chip" style="background:${color}" title="${escHtml(name)}">${escHtml(init)}</div>`;
  }).join('');
}

/* ══════════════════════════════════════
   POMODORO TIMER
══════════════════════════════════════ */
function pomodoroToggle() {
  if (pomoRunning) {
    pomodoroStop();
  } else {
    pomodoroStart();
  }
}

function pomodoroStart() {
  if (pomoRunning) return;
  pomoRunning = true;
  const playBtn = document.getElementById('pomo-play');
  if (playBtn) {
    playBtn.classList.add('sr-pomo-btn', 'pomo-running');
    playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
  }
  pomoInterval = setInterval(pomodoroTick, 1000);
}

function pomodoroStop() {
  pomoRunning = false;
  clearInterval(pomoInterval);
  pomoInterval = null;
  const playBtn = document.getElementById('pomo-play');
  if (playBtn) {
    playBtn.classList.remove('pomo-running');
    playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  }
}

function pomodoroTick() {
  pomoSeconds--;
  if (pomoSeconds < 0) {
    pomodoroAdvance();
    return;
  }
  pomodoroRenderTime();
}

function pomodoroAdvance() {
  if (pomoMode === 'focus') {
    pomoRounds++;
    pomoMode    = 'break';
    pomoSeconds = POMO_BREAK_SECS;
    showToast('🍅 Focus done! Take a break.');
  } else {
    pomoMode    = 'focus';
    pomoSeconds = POMO_FOCUS_SECS;
    showToast('☕ Break over! Back to focus.');
  }
  pomodoroRenderTime();
  pomodoroRenderMeta();
}

function pomodoroReset() {
  pomodoroStop();
  pomoMode    = 'focus';
  pomoSeconds = POMO_FOCUS_SECS;
  pomodoroRenderTime();
  pomodoroRenderMeta();
}

function pomodoroSkip() {
  pomodoroStop();
  pomodoroAdvance();
}

function pomodoroRenderTime() {
  const m = Math.floor(pomoSeconds / 60);
  const s = pomoSeconds % 60;
  const display = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const el = document.getElementById('pomo-time');
  if (el) {
    el.textContent = display;
    el.classList.toggle('pomo-urgent', pomoSeconds <= 60 && pomoMode === 'focus');
  }
}

function pomodoroRenderMeta() {
  const badgeEl  = document.getElementById('pomo-badge');
  const roundsEl = document.getElementById('pomo-rounds');
  if (badgeEl) {
    badgeEl.textContent = pomoMode === 'focus' ? '🍅 Focus' : '☕ Break';
    badgeEl.className   = 'sr-pomo-badge' + (pomoMode === 'break' ? ' break' : '');
  }
  if (roundsEl) roundsEl.textContent = `${pomoRounds}/4`;
}


async function sendRoomMessage() {
  if (!activeRoomId || !currentUser) return;
  const input = document.getElementById('rchat-input');
  const body  = (input ? input.value : '').trim();
  if (!body) return;

  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);
  if (!room) return;
  if (!room.messages) room.messages = [];

  room.messages.push({
    from: currentUser.email,
    body,
    ts:   Date.now(),
  });
  await saveRooms(rooms);

  if (input) input.value = '';
  await renderRoomChat();
}

async function renderRoomChat() {
  const container = document.getElementById('rchat-msgs');
  if (!container || !activeRoomId) return;

  const allRooms = await loadRooms();
    const room = allRooms.find(r => r.id === activeRoomId);
  if (!room) return;

  const msgs     = room.messages || [];
  const accounts = await loadAccounts();

  if (!msgs.length) {
    container.innerHTML = '<div class="rchat-empty">No messages yet. Say hello! 👋</div>';
    return;
  }

  let lastDateStr = '';
  let lastSender  = '';
  const parts = [];

  msgs.forEach(m => {
    const msgDate = new Date(m.ts);
    const dateStr = msgDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const isToday = dateStr === new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const isYest  = dateStr === new Date(Date.now() - 86400000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    if (dateStr !== lastDateStr) {
      lastDateStr = dateStr;
      lastSender  = '';
      const label = isToday ? 'Today' : isYest ? 'Yesterday' : dateStr;
      parts.push(`<div class="rchat-date-divider">${escHtml(label)}</div>`);
    }

    const mine        = m.from === currentUser.email;
    const isNewSender = m.from !== lastSender;
    lastSender        = m.from;

    const u         = accounts.find(a => a.email === m.from);
    const senderName = u ? u.name.split(' ')[0] : m.from;
    const timeStr   = formatShortTime(m.ts);

    parts.push(`
    <div class="rchat-msg ${mine ? 'mine' : 'theirs'} ${isNewSender ? 'new-sender' : ''}">
      ${isNewSender && !mine ? `<div class="rchat-sender">${escHtml(senderName)}</div>` : ''}
      <div class="rchat-bubble">${escHtml(m.body)}</div>
      <div class="rchat-time">${escHtml(timeStr)}</div>
    </div>`);
  });

  container.innerHTML = parts.join('');
  container.scrollTop = container.scrollHeight;
}


function wbGetCanvas() { return document.getElementById('wb-canvas'); }

function wbGetCtx()    { const c = wbGetCanvas(); return c ? c.getContext('2d') : null; }

function wbResize() {
  const canvas = wbGetCanvas();
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  // Save current drawing
  const ctx = canvas.getContext('2d');
  const imageData = ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
  canvas.width  = parent.clientWidth;
  canvas.height = parent.clientHeight - (canvas.previousElementSibling ? canvas.previousElementSibling.offsetHeight : 0);
  if (ctx && imageData) ctx.putImageData(imageData, 0, 0);
  _wbInitListeners();
}

function _wbInitListeners() {
  const canvas = wbGetCanvas();
  if (!canvas || _wbListenersAttached) return;
  _wbListenersAttached = true;

  canvas.addEventListener('mousedown',  wbOnDown);
  canvas.addEventListener('mousemove',  wbOnMove);
  canvas.addEventListener('mouseup',    wbOnUp);
  canvas.addEventListener('mouseleave', wbOnUp);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); wbOnDown(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); wbOnMove(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchend',   e => { wbOnUp(); }, { passive: false });
}

function wbXY(e) {
  const canvas = wbGetCanvas();
  const rect   = canvas.getBoundingClientRect();
  return { x: (e.clientX || 0) - rect.left, y: (e.clientY || 0) - rect.top };
}

function wbOnDown(e) {
  const ctx = wbGetCtx();
  if (!ctx) return;
  wbDrawing = true;
  const { x, y } = wbXY(e);
  wbStartX = x; wbStartY = y;

  if (wbTool === 'text') {
    wbPlaceText(x, y);
    wbDrawing = false;
    return;
  }

  // Save undo snapshot before drawing
  const canvas = wbGetCanvas();
  wbHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (wbHistory.length > 40) wbHistory.shift();

  if (wbTool === 'pen' || wbTool === 'highlight' || wbTool === 'eraser') {
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  // Keep shape snapshot
  wbSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function wbOnMove(e) {
  if (!wbDrawing) return;
  const ctx = wbGetCtx();
  if (!ctx) return;
  const { x, y } = wbXY(e);
  const canvas    = wbGetCanvas();

  if (wbTool === 'pen') {
    ctx.strokeStyle   = wbColor;
    ctx.lineWidth     = wbSize;
    ctx.lineCap       = 'round';
    ctx.lineJoin      = 'round';
    ctx.globalAlpha   = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineTo(x, y);
    ctx.stroke();
  } else if (wbTool === 'highlight') {
    ctx.strokeStyle   = wbColor;
    ctx.lineWidth     = wbSize * 4;
    ctx.lineCap       = 'round';
    ctx.globalAlpha   = 0.35;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineTo(x, y);
    ctx.stroke();
  } else if (wbTool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth     = wbSize * 5;
    ctx.lineCap       = 'round';
    ctx.globalAlpha   = 1;
    ctx.lineTo(x, y);
    ctx.stroke();
  } else {
    // Restore snapshot before redrawing shape preview
    if (wbSnapshot) ctx.putImageData(wbSnapshot, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = wbColor;
    ctx.lineWidth   = wbSize;
    ctx.fillStyle   = 'transparent';
    ctx.beginPath();
    if (wbTool === 'line') {
      ctx.moveTo(wbStartX, wbStartY);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (wbTool === 'rect') {
      ctx.strokeRect(wbStartX, wbStartY, x - wbStartX, y - wbStartY);
    } else if (wbTool === 'circle') {
      const rx = Math.abs(x - wbStartX) / 2;
      const ry = Math.abs(y - wbStartY) / 2;
      const cx = wbStartX + (x - wbStartX) / 2;
      const cy = wbStartY + (y - wbStartY) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function wbOnUp() {
  if (!wbDrawing) return;
  wbDrawing   = false;
  wbSnapshot  = null;
  const ctx = wbGetCtx();
  if (ctx) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
  }
}

function wbPlaceText(x, y) {
  if (wbTextInput) { wbTextInput.blur(); return; }
  const canvas = wbGetCanvas();
  if (!canvas) return;

  wbTextInput = document.createElement('textarea');
  Object.assign(wbTextInput.style, {
    position: 'fixed', left: (canvas.getBoundingClientRect().left + x) + 'px',
    top: (canvas.getBoundingClientRect().top + y) + 'px',
    minWidth: '120px', minHeight: '32px', resize: 'both',
    background: 'transparent', border: '1.5px dashed ' + wbColor,
    color: wbColor, fontSize: (wbSize * 5 + 10) + 'px', outline: 'none',
    fontFamily: 'DM Sans, sans-serif', zIndex: 9999, padding: '4px',
  });
  document.body.appendChild(wbTextInput);
  wbTextInput.focus();

  wbTextInput.addEventListener('blur', () => {
    const txt = wbTextInput.value.trim();
    if (txt) {
      const ctx = wbGetCtx();
      if (ctx) {
        const canvas = wbGetCanvas();
        wbHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        ctx.fillStyle = wbColor;
        ctx.font      = `${wbSize * 5 + 10}px 'DM Sans', sans-serif`;
        txt.split('\n').forEach((line, i) => ctx.fillText(line, x, y + i * (wbSize * 5 + 14)));
      }
    }
    document.body.removeChild(wbTextInput);
    wbTextInput = null;
  });
}

function wbSetTool(tool) {
  wbTool = tool;
  document.querySelectorAll('.wb-tool').forEach(b => {
    b.classList.toggle('active', b.id === 'wbt-' + tool);
  });
}

function wbSetColor(color, btn) {
  wbColor = color;
  document.querySelectorAll('.wb-color').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const customEl = document.getElementById('wb-color-custom');
  if (customEl) customEl.value = color;
}

function wbSetSize(size, btn) {
  wbSize = size;
  document.querySelectorAll('.wb-size').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function wbUndo() {
  const ctx = wbGetCtx();
  if (!ctx || !wbHistory.length) return;
  ctx.putImageData(wbHistory.pop(), 0, 0);
}

function wbClear() {
  const canvas = wbGetCanvas();
  const ctx    = wbGetCtx();
  if (!ctx || !canvas) return;
  if (!confirm('Clear the whiteboard? This cannot be undone.')) return;
  wbHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function wbExport() {
  const canvas = wbGetCanvas();
  if (!canvas) return;
  const link  = document.createElement('a');
  link.download = 'studybuddy-whiteboard.png';
  link.href     = canvas.toDataURL('image/png');
  link.click();
}


/* ══════════════════════════════════════
   USER ADDITIONS — messaging, creator post, subscriptions
══════════════════════════════════════ */

async function _confirmSubscription(creatorEmail, tier) {
  if (!currentUser) return;
  const subs = await loadUserSubs();
  if (subs.some(s => s.userEmail === currentUser.email && s.creatorEmail === creatorEmail)) {
    showToast('You are already subscribed!'); return;
  }
  subs.push({
    id:           'sub_' + Date.now(),
    userEmail:    currentUser.email,
    creatorEmail,
    tierId:       tier.id,
    price:        tier.price,
    since:        Date.now(),
  });
  await saveUserSubs(subs);
  showToast(`✅ Subscribed to "${tier.name}"! ₱${tier.price}/month`);

  // Refresh whichever profile view is open

  await renderFeed();
}

function _creatorAccessManagerHTML(post) {
  const requests = Array.isArray(post.accessRequests) ? post.accessRequests : [];
  const granted  = Array.isArray(post.accessList)     ? post.accessList     : [];
  const pendingCount = requests.filter(r => !granted.includes(r.email)).length;
  return `<button class="cpost-manage-btn" onclick="openAccessManager('${escHtml(post.id)}')">
    🔑 Manage Access${pendingCount > 0 ? ` <span class="cpost-req-badge">${pendingCount}</span>` : ''}
  </button>`;
}

/* ══════════════════════════════════════
   CLEAR ALL ROOMS (one-time cleanup)
   Deletes all rooms from Supabase so the
   user starts fresh
══════════════════════════════════════ */
async function clearAllRooms() {
  if (!currentUser) return;
  if (!confirm('Delete all existing rooms and start fresh? This cannot be undone.')) return;
  try {
    const { error } = await sb.from('sessions').delete().neq('id', '');
    if (error) { showToast('Error clearing rooms: ' + error.message); return; }
    activeRoomId = null;
    showLobby();
    await renderRoomsList();
    showToast('✅ All rooms cleared. Ready for a fresh start!');
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}


async function openChatUserProfile(email) { /* profile page removed */ }
/* ══════════════════════════════════════
   TOAST
══════════════════════════════════════ */
function showToast(msg) {
  const t = document.getElementById('share-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}


/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
(async function init() {
  try { if (localStorage.getItem(STORAGE_NIGHT) === '1') toggleNightMode(); } catch (_) {}

  // Handle shared post link on load
  const hash = window.location.hash;
  if (hash && hash.startsWith('#post_') && currentUser) {
    await appNav('feed');
  }
})();



/* ══════════════════════════════════════
   MESSAGES → messages.js
══════════════════════════════════════ */

/* ══════════════════════════════════════
   NOTEPAD SYSTEM → notepad.js
══════════════════════════════════════ */

/* ══════════════════════════════════════
   ROOM WHITEBOARD SYSTEM
   Access: host always, others if in wbAccess[]
   Sync:   wb_data col in sessions table (push/pull)
══════════════════════════════════════ */

/* ── State ─────────────────────────────────────────────────── */
let _rwbInstance   = null;   // StudyBuddyWhiteboard for the room
let _rwbPollTimer  = null;   // setInterval id for canvas sync
let _rwbLastData   = null;   // last known wb_data string (to detect changes)

/* ── Initialise whiteboard when tab is opened ──────────────── */
async function initRoomWhiteboard() {
  if (!activeRoomId || !currentUser) return;

  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);
  if (!room) return;

  const isHost   = room.hostEmail === currentUser.email;
  const hasAccess = isHost || (room.wbAccess || []).includes(currentUser.email);

  /* ── Host bar vs participant bar ── */
  const hostBar  = document.getElementById('rwb-access-bar');
  const partBar  = document.getElementById('rwb-status-bar');
  if (hostBar) hostBar.style.display  = isHost ? 'flex' : 'none';
  if (partBar) partBar.style.display  = isHost ? 'none' : 'flex';

  if (!isHost) _rwbUpdateAccessBadge(hasAccess);
  if (isHost)  renderWbAccessPanel(room);

  /* ── Create or reconfigure whiteboard instance ── */
  const hostEl = document.getElementById('rwb-whiteboard-host');
  if (!hostEl) return;

  if (!_rwbInstance) {
    await new Promise(r => setTimeout(r, 40)); // let panel become visible
    _rwbInstance = StudyBuddyWhiteboard.create({
      containerId: 'rwb-whiteboard-host',
      noteId:      'room_' + activeRoomId,     // localStorage key
    });
  }

  /* apply access */
  _rwbInstance.setReadOnly(!hasAccess);

  /* load latest canvas from DB */
  await loadRoomWbCanvas();

  /* start polling for sync + access changes every 10s */
  _rwbStopPoll();
  _rwbPollTimer = setInterval(_rwbPoll, 10000);
}

/* ── Polling ────────────────────────────────────────────────── */
async function _rwbPoll() {
  if (!activeRoomId || !currentUser) return _rwbStopPoll();

  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);
  if (!room) return _rwbStopPoll();

  const isHost    = room.hostEmail === currentUser.email;
  const hasAccess = isHost || (room.wbAccess || []).includes(currentUser.email);

  /* update read-only state if access changed */
  if (_rwbInstance) _rwbInstance.setReadOnly(!hasAccess);
  if (!isHost) _rwbUpdateAccessBadge(hasAccess);
  if (isHost)  renderWbAccessPanel(room);

  /* pull canvas if data changed */
  if (room.wbData && room.wbData !== _rwbLastData) {
    _rwbLastData = room.wbData;
    if (_rwbInstance) _rwbInstance.loadFromDataUrl(room.wbData);
  }
}

function _rwbStopPoll() {
  if (_rwbPollTimer) { clearInterval(_rwbPollTimer); _rwbPollTimer = null; }
}

/* ── Access panel (host only) ───────────────────────────────── */
function renderWbAccessPanel(room) {
  const container = document.getElementById('rwb-participant-toggles');
  if (!container) return;

  const others = (room.participants || []).filter(e => e !== room.hostEmail);
  if (!others.length) {
    container.innerHTML = `<span class="rwb-no-participants">No participants yet</span>`;
    return;
  }

  container.innerHTML = others.map(email => {
    const granted = (room.wbAccess || []).includes(email);
    const name    = email.split('@')[0];
    return `
      <label class="rwb-toggle-row" title="${escHtml(email)}">
        <span class="rwb-toggle-name">${escHtml(name)}</span>
        <div class="rwb-toggle ${granted ? 'on' : ''}"
             onclick="toggleRoomWbAccess('${escHtml(email)}')">
          <div class="rwb-toggle-knob"></div>
        </div>
      </label>`;
  }).join('');
}

/* ── Grant / revoke access ──────────────────────────────────── */
async function toggleRoomWbAccess(email) {
  if (!activeRoomId || !currentUser) return;

  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);
  if (!room || room.hostEmail !== currentUser.email) return;

  if (!room.wbAccess) room.wbAccess = [];

  if (room.wbAccess.includes(email)) {
    room.wbAccess = room.wbAccess.filter(e => e !== email);
    showToast(`🔒 Whiteboard access removed from ${email.split('@')[0]}`);
  } else {
    room.wbAccess.push(email);
    showToast(`✏️ Whiteboard access granted to ${email.split('@')[0]}`);
  }

  await saveRooms(rooms);
  renderWbAccessPanel(room);
}

/* ── Push canvas to DB (host or anyone with access) ─────────── */
async function saveRoomWbCanvas() {
  if (!activeRoomId || !currentUser || !_rwbInstance) return;

  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);
  if (!room) return;

  const isHost    = room.hostEmail === currentUser.email;
  const hasAccess = isHost || (room.wbAccess || []).includes(currentUser.email);
  if (!hasAccess) { showToast('You don\'t have whiteboard access'); return; }

  const dataUrl = _rwbInstance.getDataUrl();
  room.wbData   = dataUrl;
  _rwbLastData  = dataUrl;
  await saveRooms(rooms);
  showToast('✓ Canvas pushed to all participants');

  /* Also save a copy to Notepad */
  await _saveWbToNotepad(room, dataUrl);
}

/**
 * Save the current room whiteboard as a note in the Notepad.
 * Note title = "Whiteboard — <Room Name> (<date>)"
 */
async function _saveWbToNotepad(room, dataUrl) {
  if (!currentUser) return;
  try {
    const roomName  = room.title || room.name || 'Unnamed Room';
    const dateStr   = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const noteTitle = `Whiteboard — ${roomName} (${dateStr})`;

    const noteId = 'npwb_' + activeRoomId + '_' + Date.now();
    const note = {
      id:          noteId,
      title:       noteTitle,
      content:     `Whiteboard exported from session room "${roomName}" on ${dateStr}.`,
      contentHtml: `<p>Whiteboard exported from session room "<strong>${roomName}</strong>" on ${dateStr}.</p>`,
      folderId:    null,
      subject:     room.subject || '',
      tags:        ['whiteboard', 'session'],
      isPinned:    false,
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
    };

    /* Save to DB */
    await sbUpsert('notes', {
      id:           note.id,
      author_email: currentUser.email,
      title:        note.title,
      content:      note.content,
      content_html: note.contentHtml,
      folder_id:    null,
      subject:      note.subject,
      tags:         note.tags,
      updated_at:   new Date().toISOString(),
    }, 'id');

    /* Save whiteboard image to localStorage keyed to the note id */
    try { localStorage.setItem('sb_wb_' + noteId, dataUrl); } catch (_) {}

    /* If notepad is open, push to in-memory list so it appears immediately */
    if (Array.isArray(_npNotes)) {
      _npNotes.unshift(note);
      renderNotepadTree();
    }

    showToast(`📝 Whiteboard saved to Notepad as "${noteTitle}"`);
  } catch (err) {
    console.error('[saveWbToNotepad]', err);
  }
}

/* ── Pull latest canvas from DB ─────────────────────────────── */
async function loadRoomWbCanvas() {
  if (!activeRoomId || !_rwbInstance) return;

  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);
  if (!room || !room.wbData) return;

  if (room.wbData !== _rwbLastData) {
    _rwbLastData = room.wbData;
    _rwbInstance.loadFromDataUrl(room.wbData);
  }
}

/* ── Badge helper for non-host ──────────────────────────────── */
function _rwbUpdateAccessBadge(hasAccess) {
  const badge = document.getElementById('rwb-access-badge');
  if (!badge) return;
  if (hasAccess) {
    badge.className = 'rwb-access-badge';
    badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      style="width:14px;height:14px"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
      You can draw`;
  } else {
    badge.className = 'rwb-readonly-badge';
    badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      style="width:14px;height:14px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      View only — waiting for host to grant access`;
  }
}

/* ── Cleanup on room leave ──────────────────────────────────── */
function destroyRoomWhiteboard() {
  _rwbStopPoll();
  if (_rwbInstance) { _rwbInstance.destroy(); _rwbInstance = null; }
  _rwbLastData = null;
}
