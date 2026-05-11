/* ── Suppress Supabase-client "Unable to load image" noise ──────────────
   Supabase JS v2's Realtime client internally creates Image() objects to
   resolve/diff row-level payloads. When a DB column contains SVG markup or
   any non-URL text, this triggers unhandled promise rejections in the
   browser console. The errors are cosmetic — they do NOT affect app logic.
   We swallow them here so they don't clutter DevTools output.
──────────────────────────────────────────────────────────────────────── */
window.addEventListener('unhandledrejection', function (e) {
  const msg = e?.reason?.message || String(e?.reason || '');
  if (msg.startsWith('Unable to load image')) e.preventDefault();
});

const STORAGE_JOINED       = 'sb_joined';      
const STORAGE_NIGHT        = 'sb-night';

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
    account_type:  a.accountType  || a.account_type  || 'student',
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
    avatarColor: (typeof sanitizeAvatarColor === 'function' ? sanitizeAvatarColor(r.avatar_color) : r.avatar_color),
    schedule:    r.schedule,
    style:       r.style,
    isCreator:   r.is_creator,
    creatorBrand:r.creator_brand,
    accountType: r.account_type || 'student',
  };
}

async function findAccountByEmail(email) {
  if (!email) return null;
  const rows = await sbSelect('accounts', { email: email.toLowerCase() });
  return rows.length ? rowToAccount(rows[0]) : null;
}

async function loadPosts() {
  const rows = await sbSelect('posts');
  return rows.map(rowToPost);
}

async function savePosts(arr) {
  
  if (!arr || !arr.length) return;
  const rows = arr.map(postToRow);
  const { error } = await sb.from('posts').upsert(rows, { onConflict: 'id' });
  if (error) console.error('savePosts:', error.message);
}

async function savePost(p) {
  
  await sbUpsert('posts', postToRow(p), 'id');
}

async function deletePost(postId) {
  if (!currentUser) return;

  
  const posts = await loadPosts();
  const post  = posts.find(p => p.id === postId);
  if (!post || post.authorEmail !== currentUser.email) return;

  
  const el = document.getElementById('post-' + postId);
  if (el) {
    el.style.transition = 'opacity .18s ease, transform .18s ease';
    el.style.opacity    = '0';
    el.style.transform  = 'scale(.97)';
    setTimeout(() => el.remove(), 180);
  }

  
  await sbDelete('posts', 'id', postId);
  invalidateFeedCache();
  showToast('Post deleted.');
}

function postToRow(p) {
  
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
    gather_buddies:  p.gatherBuddies || false,
    group_chat_id:   p.groupChatId  || null,
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
  
  const gatherBuddies = r.gather_buddies || rawTags.includes('__gather_buddies__');
  
  const gcTag      = rawTags.find(t => t.startsWith('__gc_') && t.endsWith('__'));
  const groupChatId = r.group_chat_id || (gcTag ? gcTag.slice(5, -2) : null);
  
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
    images:         media,   
    files:          r.files || [],
    accessList:     r.access_list || [],
    accessRequests: r.access_requests || [],
    gatherBuddies,
    groupChatId,
    ts:             new Date(r.created_at).getTime(),
    timestamp:      new Date(r.created_at).getTime(), 
  };
}

async function loadComments() {
  const rows = await sbSelect('comments');
  
  const obj = {};
  for (const r of rows) {
    if (!obj[r.post_id]) obj[r.post_id] = [];
    obj[r.post_id].push({ id: r.id, userEmail: r.user_email, text: r.text, ts: new Date(r.created_at).getTime() });
  }
  return obj;
}

async function saveComments(obj) {
  
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

async function loadSaved() {
  if (!currentUser) return {};
  const rows = await sbSelect('saved_posts', { user_email: currentUser.email });
  const obj = {};
  for (const r of rows) obj[r.post_id] = true;
  return obj;
}

async function saveSaved(obj) {
  
  if (!currentUser) return;
  
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

async function loadJoinRequests() {
  if (!currentUser) return [];
  
  const { data: asRequester } = await sb.from('join_requests')
    .select('*').eq('requester_email', currentUser.email);
  const { data: asHost } = await sb.from('join_requests')
    .select('*').eq('host_email', currentUser.email);
  const rows = [...(asRequester || []), ...(asHost || [])];
  
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
    lock_pin:     s.lockPin  || null,
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
    lockPin:      r.lock_pin   || null,
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

async function loadMatches() {
  if (!currentUser) return [];
  
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

async function loadCreatorApps() {
  const rows = await sbSelect('creator_apps');
  return rows.map(r => ({
    email:        r.email,
    brand:        r.brand        || '',
    bio:          r.bio          || '',
    subject:      r.subject      || '',
    contentTypes: r.content_types || [],
    price:        r.price        || 0,
    status:       r.status       || 'pending',
    appliedAt:    r.applied_at   ? new Date(r.applied_at).getTime() : Date.now(),
    approvedAt:   r.approved_at  ? new Date(r.approved_at).getTime() : null,
  }));
}

async function saveCreatorApps(arr) {
  for (const a of arr) {
    await sbUpsert('creator_apps', {
      email:         a.email,
      brand:         a.brand        || '',
      bio:           a.bio          || '',
      subject:       a.subject      || '',
      content_types: a.contentTypes || a.types || [],
      price:         a.price        || 0,
      status:        a.status       || 'pending',
      applied_at:    a.appliedAt    ? new Date(a.appliedAt).toISOString() : new Date().toISOString(),
      approved_at:   a.approvedAt   ? new Date(a.approvedAt).toISOString() : null,
    }, 'email');
  }
}

async function loadProducts() {
  const rows = await sbSelect('products');
  return rows.map(r => ({
    id:             r.id,
    creatorEmail:   r.creator_email,
    title:         r.title,
    description:   r.description,
    type:          r.type,
    price:         r.price,
    subject:       r.subject,
    content:       r.content,
    purchases:     r.purchases   || [],
    accessList:    r.access_list || [],
    salesCount:    r.sales_count || 0,
    attachedFiles: r.attached_files || [],
    profileVisible: r.profile_visible || false,
    feedVisible:    r.feed_visible    || false,
    createdAt:     new Date(r.created_at).getTime(),
    updatedAt:     new Date(r.updated_at).getTime(),
  }));
}

async function saveProducts(arr) {
  for (const p of arr) {
    await sbUpsert('products', {
      id:              p.id,
      creator_email:   p.creatorEmail,
      title:           p.title || '',
      description:     p.description || '',
      type:            p.type || 'notes',
      price:           p.price || 0,
      subject:         p.subject || '',
      content:         p.content || '',
      purchases:       p.purchases      || [],
      access_list:     p.accessList     || [],
      sales_count:     p.salesCount     || 0,
      attached_files:  p.attachedFiles  || [],
      profile_visible: p.profileVisible || false,
      feed_visible:    p.feedVisible    || false,
      updated_at:      new Date().toISOString(),
    }, 'id');
  }
}

async function loadSubscriptionTiers() {
  const rows = await sbSelect('subscription_tiers');
  return rows.map(r => ({
    id:           r.id,
    creatorEmail: r.creator_email,
    name:         r.name         || '',
    description:  r.description  || '',
    
    
    
    perks: (() => {
      let raw = r.perks;
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[')) {
          try { raw = JSON.parse(trimmed); } catch (_) {  }
        }
      }
      if (Array.isArray(raw)) return raw.filter(Boolean).join(', ');
      return typeof raw === 'string' ? raw : '';
    })(),
    price:        Number(r.price) || 0,
    createdAt:    r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  }));
}

async function getCreatorSubscription(creatorEmail) {
  const all = await loadSubscriptionTiers();
  const mine = all
    .filter(t => t.creatorEmail === creatorEmail)
    .sort((a, b) => a.createdAt - b.createdAt);
  return mine[0] || null;
}

async function saveCreatorSubscription(sub) {
  
  const all  = await loadSubscriptionTiers();
  const mine = all.filter(t => t.creatorEmail === sub.creatorEmail);

  
  for (const stale of mine) {
    if (stale.id !== sub.id) {
      const { error } = await sb.from('subscription_tiers').delete().eq('id', stale.id);
      if (error) console.error('saveCreatorSubscription: delete stale', error.message);
    }
  }

  
  let perksArr = [];
  if (Array.isArray(sub.perks)) {
    perksArr = sub.perks.filter(Boolean);
  } else if (typeof sub.perks === 'string' && sub.perks.trim()) {
    perksArr = sub.perks.split(',').map(p => p.trim()).filter(Boolean);
  }

  const { error } = await sb.from('subscription_tiers').upsert({
    id:            sub.id,
    creator_email: sub.creatorEmail,
    name:          sub.name         || '',
    description:   sub.description  || '',
    perks:         perksArr,          
    price:         Number(sub.price) || 0,
    created_at:    sub.createdAt
                     ? new Date(sub.createdAt).toISOString()
                     : new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) console.error('saveCreatorSubscription: upsert', error.message);
}

async function saveSubscriptionTiers(arr) {
  for (const t of arr) await saveCreatorSubscription(t);
}

async function deleteCreatorTiers(creatorEmail) {
  const { error } = await sb.from('subscription_tiers').delete().eq('creator_email', creatorEmail);
  if (error) console.error('deleteCreatorTiers:', error.message);
}

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
    
    
    
    
    const { error } = await sb.from('user_subscriptions').upsert({
      id:            s.id,
      user_email:    s.userEmail,
      creator_email: s.creatorEmail,
      tier_id:       s.tierId || null,
      price:         Number(s.price) || 0,
      since:         s.since ? new Date(s.since).toISOString() : new Date().toISOString(),
    }, { onConflict: 'user_email,creator_email' });
    if (error) console.error('saveUserSubs:', error.message);
  }
}

async function loadQuizzes() {
  const rows = await sbSelect('quizzes');
  return rows.map(r => ({
    id:             r.id,
    creatorEmail:   r.creator_email,
    title:          r.title,
    subject:        r.subject,
    access:         r.access,
    price:          r.price || 0,
    questions:      r.questions || [],
    attempts:       r.attempts || 0,
    folderId:       r.folder_id       || null,
    profileVisible: r.profile_visible || false,
    feedVisible:    r.feed_visible    || false,
    createdAt:      new Date(r.created_at).getTime(),
    updatedAt:      new Date(r.updated_at).getTime(),
  }));
}

async function saveQuizzes(arr) {
  for (const q of arr) {
    await sbUpsert('quizzes', {
      id:              q.id,
      creator_email:   q.creatorEmail,
      title:           q.title || '',
      subject:         q.subject || '',
      access:          q.access || 'free',
      price:           q.price || 0,
      questions:       q.questions || [],
      attempts:        q.attempts || 0,
      folder_id:       q.folderId       || null,
      profile_visible: q.profileVisible || false,
      feed_visible:    q.feedVisible    || false,
      updated_at:      new Date().toISOString(),
    }, 'id');
  }
}

/* ══════════════════════════════════════════════════════════════
   AD POOL — targeted product + quiz fetching for the ad carousel
   ══════════════════════════════════════════════════════════════

   loadAdPool()
     Fetches all approved creator products and quizzes that have a
     subject tag, then applies two-tier subject targeting:
       Tier 1 — exact match: item.subject === one of user's subjects
       Tier 2 — category match: item's subject is in same category
                as any of the user's subjects
     Returns a shuffled array of ad item objects.
     Results are cached for the session; call invalidateAdPool()
     to force a fresh fetch (e.g. after the user updates subjects).

   startAdRotation(webEl, mobileEl)
     Starts the 30-second carousel. Pauses when the page is hidden
     (Page Visibility API) and resets when the user navigates back
     to the feed via appNav(). Call once on feed load.
   ══════════════════════════════════════════════════════════════ */

let _adPool          = null;   // session cache
let _adPoolLoading   = false;
let _adRotationTimer = null;
let _adSlideIndex    = 0;

function invalidateAdPool() {
  _adPool = null;
}

async function loadAdPool() {
  if (_adPool) return _adPool;
  if (_adPoolLoading) {
    // Prevent parallel fetches — wait briefly then return whatever is ready
    await new Promise(r => setTimeout(r, 600));
    return _adPool || [];
  }
  _adPoolLoading = true;

  try {
    // ── Fetch all approved creator emails ──
    const { data: approvedApps } = await sb
      .from('creator_apps')
      .select('email')
      .eq('status', 'approved');
    const approvedEmails = new Set((approvedApps || []).map(a => a.email));

    if (!approvedEmails.size) { _adPool = []; return []; }

    // ── Fetch products with a subject, from approved creators ──
    const { data: productRows } = await sb
      .from('products')
      .select('id,creator_email,title,description,type,price,subject,profile_visible,feed_visible')
      .neq('subject', '')
      .not('subject', 'is', null);

    // ── Fetch quizzes with a subject, from approved creators ──
    const { data: quizRows } = await sb
      .from('quizzes')
      .select('id,creator_email,title,subject,access,price,profile_visible,feed_visible')
      .neq('subject', '')
      .not('subject', 'is', null);

    // ── Fetch creator account info for display (name, avatar) ──
    const creatorEmailList = [...approvedEmails];
    const { data: creatorAccounts } = await sb
      .from('accounts')
      .select('email,name,initials,avatar_color')
      .in('email', creatorEmailList);
    const creatorMap = {};
    (creatorAccounts || []).forEach(a => { creatorMap[a.email] = a; });

    // ── Build combined pool ──
    const products = (productRows || [])
      .filter(p => approvedEmails.has(p.creator_email))
      .map(p => {
        const acc = creatorMap[p.creator_email] || {};
        return {
          kind:          'product',
          id:            p.id,
          creatorEmail:  p.creator_email,
          creatorName:   acc.name || p.creator_email.split('@')[0],
          creatorInitials: acc.initials || (acc.name || 'C').slice(0,2).toUpperCase(),
          creatorAvatar: acc.avatar_color || '',
          title:         p.title || 'Untitled',
          description:   p.description || '',
          type:          p.type || 'notes',
          price:         p.price || 0,
          subject:       p.subject,
        };
      });

    const quizzes = (quizRows || [])
      .filter(q => approvedEmails.has(q.creator_email))
      .map(q => {
        const acc = creatorMap[q.creator_email] || {};
        return {
          kind:          'quiz',
          id:            q.id,
          creatorEmail:  q.creator_email,
          creatorName:   acc.name || q.creator_email.split('@')[0],
          creatorInitials: acc.initials || (acc.name || 'C').slice(0,2).toUpperCase(),
          creatorAvatar: acc.avatar_color || '',
          title:         q.title || 'Untitled Quiz',
          description:   '',
          type:          'quiz',
          price:         q.price || 0,
          subject:       q.subject,
          access:        q.access || 'free',
        };
      });

    let allItems = [...products, ...quizzes];

    // ── Two-tier subject targeting ──
    const userSubjects   = (currentUser && Array.isArray(currentUser.subjects)) ? currentUser.subjects : [];
    const userCategories = (typeof getSubjectCategories === 'function')
      ? getSubjectCategories(userSubjects) : [];
    const catMap         = (typeof SUBJECT_CATEGORY_MAP !== 'undefined') ? SUBJECT_CATEGORY_MAP : {};

    if (userSubjects.length) {
      const tier1 = allItems.filter(item => userSubjects.includes(item.subject));
      const tier2 = allItems.filter(item =>
        !userSubjects.includes(item.subject) &&
        userCategories.includes(catMap[item.subject])
      );
      const rest  = allItems.filter(item =>
        !userSubjects.includes(item.subject) &&
        !userCategories.includes(catMap[item.subject])
      );
      // Shuffle each tier separately, then concatenate — targeted items come first
      allItems = [
        ..._adShuffle(tier1),
        ..._adShuffle(tier2),
        ..._adShuffle(rest),
      ];
    } else {
      allItems = _adShuffle(allItems);
    }

    _adPool = allItems;
    return _adPool;
  } catch(e) {
    console.error('loadAdPool:', e);
    _adPool = [];
    return [];
  } finally {
    _adPoolLoading = false;
  }
}

function _adShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── Render one ad item into a container element ── */
/* ── Render one ad item into a container element ──
   isMobile: true → compact horizontal layout for drawer
             false → full vertical layout for web sidebar  */
function _renderAdCard(item, container, isMobile = false) {
  if (!container) return;

  if (!item) {
    container.innerHTML = `
      <span class="feed-ad-label">Sponsored</span>
      <div class="feed-ad-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
             stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>
        </svg>
        <span>No ads yet — check back soon</span>
      </div>`;
    return;
  }

  const typeIcons  = { notes:'📄', guide:'📘', cheatsheet:'⚡', flashcards:'🗂️', template:'📋', quiz:'🧠' };
  const icon       = item.kind === 'quiz' ? '🧠' : (typeIcons[item.type] || '📦');
  const isFree     = !item.price || item.price === 0;
  const isQuiz     = item.kind === 'quiz';
  const isSubOnly  = isQuiz && (item.access === 'subscription' || item.access === 'paid');
  const isPriced   = isQuiz && item.access === 'priced';

  // Price badge
  const priceBadge = isFree
    ? `<span class="cp-price-badge cp-price-free">Free</span>`
    : `<span class="cp-price-badge cp-price-paid">₱${Number(item.price).toLocaleString()}</span>`;

  // CTA label
  let ctaLabel;
  if (isQuiz) {
    if (isFree)        ctaLabel = 'Take Quiz';
    else if (isSubOnly) ctaLabel = '🔒 Subscribe';
    else                ctaLabel = `Unlock · ₱${Number(item.price).toLocaleString()}`;
  } else {
    ctaLabel = isFree ? 'Get Free' : `Buy · ₱${Number(item.price).toLocaleString()}`;
  }

  // Creator avatar — reuse shared.js helper if available
  const creatorUser = {
    name:        item.creatorName || '',
    initials:    item.creatorInitials || '?',
    avatarColor: item.creatorAvatar || '',
  };
  const avatarBg   = (typeof avatarColor === 'function') ? avatarColor(creatorUser) : (item.creatorAvatar || 'linear-gradient(135deg,#071d2e,#0d2b42)');
  const initials   = escHtml(item.creatorInitials || '?');
  const creatorHandle = '@' + (item.creatorName || '').toLowerCase().replace(/\s+/g, '');

  // Safe onclick strings
  const safeEmail  = escHtml(item.creatorEmail);
  const safeId     = escHtml(item.id);
  const safeTitle  = escHtml(item.title).replace(/'/g, "\'");
  const safePrice  = Number(item.price) || 0;

  // CTA onclick — wires to existing profile.js functions
  let ctaOnclick;
  if (isQuiz) {
    ctaOnclick = `event.stopPropagation();openPublicQuiz('${safeId}','${safeEmail}')`;
  } else {
    ctaOnclick = `event.stopPropagation();purchaseProduct('${safeId}','${safeTitle}',${safePrice},this)`;
  }

  if (isMobile) {
    // ── Mobile drawer: horizontal compact layout ──
    container.innerHTML = `
      <span class="sidebar-ad-label">Sponsored</span>
      <div class="ad-card ad-card-mobile" onclick="_adCardClick('${safeEmail}')">
        <div class="ad-card-mobile-top">
          <div class="ad-card-avatar" style="background:${avatarBg}">${initials}</div>
          <div class="ad-card-mobile-info">
            <span class="ad-card-creator-name">${escHtml(item.creatorName || '')}</span>
            <span class="ad-card-creator-handle">${escHtml(creatorHandle)}</span>
          </div>
          ${priceBadge}
        </div>
        <div class="ad-card-mobile-body">
          <span class="ad-card-icon-sm">${icon}</span>
          <div class="ad-card-mobile-text">
            <div class="ad-card-title">${escHtml(item.title)}</div>
            ${item.subject ? `<span class="ad-card-subject">${escHtml(item.subject)}</span>` : ''}
          </div>
        </div>
        <button class="ad-card-cta" onclick="${ctaOnclick}">${ctaLabel}</button>
      </div>`;
  } else {
    // ── Web sidebar: Proposal C — cover title + outlined CTA ──
    container.innerHTML = `
      <div class="ad-card" onclick="_adCardClick('${safeEmail}')">
        <div class="ad-card-cover">
          <div class="ad-card-cover-top">
            <span class="feed-ad-label">Sponsored</span>
            ${priceBadge}
          </div>
          <div class="ad-card-cover-body">
            <span class="ad-card-icon">${icon}</span>
            <div class="ad-card-title">${escHtml(item.title)}</div>
          </div>
        </div>
        <div class="ad-card-body">
          <div class="ad-card-creator" onclick="event.stopPropagation();_adCardClick('${safeEmail}')">
            <div class="ad-card-avatar" style="background:${avatarBg}">${initials}</div>
            <div class="ad-card-creator-info">
              <span class="ad-card-creator-name">${escHtml(item.creatorName || '')}</span>
              <span class="ad-card-creator-handle">${escHtml(creatorHandle)} · Creator</span>
            </div>
          </div>
          <div class="ad-card-divider"></div>
          ${item.subject ? `<span class="ad-card-subject">${escHtml(item.subject)}</span>` : ''}
          <button class="ad-card-cta ad-card-cta-outline" onclick="${ctaOnclick}">${ctaLabel}</button>
        </div>
      </div>`;
  }
}

/* Navigate to creator profile when ad card body is clicked */
function _adCardClick(creatorEmail) {
  if (!creatorEmail) return;
  if (typeof openUserProfile === 'function') openUserProfile(creatorEmail);
}

/* ── Start / stop the rotation timer ── */
function startAdRotation() {
  stopAdRotation();
  _adSlideIndex = 0;

  async function showNextAd() {
    const pool = await loadAdPool();
    if (!pool.length) return;

    // Pick two different random items for the two web slots
    const idx1 = Math.floor(Math.random() * pool.length);
    const item1 = pool[idx1];
    const item2 = pool.length > 1
      ? pool[(idx1 + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length]
      : item1;

    // Web sidebar — first ad
    const webEl = document.getElementById('feed-ad-section');
    if (webEl) _renderAdCard(item1, webEl, false);

    // Web sidebar — second ad
    const webEl2 = document.getElementById('feed-ad-section-2');
    if (webEl2) _renderAdCard(item2, webEl2, false);

    // Mobile drawer ad — queried fresh each tick (injected on drawer open)
    const mobileEl = document.querySelector('.sidebar-ad-section');
    if (mobileEl) _renderAdCard(item1, mobileEl, true);
  }

  showNextAd();
  _adRotationTimer = setInterval(showNextAd, 30000);

  document.addEventListener('visibilitychange', _adVisibilityHandler);
}


function stopAdRotation() {
  if (_adRotationTimer) { clearInterval(_adRotationTimer); _adRotationTimer = null; }
  document.removeEventListener('visibilitychange', _adVisibilityHandler);
}

function _adVisibilityHandler() {
  if (document.hidden) {
    if (_adRotationTimer) { clearInterval(_adRotationTimer); _adRotationTimer = null; }
  } else {
    if (!_adRotationTimer) {
      _adRotationTimer = setInterval(async () => {
        const pool = await loadAdPool();
        if (!pool.length) return;
        const item = pool[Math.floor(Math.random() * pool.length)];
        const idx1 = Math.floor(Math.random() * pool.length);
        const item1 = pool[idx1];
        const item2 = pool.length > 1
          ? pool[(idx1 + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length]
          : item1;
        const webEl    = document.getElementById('feed-ad-section');
        const webEl2   = document.getElementById('feed-ad-section-2');
        const mobileEl = document.querySelector('.sidebar-ad-section');
        if (webEl)    _renderAdCard(item1, webEl, false);
        if (webEl2)   _renderAdCard(item2, webEl2, false);
        if (mobileEl) _renderAdCard(item1, mobileEl, true);
      }, 30000);
    }
  }
}

let currentUser      = null;
let nightMode        = false;
let aboutOpen        = false;
let _matchChannel    = null;   
let activeAppSection = 'feed';
let activeMatchTab   = 'received';
let searchHighlight  = -1;

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

const APP_SECTIONS = ['feed','findbuddies','mymatches','messages','notepad','backpack','sessions','creator','profile','viewprofile'];

async function appNav(target) {
  
  if (typeof _isMobile === 'function' && _isMobile() && drawerOpen) closeMobileDrawer();

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
  if (target === 'mymatches')   {
    await renderMatches();
  }
  if (target === 'feed')        { invalidateFeedCache(); await cacheCreators(); await renderFeed(); startAdRotation(); }
  if (target === 'messages')    await initMessagesPage();
  if (target === 'notepad')     await initNotepadPage();
  if (target === 'backpack') {
    await initBackpackPage();
  }
  if (target === 'sessions')    await initSessionsPage();
  if (target === 'creator')     await initCreatorPage();
  if (target === 'profile')     { if (typeof renderMyProfile === 'function') renderMyProfile(currentUser); }
  if (target === 'viewprofile') {  }
}

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

  // ── Account type + creator fields ──
  const accountType = (document.querySelector('input[name="reg-account-type"]:checked')?.value) || 'student';
  const isCreator   = accountType === 'creator';
  const brand       = isCreator ? (document.getElementById('reg-brand')?.value  || '').trim() : '';
  const subject     = isCreator ? (document.getElementById('reg-subject')?.value || '')        : '';
  const price       = isCreator ? (parseFloat(document.getElementById('reg-price')?.value) || 0) : 0;

  const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };

  if (!name)                          { showErr('Please enter your full name.');                             return; }
  if (!email)                         { showErr('Please enter your email address.');                        return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr('Please enter a valid email address.');         return; }
  if (password.length < 6)            { showErr('Password must be at least 6 characters.');                 return; }
  if (password !== confirm)           { showErr('Passwords do not match. Please check and try again.');     return; }
  if (isCreator && !brand)            { showErr('Please enter your creator / brand name.');                 return; }

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

  const newAccount = {
    email,
    password,
    name,
    initials,
    headline:     isCreator ? (brand + ' · Creator') : 'Student · Study Buddy',
    location:     '📍 Philippines',
    bio:          `Hi, I'm ${words[0]}! I just joined Study Buddy and I'm excited to find great study partners.`,
    subjects:     [],
    avatarColor:  AVATAR_COLORS[colorIndex],
    schedule:     '',
    style:        '',
    accountType,        // 'student' | 'creator'
    isCreator,
    creatorBrand: brand,
  };

  all.push(JSON.parse(JSON.stringify(newAccount)));
  await saveAccounts(all);

  // ── If creator: save creator_apps row + auto-bootstrap subscription tier ──
  if (isCreator) {
    try {
      const apps = await loadCreatorApps();
      apps.push({
        email,
        brand,
        bio:          '',
        subject,
        contentTypes: [],
        price,
        status:       'approved',
        appliedAt:    Date.now(),
        approvedAt:   Date.now(),
      });
      await saveCreatorApps(apps);

      if (price > 0) {
        await saveCreatorSubscription({
          id:           'tier_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          creatorEmail: email,
          name:         brand,
          description:  '',
          perks:        '',
          price,
          createdAt:    Date.now(),
        });
      }
    } catch (e) {
      console.error('handleRegister: creator setup error', e);
    }
  }

  [nameEl, emailEl, passEl, confEl].forEach(el => { if (el) el.value = ''; });
  hidePwStrength();
  setRegAccountType('student'); // reset picker for next use

  if (okEl) { okEl.innerHTML = '✓ Account created! Taking you to your feed…'; okEl.style.display = 'block'; }
  setTimeout(async () => { await loginWith(newAccount); }, 1200);
}

/* ── Account type picker toggle (register page) ── */
function setRegAccountType(type) {
  const studentCard   = document.getElementById('reg-type-student');
  const creatorCard   = document.getElementById('reg-type-creator');
  const creatorFields = document.getElementById('reg-creator-fields');
  const checkStudent  = document.getElementById('reg-check-student');
  const checkCreator  = document.getElementById('reg-check-creator');
  const radioStudent  = document.querySelector('input[name="reg-account-type"][value="student"]');
  const radioCreator  = document.querySelector('input[name="reg-account-type"][value="creator"]');

  if (!studentCard || !creatorCard) return;

  const isCreator = type === 'creator';

  studentCard.classList.toggle('reg-type-active', !isCreator);
  creatorCard.classList.toggle('reg-type-active',  isCreator);
  if (checkStudent) checkStudent.style.display = isCreator ? 'none' : '';
  if (checkCreator) checkCreator.style.display = isCreator ? ''     : 'none';
  if (radioStudent) radioStudent.checked = !isCreator;
  if (radioCreator) radioCreator.checked =  isCreator;

  if (creatorFields) {
    if (isCreator) {
      creatorFields.style.display  = '';
      creatorFields.style.opacity  = '0';
      creatorFields.style.maxHeight = '0';
      requestAnimationFrame(() => {
        creatorFields.style.transition  = 'max-height .28s ease, opacity .25s ease';
        creatorFields.style.maxHeight   = '300px';
        creatorFields.style.opacity     = '1';
      });
    } else {
      creatorFields.style.maxHeight = '0';
      creatorFields.style.opacity   = '0';
      setTimeout(() => { creatorFields.style.display = 'none'; }, 280);
    }
  }
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
  const fresh = await findAccountByEmail(account.email) || account;
  currentUser = JSON.parse(JSON.stringify(fresh));

  // ── Migration: backfill account_type for pre-existing users ──
  if (!currentUser.accountType || currentUser.accountType === 'student' && currentUser.isCreator) {
    const wasCreator = currentUser.isCreator || await (async () => {
      try {
        const apps = await loadCreatorApps();
        return apps.some(a => a.email === currentUser.email && a.status === 'approved');
      } catch (_) { return false; }
    })();
    const resolved = wasCreator ? 'creator' : 'student';
    if (resolved !== currentUser.accountType) {
      currentUser.accountType = resolved;
      try { await saveAccounts([currentUser]); } catch (_) {}
    }
  }

  PUBLIC_PAGES.forEach(p => {
    const el = document.getElementById('page-' + p);
    if (el) el.classList.remove('active');
  });

  const appEl = document.getElementById('page-app');
  if (!appEl) { console.error('page-app not found'); return; }
  appEl.classList.add('active');

  // ── Show/hide Creator Hub nav based on account type ──
  const creatorNavEl = document.getElementById('snav-creator');
  if (creatorNavEl) {
    creatorNavEl.style.display = currentUser.accountType === 'creator' ? '' : 'none';
  }

  await applyCurrentUserToChrome();
  await cacheCreators();

  if (typeof subscribeToMessages === 'function') subscribeToMessages();

  _subscribeToMatchRequests();
  await appNav('feed');
}

function handleLogout() {
  _unsubscribeMatchRequests();
  currentUser     = null;

  ['login-email','login-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const appEl = document.getElementById('page-app');
  if (appEl) appEl.classList.remove('active');
  navigate('home');
}

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

async function applyCurrentUserToChrome() {
  const u = currentUser;
  if (!u) return;
  const init = getInitials(u);

  setText('app-username-chip', u.name ? u.name.split(' ')[0] : '');
  setText('app-avatar-chip',   init);
  setText('sidebar-avatar',    init);
  setText('sidebar-name',      u.name || '');
  setText('composer-avatar',   init);

  
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

  
  
  const matches = await loadMatches();
  const pendingReceived = matches.filter(
    m => m.to === currentUser.email && m.status === 'pending'
  ).length;
  const matchesBadge = document.getElementById('matches-sidebar-badge');
  if (matchesBadge) {
    const onMatchesPage = activeAppSection === 'mymatches';
    if (pendingReceived > 0 && !onMatchesPage) {
      matchesBadge.textContent = pendingReceived > 99 ? '99+' : String(pendingReceived);
      matchesBadge.style.display = '';
    } else {
      matchesBadge.textContent = '';
      matchesBadge.style.display = 'none';
    }
  }

  
  
  if (typeof getUnreadCount !== 'function') return;

  try {
    
    let totalUnread = await getUnreadCount();

    
    const { data: groups } = await sb
      .from('group_chats')
      .select('id, members');
    const myGroups = (groups || []).filter(g =>
      Array.isArray(g.members) && g.members.includes(currentUser.email)
    );

    if (myGroups.length) {
      
      const { data: reads } = await sb
        .from('group_reads')
        .select('group_chat_id, last_read_at')
        .eq('user_email', currentUser.email);
      const readMap = {};
      (reads || []).forEach(r => { readMap[r.group_chat_id] = r.last_read_at; });

      
      await Promise.all(myGroups.map(async gc => {
        const lastRead = readMap[gc.id]
          ? new Date(readMap[gc.id]).toISOString()
          : new Date(0).toISOString();
        const { count } = await sb
          .from('group_messages')
          .select('id', { count: 'exact', head: true })
          .eq('group_chat_id', gc.id)
          .gt('created_at', lastRead)
          .neq('from_email', currentUser.email);
        totalUnread += count || 0;
      }));
    }

    const msgBadge = document.getElementById('msg-sidebar-badge');
    if (msgBadge) {
      if (totalUnread > 0) {
        msgBadge.textContent = totalUnread > 99 ? '99+' : String(totalUnread);
        msgBadge.style.display = '';
      } else {
        msgBadge.textContent = '';
        msgBadge.style.display = 'none';
      }
    }
  } catch (err) {
    console.warn('[updateSidebarBadges] message count error:', err);
  }
}

function _subscribeToMatchRequests() {
  _unsubscribeMatchRequests();   
  if (!currentUser) return;

  _matchChannel = sb
    .channel('match-requests-' + currentUser.email + '-' + Date.now())
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'matches',
        filter: `to_email=eq.${currentUser.email}`,
      },
      () => {
        
        updateSidebarBadges();
      }
    )
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'matches',
        filter: `to_email=eq.${currentUser.email}`,
      },
      () => {
        
        updateSidebarBadges();
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Matches] Realtime subscribed for:', currentUser.email);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Matches] Realtime channel error:', status);
      }
    });
}

function _unsubscribeMatchRequests() {
  if (_matchChannel) {
    try { sb.removeChannel(_matchChannel); } catch (_) {}
    _matchChannel = null;
  }
}

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

const STORAGE_SIDEBAR   = 'sb_study_buddy_sidebar_collapsed';
const MOBILE_BREAKPOINT = 640;

let sidebarCollapsed = false;
let drawerOpen       = false;

function _getOrCreateBackdrop() {
  let bd = document.getElementById('mobile-drawer-backdrop');
  if (!bd) {
    bd = document.createElement('div');
    bd.id = 'mobile-drawer-backdrop';
    bd.addEventListener('click', closeMobileDrawer);
    document.body.appendChild(bd);
  }
  return bd;
}

function _ensureDrawerLogout() {
  const aside = document.getElementById('app-sidebar');
  if (!aside || aside.querySelector('.mobile-drawer-logout')) return;

  const btn = document.createElement('button');
  btn.className = 'mobile-drawer-logout';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
    Log Out`;
  btn.addEventListener('click', () => { closeMobileDrawer(); openLogoutModal(); });

  const dividers = aside.querySelectorAll('.sidebar-divider');
  const last = dividers[dividers.length - 1];
  if (last) {
    last.after(btn);
  } else {
    aside.appendChild(btn);
  }
}

function _isMobile() { return window.innerWidth <= MOBILE_BREAKPOINT; }

function toggleSidebar() {
  if (_isMobile()) {
    drawerOpen ? closeMobileDrawer() : openMobileDrawer();
  } else {
    sidebarCollapsed = !sidebarCollapsed;
    _applyDesktopRailState();
    try { localStorage.setItem(STORAGE_SIDEBAR, sidebarCollapsed ? '1' : '0'); } catch (_) {}
  }
}

function openMobileDrawer() {
  const aside = document.getElementById('app-sidebar');
  const btn   = document.getElementById('sidebar-toggle-btn');
  if (!aside) return;
  _ensureDrawerLogout();
  drawerOpen = true;

  // Pin drawer top exactly to the bottom of the app nav — no CSS variable needed
  const appNav = document.querySelector('nav.app-top-nav');
  if (appNav) {
    const navBottom = appNav.getBoundingClientRect().bottom;
    aside.style.setProperty('--drawer-top', navBottom + 'px');
  }

  aside.classList.add('mobile-drawer-open');
  _getOrCreateBackdrop().classList.add('open');
  document.body.style.overflow = 'hidden';
  if (btn) btn.setAttribute('aria-expanded', 'true');

  // Immediately render the current ad into the mobile drawer slot
  loadAdPool().then(pool => {
    if (!pool.length) return;
    const idx      = Math.max(0, (_adSlideIndex - 1)) % pool.length;
    const mobileEl = document.querySelector('.sidebar-ad-section');
    if (mobileEl) _renderAdCard(pool[idx], mobileEl, true);
  }).catch(() => {});
}

function closeMobileDrawer() {
  const aside = document.getElementById('app-sidebar');
  const btn   = document.getElementById('sidebar-toggle-btn');
  if (!aside) return;
  drawerOpen = false;
  aside.classList.remove('mobile-drawer-open');
  _getOrCreateBackdrop().classList.remove('open');
  document.body.style.overflow = '';
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function _applyDesktopRailState() {
  const aside = document.getElementById('app-sidebar');
  const btn   = document.getElementById('sidebar-toggle-btn');
  if (!aside) return;
  aside.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  if (btn) btn.setAttribute('aria-expanded', String(!sidebarCollapsed));
}

function _removeDrawerLogout() {
  const aside = document.getElementById('app-sidebar');
  if (!aside) return;
  aside.querySelectorAll('.mobile-drawer-logout').forEach(el => el.remove());
  aside.querySelectorAll('.sidebar-ad-section').forEach(el => el.remove());
}

function _applySidebarState() {
  if (_isMobile()) {
    const aside = document.getElementById('app-sidebar');
    if (aside) aside.classList.remove('sidebar-collapsed');
    closeMobileDrawer();
  } else {
    
    _removeDrawerLogout();
    const aside = document.getElementById('app-sidebar');
    if (aside) aside.classList.remove('mobile-drawer-open');
    _getOrCreateBackdrop().classList.remove('open');
    document.body.style.overflow = '';
    _applyDesktopRailState();
  }
}

function _initSidebarState() {
  try {
    const stored = localStorage.getItem(STORAGE_SIDEBAR);
    sidebarCollapsed = stored === '1';
  } catch (_) { sidebarCollapsed = false; }

  
  if (window.innerWidth <= 768 && window.innerWidth > MOBILE_BREAKPOINT) {
    sidebarCollapsed = true;
  }

  _applySidebarState();

  
  window.addEventListener('resize', () => {
    if (_isMobile()) {
      const aside = document.getElementById('app-sidebar');
      if (aside) aside.classList.remove('sidebar-collapsed');
    } else {
      if (drawerOpen) closeMobileDrawer();
      _removeDrawerLogout();
      _applyDesktopRailState();
    }
  });

  
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawerOpen) closeMobileDrawer();
  });
}

function toggleNightMode() {
  nightMode = !nightMode;
  document.body.classList.add('night-transitioning');
  document.body.classList.toggle('night', nightMode);
  const moon = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  const sun  = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  document.querySelectorAll('.night-icon-svg').forEach(svg => { svg.innerHTML = nightMode ? sun : moon; });
  try { localStorage.setItem(STORAGE_NIGHT, nightMode ? '1' : '0'); } catch (_) {}
  setTimeout(() => document.body.classList.remove('night-transitioning'), 350);
}

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
      <div class="sr-avatar" style="background:${avatarColor(a)}">${escHtml(init)}</div>
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

let composerImages = [];   
let composerGatherBuddies = false;  
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

document.addEventListener('DOMContentLoaded', () => {
  _initSidebarState();
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

function renderComposerPreviews() {
  const wrap = document.getElementById('composer-img-preview');
  if (!wrap) return;
  const total = composerImages.length;
  const gridCls = total === 1 ? 'one' : total === 2 ? 'two' : 'multi';

  const imgHTML = composerImages.map((img, i) => `
    <div class="composer-media-item">
      <img src="${img.dataUrl}" alt="${escHtml(img.name)}" onclick="openLightbox('${img.dataUrl}')">
      <button class="composer-media-remove" onclick="removeComposerImage(${i})">✕</button>
    </div>`).join('');

  const mediaGrid = imgHTML
    ? `<div class="composer-media-grid ${gridCls}">${imgHTML}</div>` : '';

  wrap.innerHTML = mediaGrid;
}

function removeComposerImage(i) { composerImages.splice(i, 1); renderComposerPreviews(); }

let feedFiltersActive  = false;
let _feedCreatorOnly   = false;

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

  _updateFeedMobileFilterState();
  await renderFeed();
}

/* ── Feed: Creator-only toggle ── */
function toggleFeedCreatorFilter() {
  _feedCreatorOnly = !_feedCreatorOnly;
  // Sync both button instances (mobile topbar + desktop sidebar)
  ['feed-creator-toggle', 'feed-creator-toggle-desktop'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('active', _feedCreatorOnly);
    btn.title = _feedCreatorOnly ? 'Show all posts' : 'Show creators only';
    const label = btn.querySelector('svg') ? btn : null;
    if (label) {
      // Update text node (last child after svg — use last text node, not first)
      const lbl = btn.querySelector('.toggle-label');
      if (lbl) lbl.textContent = _feedCreatorOnly ? 'All' : 'Creators';
    }
  });
  renderFeed();
}

async function clearFeedFilters() {
  const ids = ['feed-search-input','feed-filter-subject','feed-filter-schedule','feed-filter-location',
               'feed-filter-subject-sheet','feed-filter-schedule-sheet','feed-filter-location-sheet'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  feedFiltersActive = false;
  // Also reset the creator-only toggle
  _feedCreatorOnly = false;
  ['feed-creator-toggle', 'feed-creator-toggle-desktop'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.classList.remove('active');
      btn.title = 'Show creators only';
      const lbl = btn.querySelector('.toggle-label');
      if (lbl) lbl.textContent = 'Creators';
    }
  });
  const clearBtn = document.getElementById('feed-filter-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  _updateFeedMobileFilterState();
  await renderFeed();
}

function openFeedFilterSheet() {
  const sheet   = document.getElementById('feed-filter-sheet');
  const overlay = document.getElementById('feed-sheet-overlay');
  const btn     = document.getElementById('feed-mobile-filter-btn');
  [['feed-filter-subject','feed-filter-subject-sheet'],
   ['feed-filter-schedule','feed-filter-schedule-sheet'],
   ['feed-filter-location','feed-filter-location-sheet']].forEach(([mainId, sheetId]) => {
    const main = document.getElementById(mainId);
    const sh   = document.getElementById(sheetId);
    if (main && sh) sh.value = main.value;
  });
  if (sheet)   sheet.classList.add('open');
  if (overlay) overlay.classList.add('open');
  if (btn)     btn.classList.add('active');
}

function closeFeedFilterSheet() {
  document.getElementById('feed-filter-sheet')?.classList.remove('open');
  document.getElementById('feed-sheet-overlay')?.classList.remove('open');
  document.getElementById('feed-mobile-filter-btn')?.classList.remove('active');
}

function syncFeedSheetFilter(type) {
  const map = {
    subject:  ['feed-filter-subject-sheet',  'feed-filter-subject'],
    schedule: ['feed-filter-schedule-sheet', 'feed-filter-schedule'],
    location: ['feed-filter-location-sheet', 'feed-filter-location'],
  };
  const [sheetId, mainId] = map[type] || [];
  const sh   = document.getElementById(sheetId);
  const main = document.getElementById(mainId);
  if (sh && main) main.value = sh.value;
}

function applyFeedFilterSheet() {
  [['feed-filter-subject-sheet','feed-filter-subject'],
   ['feed-filter-schedule-sheet','feed-filter-schedule'],
   ['feed-filter-location-sheet','feed-filter-location']].forEach(([sheetId, mainId]) => {
    const sh   = document.getElementById(sheetId);
    const main = document.getElementById(mainId);
    if (sh && main) main.value = sh.value;
  });
  closeFeedFilterSheet();
  applyFeedFilters();
}

function _updateFeedMobileFilterState() {
  const subject  = document.getElementById('feed-filter-subject')?.value  || '';
  const schedule = document.getElementById('feed-filter-schedule')?.value || '';
  const location = document.getElementById('feed-filter-location')?.value || '';
  const btn      = document.getElementById('feed-mobile-filter-btn');
  const pillsEl  = document.getElementById('feed-mobile-pills');
  if (!btn || !pillsEl) return;
  const active = [
    subject  && { key: 'subject',  label: subject },
    schedule && { key: 'schedule', label: schedule },
    location && { key: 'location', label: location },
  ].filter(Boolean);
  btn.classList.toggle('has-filters', active.length > 0);
  if (active.length) {
    pillsEl.classList.add('visible');
    pillsEl.innerHTML = active.map(f => `
      <span class="feed-mobile-pill">
        ${escHtml(f.label)}
        <svg class="feed-mobile-pill-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
             onclick="clearOneFeedFilter('${f.key}')">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </span>`).join('');
  } else {
    pillsEl.classList.remove('visible');
    pillsEl.innerHTML = '';
  }
}

function clearOneFeedFilter(key) {
  const map = { subject: 'feed-filter-subject', schedule: 'feed-filter-schedule', location: 'feed-filter-location' };
  const el = document.getElementById(map[key]);
  if (el) el.value = '';
  applyFeedFilters();
}

const _feedCache = {
  posts:       null,
  accounts:    null,
  saved:       null,
  comments:    null,
  joinReqs:    null,
  sessions:    null,
  matches:     null,
  ts:          0,
  TTL:         30_000,   
};

function invalidateFeedCache(keys = null) {
  if (!keys) {
    
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
  if (_feedCache.posts && (now - _feedCache.ts) < _feedCache.TTL) return; 

  
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

async function renderFeed() {
  const list = document.getElementById('feed-list');
  if (!list) return;

  
  await _loadFeedData();
  const allPosts = _feedCache.posts    || [];
  const accounts = _feedCache.accounts || [];

  
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
      // Creators-only filter: only show posts from creator accounts
      const matchCreator  = !_feedCreatorOnly || (author && (author.accountType === 'creator' || author.isCreator));
      return matchQ && matchSubject && matchSchedule && matchLocation && matchCreator;
    });

  if (!filtered.length) {
    const msg = feedFiltersActive
      ? 'No posts match your filters. <button onclick="clearFeedFilters()" style="background:none;border:none;color:var(--brand-base);cursor:pointer;font-weight:700;text-decoration:underline">Clear filters</button>'
      : 'No posts yet — be the first to share something! 🎓';
    list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-light)">${msg}</div>`;
    return;
  }

  
  const savedArr   = _feedCache.saved    || [];
  const allComments = _feedCache.comments || {};
  const allJoinReqs = _feedCache.joinReqs || [];
  const allSessions = _feedCache.sessions || [];

  const savedSet      = new Set(Object.keys(savedArr).length
    ? Object.keys(savedArr)  
    : []);
  
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

  
  const matchMap = {};
  if (currentUser) {
    (_feedCache.matches || []).forEach(m => {
      if (m.from === currentUser.email) matchMap[m.to]   = m;
      if (m.to   === currentUser.email) matchMap[m.from] = m;
    });
  }

  
  const accountsMap = {};
  accounts.forEach(a => { accountsMap[a.email] = a; accountsMap[a.email.toLowerCase()] = a; });

  
  const creatorCardMap = {};
  const creatorPosts = filtered.filter(p => p.postType && p.linkedItemId);
  if (creatorPosts.length) {
    await Promise.all(creatorPosts.map(async p => {
      try { creatorCardMap[p.id] = await buildCreatorPostCardHTML(p); } catch(_) {}
    }));
  }

  const ctx = { savedSet: savedSetFinal, commentMap, joinReqMap, sessionMap, participantSet, joinReqs: allJoinReqs, matchMap, creatorCardMap, accountsMap };

  
  list.innerHTML = '';
  list.innerHTML = filtered.map(p => buildPostHTML(p, accounts, ctx)).join('');

  if (currentUser) {
    const ca = document.getElementById('composer-avatar');
    if (ca) {
      setText('composer-avatar', getInitials(currentUser));
      ca.style.background = avatarColor(currentUser);
    }
  }

  
  const hash = window.location.hash;
  if (hash && hash.startsWith('#post_')) {
    const target = document.getElementById('post-' + hash.slice(1));
    if (target) {
      setTimeout(() => target.scrollIntoView({ behavior:'smooth', block:'center' }), 200);
      target.style.boxShadow = '0 0 0 3px var(--brand-base)';
      setTimeout(() => { target.style.boxShadow = ''; }, 2500);
    }
  }
}

function buildCommentsHTMLSync(postId, ctx) {
  const coms = (ctx.commentMap || {})[postId] || [];
  if (!coms.length) return '<div class="comments-empty">No comments yet. Be the first! \U0001F4AC</div>';
  const accs = ctx.accountsMap || {};
  return coms.map(function(c) {
    var u     = accs[c.userEmail] || accs[(c.userEmail || '').toLowerCase()];
    var name  = u ? u.name : 'Unknown';
    var init  = u ? getInitials(u) : '?';
    var color = avatarColor(u);
    var email = escHtml(c.userEmail || '');
    var clikes = _getCommentLikes(c.id);
    var cliked  = currentUser && clikes.includes(currentUser.email);
    var cId     = escHtml(c.id);
    var pId     = escHtml(postId);
    var cName   = escHtml(name);
    var cFill   = cliked ? 'currentColor' : 'none';
    var cClass  = 'comment-action-btn' + (cliked ? ' liked' : '');
    var cCount  = clikes.length > 0 ? clikes.length : '';
    return '<div class="comment-item" id="comment-item-' + cId + '">' +
      '<div class="comment-avatar" style="background:' + color + '">' + escHtml(init) + '</div>' +
      '<div class="comment-bubble">' +
        '<div class="comment-author">' + escHtml(name) + '</div>' +
        '<div class="comment-text">' + escHtml(c.text || '') + '</div>' +
        '<div class="comment-actions">' +
          '<button class="' + cClass + '" onclick="toggleCommentLike(\'' + cId + '\',\'' + pId + '\',this)">' +
            '<svg viewBox="0 0 24 24" fill="' + cFill + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
            '<span class="comment-like-count">' + cCount + '</span>' +
          '</button>' +
          '<button class="comment-action-btn comment-reply-btn" data-post-id="' + pId + '" data-author="' + cName.replace(/"/g, '&quot;') + '" onclick="replyToComment(this.dataset.postId,this.dataset.author)">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>' +
            'Reply' +
          '</button>' +
          '<span class="comment-time">' + formatTimeAgo(c.ts) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function buildPostHTML(p, accounts, ctx = {}) {
  if (!p || !p.authorEmail) return '';
  const author = accounts.find(a => a.email.toLowerCase() === p.authorEmail.toLowerCase());
  if (!author) return '';

  const name      = author.name        || 'Unknown User';
  const initials  = getInitials(author);
  const color     = avatarColor(author);
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

  // Videos and file attachments removed from feed
  const videosHTML = '';
  const filesHTML  = '';

  // Connect / Message button (only for other users' posts)
  let socialBtn = '';
  if (!isOwnPost && currentUser) {
    
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

  
  let sessionBar = '';
  if (session && session.participants.length > 1) {
        const displayParts = session.participants.slice(0, 5);
    const extra        = session.participants.length - displayParts.length;
    const avatarChips  = displayParts.map(email => {
      const u     = accounts.find(a => a.email === email);
      const init  = u ? getInitials(u) : '?';
      const color = avatarColor(u);
      return `<div class="sp-av" style="background:${color}" title="${escHtml(u ? u.name : email)}">${escHtml(init)}</div>`;
    }).join('');
    sessionBar = `
    <div class="post-session-bar">
      <div class="session-participant-avatars">${avatarChips}</div>
      <span>${session.participants.length} joined${extra > 0 ? ` (+${extra} more)` : ''}</span>
    </div>`;
  }

  
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
      ${isOwnPost ? `<button class="post-delete-btn" onclick="deletePost('${escHtml(p.id)}')" title="Delete post" aria-label="Delete post">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>` : ''}
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
             style="background:${avatarColor(currentUser)}">
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

  return comments.map(c => {
    const user  = accounts.find(a => a.email === c.userEmail);
    const name  = user ? user.name : 'Unknown';
    const init  = user ? getInitials(user) : '?';
    const color = avatarColor(user);
    const likes = _getCommentLikes(c.id);
    const liked  = currentUser && likes.includes(currentUser.email);
    return `
    <div class="comment-item" id="comment-item-${escHtml(c.id)}">
      <div class="comment-avatar" style="background:${color}">${escHtml(init)}</div>
      <div class="comment-bubble">
        <div class="comment-author">${escHtml(name)}</div>
        <div class="comment-text">${escHtml(c.text)}</div>
        <div class="comment-actions">
          <button class="comment-action-btn${liked ? ' liked' : ''}" onclick="toggleCommentLike('${escHtml(c.id)}','${escHtml(postId)}',this)">
            <svg viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span class="comment-like-count">${likes.length > 0 ? likes.length : ''}</span>
          </button>
          <button class="comment-action-btn comment-reply-btn" data-post-id="${escHtml(postId)}" data-author="${escHtml(name).replace(/"/g,'&quot;')}" onclick="replyToComment(this.dataset.postId,this.dataset.author)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            Reply
          </button>
          <span class="comment-time">${formatTimeAgo(c.ts)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function toggleLike(postId, btn) {
  if (!currentUser) return;

  
  const { data: rows, error } = await sb.from('posts').select('id,likes').eq('id', postId).single();
  if (error || !rows) return;

  const likes = Array.isArray(rows.likes) ? [...rows.likes] : [];
  const alreadyLiked = likes.includes(currentUser.email);
  const newLikes = alreadyLiked
    ? likes.filter(e => e !== currentUser.email)
    : [...likes, currentUser.email];

  
  await sb.from('posts').update({ likes: newLikes }).eq('id', postId);

  
  if (_feedCache.posts) {
    const cached = _feedCache.posts.find(p => p.id === postId);
    if (cached) cached.likes = newLikes;
  }

  const post = { likes: newLikes };

  
  if (btn) {
    const newLiked = !alreadyLiked;
    btn.classList.toggle('liked', newLiked);
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', newLiked ? 'currentColor' : 'none');
    const countEl = btn.querySelector(`[class^="like-count-"]`);
    if (countEl) {
      const n = post.likes.length;
      countEl.textContent = n;
      
      
      const textNodes = Array.from(btn.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim());
      if (textNodes.length) textNodes[textNodes.length - 1].textContent = ` Like${n !== 1 ? 's' : ''}`;
    }
  }
}

async function toggleComments(postId) {
  const section = document.getElementById('comments-' + postId);
  if (!section) return;
  const isOpen = section.style.display !== 'none';
  section.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) {
    
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

  if (input) input.value = '';

  const comment = await addComment(postId, currentUser.email, text);

  const listEl = document.getElementById('comments-list-' + postId);
  if (listEl) {
    const emptyEl = listEl.querySelector('.comments-empty');
    if (emptyEl) emptyEl.remove();
    const user  = currentUser;
    const init  = getInitials(user);
    const color = avatarColor(user);
    const newItem = document.createElement('div');
    newItem.className = 'comment-item';
    newItem.id = 'comment-item-' + comment.id;
    newItem.innerHTML = `
      <div class="comment-avatar" style="background:${color}">${escHtml(init)}</div>
      <div class="comment-bubble">
        <div class="comment-author">${escHtml(user.name || 'You')}</div>
        <div class="comment-text">${escHtml(text)}</div>
        <div class="comment-actions">
          <button class="comment-action-btn" onclick="toggleCommentLike('${comment.id}','${postId}',this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span class="comment-like-count"></span>
          </button>
          <button class="comment-action-btn comment-reply-btn" data-post-id="${postId}" data-author="${escHtml(user.name || 'You').replace(/"/g,'&quot;')}" onclick="replyToComment(this.dataset.postId,this.dataset.author)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            Reply
          </button>
          <span class="comment-time">Just now</span>
        </div>
      </div>`;
    listEl.appendChild(newItem);
  }

  const countEl = document.querySelector(`.comment-count-${postId}`);
  if (countEl) {
    const n = parseInt(countEl.textContent || '0', 10) + 1;
    countEl.textContent = n;
    const btn = countEl.closest('.post-action-btn');
    if (btn) {
      const textNodes = Array.from(btn.childNodes).filter(nd => nd.nodeType === 3 && nd.textContent.trim());
      if (textNodes.length) textNodes[textNodes.length - 1].textContent = ` Comment${n !== 1 ? 's' : ''}`;
    }
  }

  if (_feedCache.comments) {
    if (!_feedCache.comments[postId]) _feedCache.comments[postId] = [];
    _feedCache.comments[postId].push(comment);
  }
}
function _getCommentLikes(commentId) {
  try {
    const raw = localStorage.getItem('sb_clikes_' + commentId);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

function _saveCommentLikes(commentId, likes) {
  try { localStorage.setItem('sb_clikes_' + commentId, JSON.stringify(likes)); } catch (_) {}
}

function toggleCommentLike(commentId, postId, btn) {
  if (!currentUser) return;
  const likes    = _getCommentLikes(commentId);
  const liked    = likes.includes(currentUser.email);
  const newLikes = liked
    ? likes.filter(e => e !== currentUser.email)
    : [...likes, currentUser.email];
  _saveCommentLikes(commentId, newLikes);

  btn.classList.toggle('liked', !liked);
  const svg = btn.querySelector('svg');
  if (svg) svg.setAttribute('fill', !liked ? 'currentColor' : 'none');
  const countEl = btn.querySelector('.comment-like-count');
  if (countEl) countEl.textContent = newLikes.length > 0 ? newLikes.length : '';
}

function replyToComment(postId, authorName) {
  const section = document.getElementById('comments-' + postId);
  if (section && section.style.display === 'none') section.style.display = 'flex';
  const input = document.getElementById('comment-input-' + postId);
  if (input) {
    input.value = '@' + authorName + ' ';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
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
    
    const textNodes = Array.from(btn.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim());
    if (textNodes.length) textNodes[textNodes.length - 1].textContent = ' ' + (nowSaved ? 'Saved' : 'Save');
  }
}

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
    const color = avatarColor(acc);
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

async function acceptJoinRequest(jrId, postId, requesterEmail, btn) {
  if (!currentUser) return;

  
  const card = btn ? btn.closest('.jr-card') : null;
  if (card) {
    card.querySelectorAll('button').forEach(b => b.disabled = true);
    card.style.opacity = '0.6';
  }

  
  await sbUpdate('join_requests', jrId, { status: 'accepted' });
  invalidateFeedCache(['joinReqs']);

  
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
        
        await sbUpdate('group_chats', gc.id, { members });
        console.log('[accept] members updated:', members);
      }
    }
  }

  showToast('Accepted! Buddy added to the group chat.');
  updateSidebarBadges();
  renderFeed();                        
  openJoinRequestsPanel(postId);       
}

async function declineJoinRequest(jrId, postId, btn) {
  if (!currentUser) return;
  const card = btn ? btn.closest('.jr-card') : null;
  if (card) {
    card.querySelectorAll('button').forEach(b => b.disabled = true);
    card.style.opacity = '0.6';
  }
  
  await sbUpdate('join_requests', jrId, { status: 'declined' });
  invalidateFeedCache(['joinReqs']);
  showToast('Request declined.');
  updateSidebarBadges();
  renderFeed();
  openJoinRequestsPanel(postId);
}

async function sendJoinRequest(postId, btn) {
  if (!currentUser) return;

  
  if (!postId || typeof postId !== 'string') {
    console.error('sendJoinRequest: invalid postId', postId);
    return;
  }

  const existing = await getMyJoinRequest(postId);
  if (existing && (existing.status === 'pending' || existing.status === 'accepted')) return;

  
  const { data: postRow } = await sb.from('posts').select('id,author_email').eq('id', postId).single();
  if (!postRow) { console.error('sendJoinRequest: post not found', postId); return; }
  const hostEmail = postRow.author_email;
  if (!hostEmail || hostEmail === currentUser.email) return;

  
  if (btn) {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Pending…`;
    btn.className = 'post-action-btn pending-join';
    btn.disabled  = true;
  }

  
  const jrId = (existing && existing.id) ? existing.id : 'jr_' + Date.now();
  await sbUpsert('join_requests', {
    id:              jrId,
    post_id:         postId,           
    requester_email: currentUser.email,
    host_email:      hostEmail,
    status:          'pending',
  }, 'id');

  invalidateFeedCache(['joinReqs']);
  showToast('Join request sent!');
  updateSidebarBadges();
}

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

async function submitPost() {
  const input = document.getElementById('post-input');
  const text  = (input ? input.value : '').trim();
  if (!text && composerImages.length === 0) return;
  if (!currentUser) return;

  const subject  = document.getElementById('composer-subject')?.value  || '';
  const schedule = document.getElementById('composer-schedule')?.value || '';
  const location = document.getElementById('composer-location')?.value || '';

  
  const tags   = [];
  if (subject) tags.push(subject);
  if (composerGatherBuddies) tags.push('__gather_buddies__');

  const postId      = 'p' + Date.now();
  const snapImages  = composerImages.map(img => img.dataUrl);
  const snapGather  = composerGatherBuddies;

  
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
    gatherBuddies: snapGather,
    groupChatId:   null,            
  };

  
  _injectOptimisticPost(newPost);

  
  _persistPost(newPost, postId, subject, snapGather, tags).catch(err => {
    console.error('submitPost background save failed:', err);
    
    const el = document.getElementById('post-' + postId);
    if (el) {
      el.style.border = '2px solid #ef4444';
      el.insertAdjacentHTML('afterbegin',
        '<div style="color:#ef4444;font-size:.8rem;padding:8px 12px">⚠️ Failed to save post. Please refresh.</div>');
    }
  });
}

function _resetComposer(input) {
  if (input) { input.value = ''; input.style.height = 'auto'; }
  composerImages        = [];
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

function _injectOptimisticPost(post) {
  const list = document.getElementById('feed-list');
  if (!list) return;

  
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

  
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html.trim();
  const card = wrapper.firstElementChild;
  if (!card) return;   

  card.style.opacity   = '0.85';
  card.style.animation = 'fadeUp .25s ease both';
  card.dataset.optimistic = 'true';

  
  const firstPost = list.querySelector('.feed-post');
  if (firstPost) {
    list.insertBefore(card, firstPost);
  } else {
    list.innerHTML = '';
    list.appendChild(card);
  }
}

async function _persistPost(post, postId, subject, snapGather, tags) {
  
  let groupChatId = null;
  if (snapGather) {
    groupChatId = await createGroupChatForPost(postId, subject || 'Study Session');
    if (groupChatId) {
      post.groupChatId = groupChatId;
      tags.push('__gc_' + groupChatId + '__');
      post.tags = [...tags];
    }
  }

  
  const row = postToRow(post);
  const { error } = await sb.from('posts').insert([row]);
  if (error) throw new Error(error.message);

  
  
  if (groupChatId) {
    const { error: patchErr } = await sb
      .from('posts')
      .update({ group_chat_id: groupChatId })
      .eq('id', postId);
    if (patchErr) console.error('_persistPost: group_chat_id patch failed:', patchErr.message);
  }

  
  const card = document.getElementById('post-' + postId);
  if (card) {
    card.style.opacity   = '1';
    card.removeAttribute('data-optimistic');
  }

  
  invalidateFeedCache(['posts']);
  updateSidebarBadges();
}

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
    el.style.boxShadow = '0 0 0 3px var(--brand-base)';
    setTimeout(() => { el.style.boxShadow = ''; }, 2000);
  }
}

async function renderMatches() {
  await renderReceivedMatches();
  await renderSentMatches();
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
    const color = avatarColor(sender);
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
    const color = avatarColor(target);
    const statusLabel = m.status === 'accepted'
      ? '<span class="match-status received">✓ Connected</span>'
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

  

  showToast('Connection accepted! You can now message them.');
  await renderMatches();
  await renderBuddies();
  await updateSidebarBadges();
}

async function declineMatch(fromEmail) {
  if (!currentUser) return;
  const matches = await loadMatches();
  const m = matches.find(x => x.from === fromEmail && x.to === currentUser.email);
  
  if (m) {
    await sbDelete('matches', 'id', m.id);
  }
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

function _getFileIcon(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  const map = { pdf:'📄', doc:'📝', docx:'📝', txt:'📄', ppt:'📊', pptx:'📊', xls:'📊', xlsx:'📊', zip:'📦', rar:'📦' };
  return map[ext] || '📎';
}

function applyAvatarColor(color, elements) {
  // Sanitize any old purple DB values through the remap table in shared.js
  const safe = (color && typeof AVATAR_COLOR_REMAP !== 'undefined')
    ? (AVATAR_COLOR_REMAP[color] || color)
    : color;
  elements.forEach(el => { if (el && safe) el.style.background = safe; });
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
let _chatChannel        = null;   // Supabase Realtime broadcast channel for room chat
let localStream         = null;
let micEnabled          = true;
let camEnabled          = true;
let screenSharing       = false;
let screenStream        = null;

// ── Highlight state ────────────────────────────────────────
let _highlightedEmail   = null;   // email of currently spotlighted participant, or null
let _highlightPickerOpen = false; // whether the picker is visible

// ── Window bridge for webrtc.js ────────────────────────────
// webrtc.js reads these to include current room state in the
// room_state handshake sent to late joiners.  Keep them in sync.
window._sbHighlightedEmail = null;
window._sbRoomHostEmail    = null;

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
    const lockIcon  = room.lockPin
      ? `<span class="sr-card-lock" title="PIN required">
           <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
         </span>`
      : '';
    return `
    <div class="sr-room-card ${isActive ? 'active' : ''}" onclick="handleRoomCardClick('${escHtml(room.id)}')">
      <span class="sr-card-dot ${isLive ? 'live' : 'idle'}"></span>
      <div class="sr-card-body">
        <div class="sr-card-name">${modeIcon} ${escHtml(room.title || room.name || 'Untitled Room')}</div>
        <div class="sr-card-meta">${escHtml(room.subject || 'General')} · ${partCount} member${partCount !== 1 ? 's' : ''}</div>
      </div>
      ${lockIcon}
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
  const name    = (nameEl    ? nameEl.value    : '').trim();
  const subject = (subjectEl ? subjectEl.value : '').trim();
  const modeEl  = document.querySelector('input[name="room-mode"]:checked');
  const mode    = modeEl ? modeEl.value : 'audio';
  if (!name) { showToast('Please enter a room name.'); return; }

  // Collect PIN if lock is enabled
  const lockEnabled = document.getElementById('create-lock-track')?.style.background === 'rgb(124, 58, 237)' ||
    document.getElementById('create-pin-wrap')?.style.display !== 'none';
  let lockPin = null;
  if (lockEnabled) {
    const digits = ['cpin-0','cpin-1','cpin-2','cpin-3'].map(id => document.getElementById(id)?.value || '');
    const pin = digits.join('');
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      showToast('Please enter a complete 4-digit PIN.');
      return;
    }
    lockPin = pin;
  }

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
    lockPin,
  };
  const rooms = await loadRooms();
  rooms.push(newRoom);
  await saveRooms(rooms);

  const modal = document.getElementById('create-room-modal');
  if (modal) modal.classList.remove('open');
  _resetCreateLockUI();

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

  // ── Show join loading overlay ──
  _showRoomLoading('Joining room…', 'Connecting your mic & camera', false);

  if (!room.participants.includes(currentUser.email)) {
    room.participants.push(currentUser.email);
  }
  if (!room.roomNotes)  room.roomNotes  = [];
  if (!room.roomChat)   room.roomChat   = [];
  room.active = true;
  await saveRooms(rooms);

  // Keep a local copy so the pagehide unload handler can use it
  // without needing an async DB read inside a synchronous event.
  _lastKnownParticipants = [...room.participants];

  activeRoomId = roomId;
  _startChatChannel(roomId);   // ← real-time chat
  await renderRoomsList();
  showRoomView(room);
  await startLocalMedia(room.mode);
  setTimeout(() => {
    refreshLocalTile();
    _hideRoomLoading();
  }, 250);
}

async function leaveRoom(silent) {
  if (!activeRoomId) return;

  // ── Show leave loading overlay (skip when silently switching rooms) ──
  if (!silent) _showRoomLoading('Leaving room…', 'Closing connections', true);

  // ── Clear any active highlight before leaving ──
  // Only the host has authority to broadcast a highlight change.
  // Non-host clients clear their local layout silently — they must never
  // broadcast a null that would wipe the spotlight for everyone else.
  const leavingAsHost = window._sbRoomHostEmail &&
    currentUser && window._sbRoomHostEmail === currentUser.email;
  if (leavingAsHost && _highlightedEmail) {
    SBCall.broadcastHighlight(null);
  }
  _highlightedEmail          = null;
  window._sbHighlightedEmail = null;
  _closeHighlightPicker();

  stopLocalMedia();
  _stopChatChannel();          // ← stop real-time chat
  pomodoroStop();
  destroyRoomWhiteboard();

  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);

  if (room) {
    room.participants = room.participants.filter(e => e !== currentUser.email);
    // Sync cache so pagehide handler reflects the updated list
    _lastKnownParticipants = [...room.participants];

    if (room.participants.length === 0) {
      // Auto-delete empty room from DB
      await sb.from('sessions').delete().eq('id', room.id);
    } else {
      room.active = true;
      await saveRooms(rooms);
    }
  }

  _resetParticipantsPanel();   // clear invite state, close panel
  activeRoomId = null;
  window._sbRoomHostEmail    = null;
  window._sbHighlightedEmail = null;
  await renderRoomsList();
  if (!silent) {
    _applySpotlightLayout(null); // reset grid before showing lobby
    _hideRoomLoading();
    showLobby();
  }
}

/* ══════════════════════════════════════
   ROOM UI — LOBBY / VIEW
══════════════════════════════════════ */
function showLobby() {
  document.getElementById('sessions-lobby').style.display = 'flex';
  document.getElementById('room-view').style.display      = 'none';
  document.querySelector('.sr-layout')?.classList.remove('in-room');
}

/* Show lobby on mobile without leaving the call — sidebar slides back in */
function mobileBackToLobby() {
  document.getElementById('sessions-lobby').style.display = 'flex';
  document.getElementById('room-view').style.display      = 'none';
  document.querySelector('.sr-layout')?.classList.remove('in-room');
}

async function showRoomView(room) {
  document.getElementById('sessions-lobby').style.display = 'none';
  document.getElementById('room-view').style.display      = 'flex';
  document.querySelector('.sr-layout')?.classList.add('in-room');

  setText('room-header-name',    room.name || room.title || 'Room');
  setText('room-header-subject', room.subject || '');

  // ── Wire up host-only highlight controls ──
  const isHost       = currentUser && room.hostEmail === currentUser.email;
  window._sbRoomHostEmail = room.hostEmail || null;
  const highlightBtn = document.getElementById('btn-highlight');
  const hostOnlyBar  = document.getElementById('sr-host-only-bar');
  if (highlightBtn) highlightBtn.style.display = isHost ? '' : 'none';
  if (hostOnlyBar)  hostOnlyBar.style.display  = isHost ? 'none' : '';

  // ── Wire up host-only lock button ──
  const lockBtn = document.getElementById('btn-room-lock');
  if (lockBtn) {
    lockBtn.style.display = isHost ? '' : 'none';
    lockBtn.classList.toggle('locked', !!room.lockPin);
  }

  switchRoomTab('video');
  renderVideoGrid(room);
  renderParticipants(room);
  await refreshParticipantsPanel();  // sync badge count
}

/* ══════════════════════════════════════
   TAB SWITCHING
══════════════════════════════════════ */
async function switchRoomTab(tab) {
  const tabs   = ['video', 'whiteboard', 'chat', 'timer'];
  const panels = { video: 'rpanel-video', whiteboard: 'rpanel-whiteboard', chat: 'rpanel-chat', timer: 'rpanel-timer' };

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
    // Delegate stop to SBCall — it restores camera track on all peer connections
    await SBCall.stopScreenShare();
    screenSharing = false;
    screenStream  = null;
    updateMediaButtons(); refreshLocalTile();
    return;
  }
  try {
    // Delegate to SBCall — it calls getDisplayMedia AND replaceTrack on every peer connection
    await SBCall.shareScreen();
    if (!SBCall.isScreenSharing()) return; // user cancelled the picker
    screenSharing = true;
    screenStream  = null; // SBCall owns the screen stream internally
    screenStream  = SBCall.getLocalStream(); // for refreshLocalTile compat (camera fallback)
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
  // Use the screen stream when sharing, camera otherwise
  const stream = SBCall.isActive()
    ? (SBCall.isScreenSharing() ? SBCall.getScreenStream() : SBCall.getLocalStream())
    : localStream;
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

  const participants = room.participants || [];

  // ── 1. Build the set of tile IDs that should exist ──────────────────
  const expectedIds = new Set(participants.map(email => {
    return email === currentUser.email
      ? 'vtile-local'
      : 'vtile-' + email.replace(/[^a-z0-9]/gi, '_');
  }));

  // ── 2. Remove tiles for participants who have left ───────────────────
  // Search both the grid root and the thumb strip so tiles are found
  // regardless of which container they currently live in.
  grid.querySelectorAll('.video-tile').forEach(tile => {
    if (!expectedIds.has(tile.id)) tile.remove();
  });
  const thumbStrip = document.getElementById('sr-thumb-strip');
  if (thumbStrip) {
    thumbStrip.querySelectorAll('.video-tile').forEach(tile => {
      if (!expectedIds.has(tile.id)) tile.remove();
    });
  }

  // ── 3. Add tiles for participants not yet in the DOM ─────────────────
  // Place them in the thumb strip when spotlight is active, grid otherwise.
  participants.forEach(email => {
    const isSelf = email === currentUser.email;
    const tileId = isSelf ? 'vtile-local' : 'vtile-' + email.replace(/[^a-z0-9]/gi, '_');

    if (document.getElementById(tileId)) return; // already exists — leave it alone

    const u     = accounts.find(a => a.email === email);
    const name  = u ? u.name : email;
    const init  = u ? getInitials(u) : '?';
    const color = avatarColor(u);

    const tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.id = tileId;
    tile.innerHTML = `
      <video autoplay playsinline ${isSelf ? 'muted' : ''} style="display:none"></video>
      <div class="video-tile-avatar" style="display:flex">
        <div class="video-tile-av-circle" style="background:${color}">${escHtml(init)}</div>
        <div class="video-tile-name">${escHtml(name)}${isSelf ? ' (You)' : ''}</div>
      </div>
      <div class="video-tile-label">
        ${escHtml(isSelf ? 'You' : name.split(' ')[0])}
        <span class="tile-mic-off" style="${isSelf && !micEnabled ? '' : 'display:none'}">🔇</span>
      </div>`;

    // Place into thumb strip if spotlight is active, otherwise into grid root
    const strip = document.getElementById('sr-thumb-strip');
    if (strip && grid.classList.contains('spotlight')) {
      strip.appendChild(tile);
    } else {
      grid.appendChild(tile);
    }
  });

  // ── 4. Re-apply spotlight layout only when a highlight is active ─────
  _applySpotlightLayout(_highlightedEmail);

  // ── 5. Repaint the local tile stream if one is active ────────────────
  if (localStream || screenStream) refreshLocalTile();
}

async function renderParticipants(room) {
  /* Participant chip strip removed — participants are visible as video tiles */
}

/* ══════════════════════════════════════
   ROOM LOADING OVERLAY
   _showRoomLoading / _hideRoomLoading
   Creates a full-cover overlay on #room-view during join/leave
   so the async delay is invisible to the user.
══════════════════════════════════════ */
function _showRoomLoading(title, sub, isLeave) {
  const view = document.getElementById('room-view');
  if (!view) return;
  // Ensure the room view is visible so overlay appears on top of it
  view.style.display = 'flex';
  // Remove any stale overlay
  const old = document.getElementById('room-loading-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id        = 'room-loading-overlay';
  overlay.className = 'room-loading-overlay' + (isLeave ? ' leave-mode' : '');
  overlay.innerHTML = `
    <div class="rlo-spinner"></div>
    <div class="rlo-title">${escHtml(title)}</div>
    <div class="rlo-sub">${escHtml(sub)}</div>`;
  view.appendChild(overlay);
}

function _hideRoomLoading() {
  const overlay = document.getElementById('room-loading-overlay');
  if (overlay) overlay.remove();
}

/* ══════════════════════════════════════
   HIGHLIGHT SYSTEM
   Only the room host can highlight a participant.
   The spotlight is broadcast to all participants via the
   existing sbcall: Supabase Realtime channel in webrtc.js.
   One participant at a time — hard limit enforced by single-select picker.
══════════════════════════════════════ */

/**
 * Toggle the highlight picker open/closed.
 * Called by the Highlight button in the media bar (host only).
 */
async function toggleHighlightPicker() {
  if (_highlightPickerOpen) {
    _closeHighlightPicker();
    return;
  }
  _highlightPickerOpen = true;

  // Build participant list — everyone except the host
  const rooms    = await loadRooms();
  const room     = rooms.find(r => r.id === activeRoomId);
  if (!room) { _highlightPickerOpen = false; return; }

  const accounts = await loadAccounts();
  const everyone = (room.participants || []);  // all participants, host included

  const mediaBar = document.querySelector('.sr-media-bar');
  if (!mediaBar) { _highlightPickerOpen = false; return; }

  const picker = document.createElement('div');
  picker.id        = 'highlight-picker';
  picker.className = 'highlight-picker';

  const hasActive = !!_highlightedEmail;
  const rowsHtml  = everyone.map(email => {
    const u      = accounts.find(a => a.email === email);
    const isSelf = email === (currentUser && currentUser.email);
    const name   = isSelf ? 'You (host)' : (u ? u.name : email);
    const init   = u ? getInitials(u) : email[0].toUpperCase();
    const color  = avatarColor(u);
    const isCur  = email === _highlightedEmail;
    return `
      <div class="highlight-picker-row${isCur ? ' current' : ''}"
           onclick="applyHighlight('${escHtml(email)}')">
        <div class="highlight-picker-av" style="background:${color}">${escHtml(init)}</div>
        <span class="highlight-picker-name">${escHtml(name)}</span>
        ${isCur ? `<span class="highlight-picker-check">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </span>` : ''}
      </div>`;
  }).join('');

  const clearHtml = hasActive ? `
    <div class="highlight-picker-divider"></div>
    <div class="highlight-picker-clear" onclick="applyHighlight(null)">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      Remove highlight
    </div>` : '';

  picker.innerHTML = `
    <div class="highlight-picker-title">
      ${hasActive ? 'Change or remove highlight' : 'Highlight a participant'}
    </div>
    ${rowsHtml}
    ${clearHtml}`;

  mediaBar.appendChild(picker);

  // Close picker when clicking outside
  setTimeout(() => {
    document.addEventListener('click', _pickerOutsideClick, { capture: true, once: true });
  }, 0);
}

function _pickerOutsideClick(e) {
  const picker = document.getElementById('highlight-picker');
  if (picker && !picker.contains(e.target)) {
    _closeHighlightPicker();
  } else if (picker) {
    // Re-attach listener if click was inside (for next outside click)
    document.addEventListener('click', _pickerOutsideClick, { capture: true, once: true });
  }
}

function _closeHighlightPicker() {
  _highlightPickerOpen = false;
  const picker = document.getElementById('highlight-picker');
  if (picker) picker.remove();
  document.removeEventListener('click', _pickerOutsideClick, { capture: true });
}

/**
 * Apply or clear a spotlight.
 * email = string → spotlight that participant; null → clear.
 * Called from the picker rows and "Remove highlight".
 */
function applyHighlight(email) {
  _closeHighlightPicker();

  // No-op if same person clicked again
  if (email === _highlightedEmail) return;

  _highlightedEmail          = email || null;
  window._sbHighlightedEmail = _highlightedEmail;

  // Update local grid immediately
  _applySpotlightLayout(_highlightedEmail);

  // Broadcast to all other participants via WebRTC signalling channel
  SBCall.broadcastHighlight(_highlightedEmail);

  // Update the Highlight button visual state
  _updateHighlightButton();
}

/**
 * Receive a highlight broadcast from the host.
 * Called by SBCall when a 'highlight' signal arrives.
 */
function onHighlightReceived(email) {
  _highlightedEmail          = email || null;
  window._sbHighlightedEmail = _highlightedEmail;
  _applySpotlightLayout(_highlightedEmail);
  _updateHighlightButton();
}

/**
 * Rearrange the video grid into spotlight or normal layout.
 * email = string → move that tile to spotlight position
 * email = null   → restore the standard auto-fill grid
 */
function _applySpotlightLayout(email) {
  const grid = document.getElementById('video-grid');
  if (!grid) return;

  // ── Step 1: Rescue any tiles that are inside the thumb strip
  //    back into the grid BEFORE removing the strip.
  //    Skipping this was the bug — removing the strip deleted the tiles with it.
  const oldStrip = document.getElementById('sr-thumb-strip');
  if (oldStrip) {
    Array.from(oldStrip.querySelectorAll('.video-tile')).forEach(t => grid.appendChild(t));
    oldStrip.remove();
  }

  // ── Step 2: Strip spotlight markers from every tile
  grid.querySelectorAll('.video-tile').forEach(t => {
    t.classList.remove('spotlight-tile');
    const badge = t.querySelector('.spotlight-badge');
    if (badge) badge.remove();
  });

  // ── Step 3: If clearing, restore normal grid layout and stop
  if (!email) {
    grid.classList.remove('spotlight');
    return;
  }

  // ── Step 4: Find the target tile (host can spotlight themselves too)
  const tileId   = email === (currentUser && currentUser.email)
    ? 'vtile-local'
    : 'vtile-' + email.replace(/[^a-z0-9]/gi, '_');
  const spotTile = document.getElementById(tileId);
  if (!spotTile) {
    // Tile not in DOM yet — bail out cleanly, grid stays normal
    grid.classList.remove('spotlight');
    return;
  }

  // ── Step 5: Apply spotlight layout
  grid.classList.add('spotlight');
  spotTile.classList.add('spotlight-tile');

  // Badge
  const badge     = document.createElement('div');
  badge.className = 'spotlight-badge';
  badge.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Highlighted`;
  spotTile.appendChild(badge);

  // Promote spotlight tile to the top of the grid
  grid.prepend(spotTile);

  // ── Step 6: Move all non-spotlight tiles into a thumb strip
  const thumbTiles = Array.from(grid.querySelectorAll('.video-tile:not(.spotlight-tile)'));
  const strip     = document.createElement('div');
  strip.id        = 'sr-thumb-strip';
  strip.className = 'sr-thumb-strip';
  thumbTiles.forEach(t => strip.appendChild(t));
  grid.appendChild(strip);
}

/**
 * Update the Highlight button to reflect active/inactive state.
 */
function _updateHighlightButton() {
  const btn = document.getElementById('btn-highlight');
  const lbl = document.getElementById('highlight-label');
  if (!btn) return;
  if (_highlightedEmail) {
    btn.classList.add('active-media');
    if (lbl) lbl.textContent = 'Highlighted';
  } else {
    btn.classList.remove('active-media');
    if (lbl) lbl.textContent = 'Highlight';
  }
}

/**
 * Called by webrtc.js (_closePeer) when a highlighted participant leaves.
 * Clears the spotlight so the grid isn't stuck in spotlight mode.
 */
function onHighlightedParticipantLeft(email) {
  if (_highlightedEmail !== email) return;

  const isHost = window._sbRoomHostEmail &&
    currentUser && window._sbRoomHostEmail === currentUser.email;

  if (isHost) {
    // Host owns the canonical highlight state — clear it and tell everyone.
    _highlightedEmail          = null;
    window._sbHighlightedEmail = null;
    SBCall.broadcastHighlight(null);
    _applySpotlightLayout(null);
    _updateHighlightButton();
  } else {
    // Non-host: only reset the local grid layout.
    // Do NOT touch _highlightedEmail or broadcast — the host's state is
    // authoritative and a new room_state handshake will restore the layout
    // if the host re-spotlights someone or a new user joins.
    _applySpotlightLayout(null);
  }
}

/**
 * Called by webrtc.js when the host sends us a room_state signal on join.
 * Applies the current highlight layout and screen-share indicator so the
 * late joiner's UI matches what everyone else sees.
 *
 * @param {object} data  { highlightedEmail: string|null, isScreenSharing: boolean }
 */
function onRoomStateReceived(data) {
  // ── 1. Restore highlight / spotlight layout ──
  const hEmail = data.highlightedEmail || null;
  if (hEmail !== _highlightedEmail) {
    _highlightedEmail          = hEmail;
    window._sbHighlightedEmail = hEmail;
    _applySpotlightLayout(_highlightedEmail);
    _updateHighlightButton();
  }

  // ── 2. Reflect screen-share state in the host's tile ──
  // The actual video stream arrives via the WebRTC track — we don't
  // have to do anything to show it.  What we DO need is to make sure
  // the Screen Share button on our end doesn't show a false state, and
  // that the host's tile label reflects "Screen" not their camera.
  // (Full track replacement already happens in _handleAnswer on the
  // host side; this just keeps the UI consistent for the joiner.)
  if (data.isScreenSharing) {
    // Mark the host tile with a subtle indicator so the joiner knows
    // they're watching a shared screen, not the host's camera.
    const hostTileId = data.highlightedEmail
      ? null  // spotlight badge already covers this
      : null; // future: could add a "screen" label — for now the video stream is enough
    // Nothing extra needed — the track arrives via ontrack and renders automatically.
    void hostTileId;
  }
}

/* ══════════════════════════════════════
   ROOM LOCK SYSTEM
   • Create-modal toggle + PIN boxes
   • handleRoomCardClick — gate non-hosts behind PIN entry
   • PIN entry overlay (joining)
   • Lock button + popover (host, inside room)
   • setRoomLock / removeRoomLock
══════════════════════════════════════ */

let _pinEntryRoomId = null; // room being entered via PIN screen

/* ── Create-modal lock toggle ── */
function toggleCreateLock() {
  const wrap  = document.getElementById('create-pin-wrap');
  const track = document.getElementById('create-lock-track');
  const thumb = document.getElementById('create-lock-thumb');
  const icon  = document.getElementById('create-lock-icon');
  const isOn  = wrap.style.display !== 'none';
  if (isOn) {
    wrap.style.display  = 'none';
    track.style.background = 'var(--border-panel)';
    thumb.style.left    = '2px';
    icon.style.stroke   = 'var(--text-light)';
    ['cpin-0','cpin-1','cpin-2','cpin-3'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  } else {
    wrap.style.display  = 'block';
    track.style.background = '#c8882a';
    thumb.style.left    = '18px';
    icon.style.stroke   = '#c8882a';
    setTimeout(() => document.getElementById('cpin-0')?.focus(), 50);
  }
}

function _resetCreateLockUI() {
  const wrap  = document.getElementById('create-pin-wrap');
  const track = document.getElementById('create-lock-track');
  const thumb = document.getElementById('create-lock-thumb');
  const icon  = document.getElementById('create-lock-icon');
  if (wrap)  wrap.style.display = 'none';
  if (track) { track.style.background = 'var(--border-panel)'; }
  if (thumb) thumb.style.left = '2px';
  if (icon)  icon.style.stroke = 'var(--text-light)';
  ['cpin-0','cpin-1','cpin-2','cpin-3'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}

function createPinInput(idx) {
  const el = document.getElementById('cpin-' + idx);
  if (!el) return;
  el.value = el.value.replace(/\D/g, '').slice(-1);
  if (el.value && idx < 3) document.getElementById('cpin-' + (idx + 1))?.focus();
}

function createPinKey(e, idx) {
  if (e.key === 'Backspace' && !document.getElementById('cpin-' + idx)?.value && idx > 0) {
    document.getElementById('cpin-' + (idx - 1))?.focus();
  }
}

/* ── Room card click — gate non-hosts ── */
async function handleRoomCardClick(roomId) {
  if (!currentUser) return;
  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === roomId);
  if (!room) return;

  /* On mobile: if this is already the active room, just navigate back into it */
  if (roomId === activeRoomId) {
    document.getElementById('sessions-lobby').style.display = 'none';
    document.getElementById('room-view').style.display      = 'flex';
    document.querySelector('.sr-layout')?.classList.add('in-room');
    return;
  }

  const isHost = room.hostEmail === currentUser.email;
  if (room.lockPin && !isHost) {
    _openPinEntry(room);
  } else {
    joinRoom(roomId);
  }
}

/* ── PIN entry overlay (joining) ── */
function _openPinEntry(room) {
  _pinEntryRoomId = room.id;
  const overlay = document.getElementById('pin-entry-overlay');
  const nameEl  = document.getElementById('pin-entry-room-name');
  const subEl   = document.getElementById('pin-entry-sub');
  if (nameEl) nameEl.textContent = room.title || room.name || 'Room';
  if (subEl)  { subEl.textContent = 'Enter the 4-digit PIN to join'; subEl.className = 'pin-entry-sub'; }
  ['jpin-0','jpin-1','jpin-2','jpin-3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('error'); }
  });
  if (overlay) overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('jpin-0')?.focus(), 50);
}

function closePinEntry() {
  _pinEntryRoomId = null;
  const overlay = document.getElementById('pin-entry-overlay');
  if (overlay) overlay.style.display = 'none';
}

function joinPinInput(idx) {
  const el = document.getElementById('jpin-' + idx);
  if (!el) return;
  el.value = el.value.replace(/\D/g, '').slice(-1);
  if (el.value && idx < 3) {
    document.getElementById('jpin-' + (idx + 1))?.focus();
  } else if (el.value && idx === 3) {
    _submitPinEntry();
  }
}

function joinPinKey(e, idx) {
  if (e.key === 'Backspace' && !document.getElementById('jpin-' + idx)?.value && idx > 0) {
    document.getElementById('jpin-' + (idx - 1))?.focus();
  }
}

async function _submitPinEntry() {
  const digits = ['jpin-0','jpin-1','jpin-2','jpin-3'].map(id => document.getElementById(id)?.value || '');
  const entered = digits.join('');
  if (entered.length < 4) return;

  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === _pinEntryRoomId);
  if (!room) { closePinEntry(); return; }

  if (entered === room.lockPin) {
    closePinEntry();
    joinRoom(room.id);
  } else {
    // Wrong PIN — shake and clear
    const subEl = document.getElementById('pin-entry-sub');
    if (subEl) { subEl.textContent = 'Incorrect PIN — try again'; subEl.className = 'pin-entry-sub error'; }
    ['jpin-0','jpin-1','jpin-2','jpin-3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.add('error'); }
    });
    setTimeout(() => {
      ['jpin-0','jpin-1','jpin-2','jpin-3'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.value = ''; el.classList.remove('error'); }
      });
      const sub = document.getElementById('pin-entry-sub');
      if (sub) { sub.textContent = 'Enter the 4-digit PIN to join'; sub.className = 'pin-entry-sub'; }
      document.getElementById('jpin-0')?.focus();
    }, 700);
  }
}

/* ── Lock button + popover (host, inside room) ── */
let _lockPopoverOpen = false;

function toggleLockPopover() {
  if (_lockPopoverOpen) { _closeLockPopover(); return; }
  _renderLockPopover();
}

async function _renderLockPopover() {
  _lockPopoverOpen = true;
  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);
  if (!room) { _lockPopoverOpen = false; return; }

  const pop = document.getElementById('lock-popover');
  if (!pop) { _lockPopoverOpen = false; return; }

  if (room.lockPin) {
    const digits = room.lockPin.split('').map(d =>
      `<div class="lock-popover-digit">${escHtml(d)}</div>`).join('');
    pop.innerHTML = `
      <div class="lock-popover">
        <div class="lock-popover-title">Room PIN</div>
        <div class="lock-popover-pin">${digits}</div>
        <div class="lock-popover-divider"></div>
        <div class="lock-popover-row" onclick="startChangeLockPin()">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Change PIN
        </div>
        <div class="lock-popover-row danger" onclick="removeRoomLock()">
          <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
          Remove lock
        </div>
      </div>`;
  } else {
    pop.innerHTML = `
      <div class="lock-popover">
        <div class="lock-popover-title">Set a PIN</div>
        <div class="lock-set-pin">
          <input class="lock-set-digit" id="lpin-0" type="text" inputmode="numeric" maxlength="1" oninput="lockSetInput(0)" onkeydown="lockSetKey(event,0)" />
          <input class="lock-set-digit" id="lpin-1" type="text" inputmode="numeric" maxlength="1" oninput="lockSetInput(1)" onkeydown="lockSetKey(event,1)" />
          <input class="lock-set-digit" id="lpin-2" type="text" inputmode="numeric" maxlength="1" oninput="lockSetInput(2)" onkeydown="lockSetKey(event,2)" />
          <input class="lock-set-digit" id="lpin-3" type="text" inputmode="numeric" maxlength="1" oninput="lockSetInput(3)" onkeydown="lockSetKey(event,3)" />
        </div>
        <button class="lock-popover-confirm" onclick="confirmSetLockPin()">Lock room</button>
      </div>`;
    setTimeout(() => document.getElementById('lpin-0')?.focus(), 50);
  }

  pop.style.display = 'block';
  setTimeout(() => document.addEventListener('click', _lockPopoverOutside, { capture: true, once: true }), 0);
}

function _lockPopoverOutside(e) {
  const pop = document.getElementById('lock-popover');
  const btn = document.getElementById('btn-room-lock');
  if (pop && !pop.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
    _closeLockPopover();
  } else {
    document.addEventListener('click', _lockPopoverOutside, { capture: true, once: true });
  }
}

function _closeLockPopover() {
  _lockPopoverOpen = false;
  const pop = document.getElementById('lock-popover');
  if (pop) pop.style.display = 'none';
  document.removeEventListener('click', _lockPopoverOutside, { capture: true });
}

function lockSetInput(idx) {
  const el = document.getElementById('lpin-' + idx);
  if (!el) return;
  el.value = el.value.replace(/\D/g, '').slice(-1);
  if (el.value && idx < 3) document.getElementById('lpin-' + (idx + 1))?.focus();
}

function lockSetKey(e, idx) {
  if (e.key === 'Backspace' && !document.getElementById('lpin-' + idx)?.value && idx > 0) {
    document.getElementById('lpin-' + (idx - 1))?.focus();
  }
}

async function confirmSetLockPin() {
  const digits = ['lpin-0','lpin-1','lpin-2','lpin-3'].map(id => document.getElementById(id)?.value || '');
  const pin = digits.join('');
  if (!/^\d{4}$/.test(pin)) { showToast('Enter a complete 4-digit PIN.'); return; }
  await setRoomLock(pin);
}

async function startChangeLockPin() {
  _closeLockPopover();
  await removeRoomLock(true); // remove then re-open popover to set new
}

async function setRoomLock(pin) {
  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);
  if (!room) return;
  room.lockPin = pin;
  await saveRooms(rooms);
  _closeLockPopover();
  const btn = document.getElementById('btn-room-lock');
  if (btn) btn.classList.add('locked');
  showToast('Room locked 🔒');
  await renderRoomsList();
}

async function removeRoomLock(silent = false) {
  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);
  if (!room) return;
  room.lockPin = null;
  await saveRooms(rooms);
  _closeLockPopover();
  const btn = document.getElementById('btn-room-lock');
  if (btn) btn.classList.remove('locked');
  if (!silent) showToast('Room unlocked');
  await renderRoomsList();
  if (silent) _renderLockPopover(); // re-open for PIN change flow
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

function switchPomoMode(btn, mode, minutes) {
  pomodoroStop();
  pomoMode    = mode === 'focus' ? 'focus' : 'break';
  pomoSeconds = minutes * 60;
  document.querySelectorAll('.sr-pomo-mode').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  pomodoroRenderTime();
  pomodoroRenderMeta();
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
    badgeEl.textContent = pomoMode === 'focus' ? 'Focus' : 'Break';
    badgeEl.className   = 'sr-pomo-badge' + (pomoMode === 'break' ? ' break' : '');
  }
  if (roundsEl) roundsEl.textContent = `${pomoRounds}/4`;
}

/* ══════════════════════════════════════
   ROOM CHAT — REALTIME CHANNEL
   Uses postgres_changes on room_messages table.
   RLS covers both anon + authenticated roles.
══════════════════════════════════════ */
function _startChatChannel(roomId) {
  _stopChatChannel();
  _chatChannel = sb
    .channel('room_messages:' + roomId)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'room_messages',
        filter: `session_id=eq.${roomId}`,
      },
      (payload) => {
        // Skip our own inserts (we already rendered them locally)
        if (payload.new && payload.new.from_email === (currentUser && currentUser.email)) return;
        renderRoomChat();
        // Badge if chat tab not active
        const chatPanel = document.getElementById('rpanel-chat');
        if (chatPanel && chatPanel.style.display === 'none') {
          const badge = document.getElementById('chat-badge');
          if (badge) {
            badge.style.display = '';
            badge.textContent   = (parseInt(badge.textContent || '0') + 1).toString();
          }
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Chat] Realtime subscribed for room:', roomId);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Chat] Realtime channel error:', status);
      }
    });
}

function _stopChatChannel() {
  if (_chatChannel) {
    try { sb.removeChannel(_chatChannel); } catch (_) {}
    _chatChannel = null;
  }
}

function clearChatBadge() {
  const badge = document.getElementById('chat-badge');
  if (badge) { badge.textContent = ''; badge.style.display = 'none'; }
}

async function sendRoomMessage() {
  if (!activeRoomId || !currentUser) return;
  const input = document.getElementById('rchat-input');
  const body  = (input ? input.value : '').trim();
  if (!body) return;

  // Write to room_messages table — Realtime delivers to other participants
  const { error } = await sb.from('room_messages').insert({
    id:         'rm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    session_id: activeRoomId,
    from_email: currentUser.email,
    body,
  });
  if (error) { console.error('[Chat] sendRoomMessage:', error.message); return; }

  if (input) input.value = '';
  await renderRoomChat();
}

async function renderRoomChat() {
  const container = document.getElementById('rchat-msgs');
  if (!container || !activeRoomId) return;

  // Load messages from dedicated room_messages table
  const { data: rows, error } = await sb
    .from('room_messages')
    .select('*')
    .eq('session_id', activeRoomId)
    .order('created_at', { ascending: true });

  if (error) { console.error('[Chat] renderRoomChat:', error.message); return; }

  // Normalise rows to the shape the rest of the function expects
  const msgs     = (rows || []).map(r => ({
    from: r.from_email,
    body: r.body,
    ts:   new Date(r.created_at).getTime(),
  }));
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

/* FIX 5 — _confirmSubscription
   Accepts a sub object OR a legacy tier-id string.
   Always resolves the creator's current subscription via
   getCreatorSubscription() so a stale id never hard-stops the flow. */
async function _confirmSubscription(creatorEmail, subOrId) {
  if (!currentUser) return;

  // Resolve to a subscription object regardless of what was passed
  let sub;
  if (subOrId && typeof subOrId === 'object') {
    // Caller already passed a full object (name, price, id)
    sub = subOrId;
  } else {
    // Legacy: a tier-id string was passed — look up the live subscription instead
    sub = await getCreatorSubscription(creatorEmail);
    if (!sub) { showToast("This creator hasn't set up a subscription yet."); return; }
  }

  // Guard: already subscribed?
  const subs = await loadUserSubs();
  if (subs.some(s => s.userEmail === currentUser.email && s.creatorEmail === creatorEmail)) {
    showToast('You are already subscribed!'); return;
  }

  // Write — saveUserSubs now upserts on (user_email, creator_email) so this is idempotent
  await saveUserSubs([{
    id:           'sub_' + Date.now(),
    userEmail:    currentUser.email,
    creatorEmail,
    tierId:       sub.id   || null,
    price:        Number(sub.price) || 0,
    since:        Date.now(),
  }]);

  showToast(`✅ Subscribed to "${escHtml(sub.name || 'Subscription')}"! ₱${sub.price || 0}/month`);
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
/* ═══════════════════════════════════════════════════════════
   PARTICIPANTS PANEL
   Opened by the "People" media-bar button.
   • All users: see everyone in the room with mic/cam status.
   • Host only: kick button (with inline confirm) + invite section.
   • Invite list: only accepted-match buddies not already in room.
   • Invite delivery: Supabase Realtime broadcast on the same
     sbcall channel — the invited user sees a dismissable banner.
   ═══════════════════════════════════════════════════════════ */

/* ── Module state ─────────────────────────────────────────── */
let _ppOpen         = false;         // panel visibility
let _ppSentInvites  = new Set();     // emails we already invited this session
let _ppBuddyCache   = null;          // [{ email, name, avatarColor }] connected buddies
let _ppInviteChannel = null;         // Supabase Realtime channel for invite signals

/* ── Toggle / open / close ──────────────────────────────── */
/* ── Invite panel (replaces participants panel) ──────────── */
function toggleInvitePanel() {
  const panel = document.getElementById('sr-invite-panel');
  if (!panel) return;
  if (panel.style.display === 'none' || !panel.style.display) {
    openInvitePanel();
  } else {
    closeInvitePanel();
  }
}

async function openInvitePanel() {
  const panel = document.getElementById('sr-invite-panel');
  const btn   = document.getElementById('btn-invite');
  if (!panel || !activeRoomId || !currentUser) return;
  panel.style.display = 'flex';
  if (btn) btn.classList.add('active-media');
  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);
  if (!room) return;
  await _loadBuddyCache(room.participants);
  _renderBuddyList('');
}

function closeInvitePanel() {
  const panel = document.getElementById('sr-invite-panel');
  const btn   = document.getElementById('btn-invite');
  if (panel) panel.style.display = 'none';
  if (btn)   btn.classList.remove('active-media');
}

function toggleParticipantsPanel() {
  const panel = document.getElementById('sr-invite-panel');
  if (!panel) return;
  if (panel.style.display === 'none' || !panel.style.display) {
    openInvitePanel();
  } else {
    closeInvitePanel();
  }
}

async function openParticipantsPanel() { await openInvitePanel(); }
function closeParticipantsPanel()      { closeInvitePanel(); }

/* ── Render participant list ─────────────────────────────── */
async function _renderPPList() {
  const listEl = document.getElementById('pp-list');
  const countEl = document.getElementById('pp-count');
  if (!listEl || !activeRoomId || !currentUser) return;

  const rooms    = await loadRooms();
  const room     = rooms.find(r => r.id === activeRoomId);
  if (!room) return;

  const accounts = await loadAccounts();
  const isHost   = room.hostEmail === currentUser.email;
  const parts    = room.participants || [];

  if (countEl) countEl.textContent = parts.length + ' in room';

  // Update badge on button
  const badge = document.getElementById('people-badge');
  if (badge) {
    badge.textContent   = parts.length;
    badge.style.display = parts.length > 0 ? '' : 'none';
  }

  listEl.innerHTML = parts.map((email, idx) => {
    const u       = accounts.find(a => a.email === email);
    const name    = u ? u.name : email;
    const init    = u ? getInitials(u) : email[0].toUpperCase();
    const color   = avatarColor(u);
    const isMe    = email === currentUser.email;
    const isRoomHost = email === room.hostEmail;

    const youTag   = isMe      ? `<span class="sr-pp-you">(You)</span>` : '';
    const hostTag  = isRoomHost ? `<span class="sr-pp-host-crown">★ Host</span>` : '';
    const kickBtn  = (isHost && !isMe)
      ? `<button class="sr-pp-kick" onclick="confirmKick('${escHtml(email)}')" title="Remove from room">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
           Kick
         </button>`
      : '';

    const divider = idx > 0 ? '<div class="sr-pp-divider"></div>' : '';

    return `${divider}
    <div class="sr-pp-row" id="pp-row-${escHtml(email.replace(/[^a-z0-9]/gi,'_'))}">
      <div class="sr-pp-av" style="background:${color}">${escHtml(init)}</div>
      <div class="sr-pp-info">
        <div class="sr-pp-name">${escHtml(name)}${youTag}${hostTag}</div>
        <div class="sr-pp-status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
          <span>In room</span>
        </div>
      </div>
      ${kickBtn}
    </div>`;
  }).join('');
}

/* ── Kick — inline confirm ────────────────────────────────── */
let _pendingKickEmail = null;

function confirmKick(email) {
  _dismissKickConfirm();
  _pendingKickEmail = email;

  const safeId = email.replace(/[^a-z0-9]/gi, '_');
  const row    = document.getElementById('pp-row-' + safeId);
  if (!row) return;

  const frag = document.createElement('div');
  frag.className = 'sr-pp-kick-confirm';
  frag.id        = 'pp-kick-confirm';
  frag.innerHTML = `
    <span>Remove <strong style="color:#fca5a5">${escHtml(email.split('@')[0])}</strong>?</span>
    <button class="sr-pp-kick-confirm-no"  onclick="_dismissKickConfirm()">Cancel</button>
    <button class="sr-pp-kick-confirm-yes" onclick="executeKick('${escHtml(email)}')">Remove</button>`;
  row.insertAdjacentElement('afterend', frag);
}

function _dismissKickConfirm() {
  const el = document.getElementById('pp-kick-confirm');
  if (el) el.remove();
  _pendingKickEmail = null;
}

async function executeKick(email) {
  if (!currentUser || !activeRoomId) return;
  _dismissKickConfirm();

  // 1. Remove from DB participants array
  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);
  if (!room) return;

  if (room.hostEmail !== currentUser.email) {
    showToast('Only the host can remove participants.');
    return;
  }

  room.participants = room.participants.filter(e => e !== email);
  _lastKnownParticipants = [...room.participants];
  await saveRooms(rooms);

  // 2. Broadcast a kick signal via SBCall channel so the kicked user's
  
  if (typeof SBCall !== 'undefined' && SBCall.isActive()) {
    try {
      
      
      await _sendKickSignal(email);
    } catch (_) {}
  }

  
  await _renderPPList();
  await renderParticipants(room);
  showToast(`${email.split('@')[0]} was removed from the room.`);
}

async function _sendKickSignal(toEmail) {
  const kickPayload = {
    session_id:     activeRoomId,
    sender_email:   currentUser.email,
    receiver_email: toEmail,
    type:           'kick',
    data:           { roomId: activeRoomId },
  };
  
  try {
    const callCh = sb.channel('sbcall:' + activeRoomId, { config: { broadcast: { self: false } } });
    await callCh.send({ type: 'broadcast', event: 'signal', payload: kickPayload });
  } catch (_) {}
  
  try {
    const personalCh = sb.channel('pp_invites:' + toEmail, { config: { broadcast: { self: false } } });
    await personalCh.send({ type: 'broadcast', event: 'pp_signal', payload: kickPayload });
  } catch (_) {}
}

async function handleIncomingKick(payload) {
  if (!currentUser) return;
  if (payload.receiver_email !== currentUser.email) return;
  
  showToast('You were removed from the room by the host.');
  await leaveRoom(false);
}

async function _renderPPInviteSection() {
  
}

async function _loadBuddyCache(currentParticipants) {
  const matches  = await loadMatches();
  const accounts = await loadAccounts();
  const connected = matches
    .filter(m => m.status === 'accepted')
    .map(m => m.from === currentUser.email ? m.to : m.from);

  _ppBuddyCache = connected
    .filter(email => !currentParticipants.includes(email))
    .map(email => {
      const u = accounts.find(a => a.email === email);
      return {
        email,
        name:        u ? u.name : email,
        init:        u ? getInitials(u) : email[0].toUpperCase(),
        avatarColor: avatarColor(u),
      };
    });
}

function _renderBuddyList(query) {
  const listEl = document.getElementById('pp-buddy-list');
  if (!listEl) return;

  const filtered = (_ppBuddyCache || []).filter(b =>
    !query || b.name.toLowerCase().includes(query.toLowerCase()) || b.email.toLowerCase().includes(query.toLowerCase())
  );

  if (!filtered.length) {
    listEl.innerHTML = `<div class="sr-pp-no-buddies">${
      (_ppBuddyCache || []).length === 0
        ? 'No connected buddies to invite'
        : 'No buddies match your search'
    }</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(b => {
    const isSent = _ppSentInvites.has(b.email);
    return `<div class="sr-pp-buddy-row">
      <div class="sr-pp-buddy-av" style="background:${b.avatarColor}">${escHtml(b.init)}</div>
      <div class="sr-pp-buddy-info">
        <div class="sr-pp-buddy-name">${escHtml(b.name)}</div>
        <div class="sr-pp-buddy-sub">Connected</div>
      </div>
      <button class="sr-pp-invite-btn${isSent ? ' sent' : ''}"
        ${isSent ? 'disabled' : ''}
        onclick="sendRoomInvite('${escHtml(b.email)}', this)">
        ${isSent ? '✓ Sent' : 'Invite'}
      </button>
    </div>`;
  }).join('');
}

function filterInviteBuddies() {
  const q = document.getElementById('pp-buddy-search')?.value || '';
  _renderBuddyList(q);
}

async function sendRoomInvite(toEmail, btn) {
  if (!currentUser || !activeRoomId) return;
  if (_ppSentInvites.has(toEmail)) return;

  
  if (btn) { btn.textContent = '✓ Sent'; btn.classList.add('sent'); btn.disabled = true; }
  _ppSentInvites.add(toEmail);

  try {
    
    const rooms    = await loadRooms();
    const room     = rooms.find(r => r.id === activeRoomId);
    const roomName = room ? (room.name || room.title || 'Study Room') : 'Study Room';
    const subject  = room ? (room.subject || '') : '';
    const lockPin  = room ? (room.lockPin  || null) : null;

    
    
    
    const attachment = {
      type:     'room_invite',
      roomId:   activeRoomId,
      roomName,
      subject,
      lockPin,                           
      fromName: currentUser.name || currentUser.email,
    };

    
    const text = lockPin
      ? `📚 ${currentUser.name || 'Someone'} invited you to join "${roomName}". PIN: ${lockPin}`
      : `📚 ${currentUser.name || 'Someone'} invited you to join "${roomName}".`;

    
    const saved = await sendMessageToDB(toEmail, text, 'room_invite', attachment);
    if (!saved) throw new Error('sendMessageToDB returned null');

    showToast(`Invite sent to ${toEmail.split('@')[0]}`);
  } catch (err) {
    console.error('[PP] sendRoomInvite error:', err);
    showToast('Could not send invite — try again.');
    _ppSentInvites.delete(toEmail);
    if (btn) { btn.textContent = 'Invite'; btn.classList.remove('sent'); btn.disabled = false; }
  }
}

async function _acceptRoomInvite(roomId) {
  
  await appNav('sessions');
  await joinRoom(roomId);
}

async function refreshParticipantsPanel() {
  
  const panel = document.getElementById('sr-invite-panel');
  if (panel && panel.style.display !== 'none' && activeRoomId) {
    const rooms = await loadRooms();
    const room  = rooms.find(r => r.id === activeRoomId);
    if (room) {
      await _loadBuddyCache(room.participants);
      _renderBuddyList('');
    }
  }
}

function _resetParticipantsPanel() {
  _ppSentInvites.clear();
  _ppBuddyCache = null;
  closeInvitePanel();
}

let _unloadListenerActive = false;

function _registerUnloadCleanup() {
  if (_unloadListenerActive) return;   
  _unloadListenerActive = true;

  
  window.addEventListener('pagehide', () => {
    if (!activeRoomId || !currentUser) return;

    
    
    
    const remaining = (_lastKnownParticipants || []).filter(
      e => e !== currentUser.email
    );

    const SUPABASE_URL  = 'https://ycvvwkpauakhdwhbgknj.supabase.co';
    const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdnZ3a3BhdWFraGR3aGJna25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzE3MzIsImV4cCI6MjA5MjU0NzczMn0.REtUh-gGQrirEVyFh06vQvHB8WaQ00aAbaSkzPBZOe0';

    if (remaining.length === 0) {
      
      fetch(
        `${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(activeRoomId)}`,
        {
          method:    'DELETE',
          keepalive: true,
          headers: {
            'apikey':        SUPABASE_ANON,
            'Authorization': `Bearer ${SUPABASE_ANON}`,
          },
        }
      ).catch(() => {});
    } else {
      
      fetch(
        `${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(activeRoomId)}`,
        {
          method:    'PATCH',
          keepalive: true,
          headers: {
            'apikey':        SUPABASE_ANON,
            'Authorization': `Bearer ${SUPABASE_ANON}`,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
          },
          body: JSON.stringify({ participants: remaining }),
        }
      ).catch(() => {});
    }
  });

  
  window.addEventListener('beforeunload', () => {
    if (!activeRoomId || !currentUser) return;
    
    leaveRoom(true).catch(() => {});
  });
}

let _lastKnownParticipants = [];

(async function init() {
  try { if (localStorage.getItem(STORAGE_NIGHT) === '1') toggleNightMode(); } catch (_) {}

  
  _registerUnloadCleanup();

  
  const hash = window.location.hash;
  if (hash && hash.startsWith('#post_') && currentUser) {
    await appNav('feed');
  }
})();

let _rwbInstance   = null;   
let _rwbPollTimer  = null;   
let _rwbLastData   = null;   

async function initRoomWhiteboard() {
  if (!activeRoomId || !currentUser) return;

  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);
  if (!room) return;

  const isHost   = room.hostEmail === currentUser.email;
  const hasAccess = isHost || (room.wbAccess || []).includes(currentUser.email);

  
  const hostBar  = document.getElementById('rwb-access-bar');
  const partBar  = document.getElementById('rwb-status-bar');
  if (hostBar) hostBar.style.display  = isHost ? 'flex' : 'none';
  if (partBar) partBar.style.display  = isHost ? 'none' : 'flex';

  if (!isHost) _rwbUpdateAccessBadge(hasAccess);
  if (isHost)  renderWbAccessPanel(room);

  
  const hostEl = document.getElementById('rwb-whiteboard-host');
  if (!hostEl) return;

  if (!_rwbInstance) {
    await new Promise(r => setTimeout(r, 40)); 
    _rwbInstance = StudyBuddyWhiteboard.create({
      containerId: 'rwb-whiteboard-host',
      noteId:      'room_' + activeRoomId,     
    });
  }

  
  _rwbInstance.setReadOnly(!hasAccess);

  
  await loadRoomWbCanvas();

  
  _rwbStopPoll();
  _rwbPollTimer = setInterval(_rwbPoll, 10000);
}

async function _rwbPoll() {
  if (!activeRoomId || !currentUser) return _rwbStopPoll();

  const rooms = await loadRooms();
  const room  = rooms.find(r => r.id === activeRoomId);
  if (!room) return _rwbStopPoll();

  const isHost    = room.hostEmail === currentUser.email;
  const hasAccess = isHost || (room.wbAccess || []).includes(currentUser.email);

  
  if (_rwbInstance) _rwbInstance.setReadOnly(!hasAccess);
  if (!isHost) _rwbUpdateAccessBadge(hasAccess);
  if (isHost)  renderWbAccessPanel(room);

  
  if (room.wbData && room.wbData !== _rwbLastData) {
    _rwbLastData = room.wbData;
    if (_rwbInstance) _rwbInstance.loadFromDataUrl(room.wbData);
  }
}

function _rwbStopPoll() {
  if (_rwbPollTimer) { clearInterval(_rwbPollTimer); _rwbPollTimer = null; }
}

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
}

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

    
    try { localStorage.setItem('sb_wb_' + noteId, dataUrl); } catch (_) {}

    
    if (Array.isArray(_npNotes)) {
      _npNotes.unshift(note);
      renderNotepadTree();
    }

    showToast(`📝 Whiteboard saved to Notepad as "${noteTitle}"`);
  } catch (err) {
    console.error('[saveWbToNotepad]', err);
  }
}

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

function destroyRoomWhiteboard() {
  _rwbStopPoll();
  if (_rwbInstance) { _rwbInstance.destroy(); _rwbInstance = null; }
  _rwbLastData = null;
}

async function loadPurchases() {
  const rows = await sbSelect('purchases');
  return rows.map(r => ({
    userEmail:  r.user_email,
    productId:  r.product_id,
    kind:       r.kind || 'product',
    price:      r.price || 0,
    createdAt:  r.created_at ? new Date(r.created_at).getTime() : 0,
  }));
}

let _bpActiveSection = null; 
let _bpProductCreator = null; 
let _bpQuizCreator    = null; 

async function initBackpackPage() {
  if (!currentUser) return;
  _bpActiveSection  = null;
  _bpProductCreator = null;
  _bpQuizCreator    = null;
  _bpRender();
}

function _bpRender() {
  const root = document.getElementById('bp-root');
  if (!root) return;

  if (!_bpActiveSection) { _bpRenderHome(root); return; }
  if (_bpActiveSection === 'products') {
    if (_bpProductCreator) _bpRenderProductList(root);
    else _bpRenderCreatorList(root, 'products');
    return;
  }
  if (_bpActiveSection === 'subscription') { _bpRenderSubscription(root); return; }
  if (_bpActiveSection === 'quizzes') {
    if (_bpQuizCreator) _bpRenderQuizList(root);
    else _bpRenderCreatorList(root, 'quizzes');
    return;
  }
  if (_bpActiveSection === 'saved') { _bpRenderSavedPosts(root); return; }
}

function _bpBreadcrumb(parts) {
  const backPart = parts.length > 1 ? parts[parts.length - 2] : null;
  return `<div class="bp-breadcrumb">
    ${backPart ? `<button class="bp-bc-back" onclick="${backPart.onclick}" aria-label="Back to ${escHtml(backPart.label)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>` : ''}
    <span class="bp-bc-sep">›</span>
    ${parts.map((p, i) => {
      const isLast = i === parts.length - 1;
      return isLast
        ? `<span class="bp-bc-cur">${escHtml(p.label)}</span>`
        : `<span class="bp-bc-link" onclick="${p.onclick}">${escHtml(p.label)}</span>
           <span class="bp-bc-sep">›</span>`;
    }).join('')}
  </div>`;
}

async function _bpRenderHome(root) {
  root.innerHTML = `<div class="bp-loading">Loading…</div>`;

  const [purchases, userSubs, quizzes, savedObj, products] = await Promise.all([
    loadPurchases(),
    loadUserSubs(),
    loadQuizzes(),
    loadSaved(),
    loadProducts(),
  ]);

  const myPurchases    = purchases.filter(p => p.userEmail === currentUser.email);
  
  const myActiveSubs       = userSubs.filter(s => s.userEmail === currentUser.email);
  const productIdSet   = new Set(products.map(p => p.id));
  const quizIdSet      = new Set(quizzes.map(q => q.id));

  
  const myProductPurchases = myPurchases.filter(pur => productIdSet.has(pur.productId));
  
  const paidQuizIds        = new Set(myPurchases.filter(pur => quizIdSet.has(pur.productId)).map(pur => pur.productId));
  const myQuizzes          = quizzes.filter(q => q.access === 'priced' && paidQuizIds.has(q.id));
  const savedCount         = Object.keys(savedObj).length;

  root.innerHTML = `
    <div class="bp-unified-hd">
      <div class="bp-unified-icon bpi-purple">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10H4V10z"/><path d="M9 6V5a3 3 0 0 1 6 0v1"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="9.5" y1="13.5" x2="14.5" y2="13.5"/></svg>
      </div>
      <div>
        <div class="bp-unified-ttl">My Backpack</div>
        <div class="bp-unified-sub">Your purchases, subscriptions, and saved content</div>
      </div>
    </div>
    <div class="bp-grid">
      <div class="bp-card" onclick="_bpNav('products')">
        <div class="bp-card-top">
          <div class="bp-card-icon bci-p"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg></div>
          <div class="bp-card-lbl">Paid Products</div>
        </div>
        <div class="bp-card-num">${myProductPurchases.length}</div>
        <div class="bp-card-unit">purchases</div>
        <div class="bp-card-footer">
          <div class="bp-card-desc">Notes, guides &amp; cheat sheets</div>
          <div class="bp-card-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
      </div>
      <div class="bp-card" onclick="_bpNav('subscription')">
        <div class="bp-card-top">
          <div class="bp-card-icon bci-s"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
          <div class="bp-card-lbl">My Subscription${myActiveSubs.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="bp-card-num">${myActiveSubs.length}</div>
        <div class="bp-card-unit">active</div>
        <div class="bp-card-footer">
          <div class="bp-card-desc">${myActiveSubs.length ? `${myActiveSubs.length} active plan${myActiveSubs.length !== 1 ? 's' : ''}` : 'No active subscriptions'}</div>
          <div class="bp-card-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
      </div>
      <div class="bp-card" onclick="_bpNav('quizzes')">
        <div class="bp-card-top">
          <div class="bp-card-icon bci-q"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
          <div class="bp-card-lbl">Paid Quizzes</div>
        </div>
        <div class="bp-card-num">${myQuizzes.length}</div>
        <div class="bp-card-unit">unlocked</div>
        <div class="bp-card-footer">
          <div class="bp-card-desc">Creator quizzes</div>
          <div class="bp-card-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
      </div>
      <div class="bp-card" onclick="_bpNav('saved')">
        <div class="bp-card-top">
          <div class="bp-card-icon bci-b"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></div>
          <div class="bp-card-lbl">Saved Posts</div>
        </div>
        <div class="bp-card-num">${savedCount}</div>
        <div class="bp-card-unit">bookmarked</div>
        <div class="bp-card-footer">
          <div class="bp-card-desc">Bookmarked feed posts</div>
          <div class="bp-card-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
      </div>
    </div>`;
}

function _bpNav(section, creatorEmail) {
  _bpActiveSection  = section || null;
  _bpProductCreator = (section === 'products' && creatorEmail) ? creatorEmail : null;
  _bpQuizCreator    = (section === 'quizzes'  && creatorEmail) ? creatorEmail : null;
  _bpRender();
}

async function _bpRenderCreatorList(root, mode) {
  root.innerHTML = `<div class="bp-loading">Loading…</div>`;

  const [purchases, products, accounts] = await Promise.all([
    loadPurchases(),
    loadProducts(),
    loadAccounts(),
  ]);

  const myPurchases = purchases.filter(p => p.userEmail === currentUser.email);

  
  let relevantItems;
  if (mode === 'quizzes') {
    const quizzes = await loadQuizzes();
    const paidQuizIds = new Set(myPurchases.map(p => p.productId));
    relevantItems = quizzes.filter(q => q.access === 'priced' && paidQuizIds.has(q.id));
  } else {
    relevantItems = products.filter(p => myPurchases.some(pur => pur.productId === p.id));
  }

  
  const byCreator = {};
  relevantItems.forEach(item => {
    if (!byCreator[item.creatorEmail]) byCreator[item.creatorEmail] = [];
    byCreator[item.creatorEmail].push(item);
  });

  const isProducts = mode === 'products';
  const title      = isProducts ? 'Paid Products' : 'Paid Quizzes';
  const iconColor  = isProducts ? 'bpi-purple' : 'bpi-amber';
  const iconSvg    = isProducts
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

  const creatorEmails = Object.keys(byCreator);

  root.innerHTML = `
    ${_bpBreadcrumb([
      { label: 'Backpack', onclick: "_bpNav(null)" },
      { label: title }
    ])}
    <div class="bp-unified-hd">
      <div class="bp-unified-icon ${iconColor}">${iconSvg}</div>
      <div>
        <div class="bp-unified-ttl">${escHtml(title)}</div>
        <div class="bp-unified-sub">${relevantItems.length} item${relevantItems.length !== 1 ? 's' : ''} from ${creatorEmails.length} creator${creatorEmails.length !== 1 ? 's' : ''} — click a creator to see their ${isProducts ? 'products' : 'quizzes'}</div>
      </div>
    </div>
    ${creatorEmails.length ? `<div class="bp-creator-list">
      ${creatorEmails.map(email => {
        const acc   = accounts.find(a => a.email === email);
        const name  = acc ? acc.name : email.split('@')[0];
        const init  = acc ? getInitials(acc) : (name[0] || '?').toUpperCase();
        const color = avatarColor(acc);
        const count = byCreator[email].length;
        const noun  = isProducts ? 'product' : 'quiz';
        return `<div class="bp-creator-row" onclick="_bpNav('${mode}', '${escHtml(email)}')">
          <div class="bp-creator-av" style="background:${color}">${escHtml(init)}</div>
          <div class="bp-creator-info">
            <div class="bp-creator-name">${escHtml(name)}<span class="bp-creator-badge">✦ Creator</span></div>
            <div class="bp-creator-meta">${escHtml(acc?.headline || 'Creator')}</div>
          </div>
          <span class="bp-count-chip">${count} ${noun}${count !== 1 ? 's' : ''}</span>
          <svg class="bp-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>`;
      }).join('')}
    </div>` : `<div class="bp-empty"><p>No ${isProducts ? 'products' : 'quizzes'} purchased yet.</p></div>`}`;
}

async function _bpRenderProductList(root) {
  root.innerHTML = `<div class="bp-loading">Loading…</div>`;

  const [purchases, products, accounts] = await Promise.all([
    loadPurchases(),
    loadProducts(),
    loadAccounts(),
  ]);

  const myPurchaseIds = new Set(purchases.filter(p => p.userEmail === currentUser.email).map(p => p.productId));
  const creatorProds  = products.filter(p => p.creatorEmail === _bpProductCreator && myPurchaseIds.has(p.id));
  const acc           = accounts.find(a => a.email === _bpProductCreator);
  const creatorName   = acc ? acc.name : _bpProductCreator.split('@')[0];
  const init          = acc ? getInitials(acc) : (creatorName[0] || '?').toUpperCase();
  const color         = avatarColor(acc);

  const VIEW_TYPES     = ['notes','guide','cheatsheet'];
  const OVERVIEW_TYPES = ['flashcards','slides','template'];
  const TYPE_ICONS     = { notes:'📄', guide:'📘', cheatsheet:'⚡', flashcards:'🗂️', slides:'🖥️', template:'📋' };

  root.innerHTML = `
    ${_bpBreadcrumb([
      { label: 'Backpack',       onclick: "_bpNav(null)" },
      { label: 'Paid Products',  onclick: "_bpNav('products')" },
      { label: creatorName }
    ])}
    <div class="bp-unified-hd">
      <div class="bp-creator-av" style="background:${color};width:44px;height:44px;border-radius:13px;font-size:.88rem;flex-shrink:0">${escHtml(init)}</div>
      <div>
        <div class="bp-unified-ttl">${escHtml(creatorName)}</div>
        <div class="bp-unified-sub">${creatorProds.length} purchased product${creatorProds.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
    <div class="bp-item-list">
      ${creatorProds.length ? creatorProds.map(p => {
        const ptype   = (p.type || 'notes').toLowerCase();
        const icon    = TYPE_ICONS[ptype] || '📦';
        const isFree  = !p.price || p.price === 0;
        const isView  = VIEW_TYPES.includes(ptype);
        const typeLabel = p.type ? p.type.charAt(0).toUpperCase() + p.type.slice(1) : 'Product';
        const actionBtn = isView
          ? `<button class="bp-item-btn bp-btn-view" onclick="bpOpenProduct('${escHtml(p.id)}')">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
               View
             </button>`
          : `<button class="bp-item-btn bp-btn-overview" onclick="bpOverviewProduct('${escHtml(p.id)}')">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
               Overview
             </button>`;
        const dlBtn = isView
          ? `<button class="bp-item-btn bp-btn-dl" onclick="bpDownloadProduct('${escHtml(p.id)}')" title="Download files">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
             </button>` : '';
        return `<div class="bp-item-row">
          <div class="bp-item-icon-wrap">${icon}</div>
          <div class="bp-item-body">
            <div class="bp-item-title">${escHtml(p.title || 'Untitled')}</div>
            <div class="bp-item-meta">${escHtml(typeLabel)}${p.attachedFiles?.length ? ' · ' + p.attachedFiles.length + ' file' + (p.attachedFiles.length !== 1 ? 's' : '') : ''}</div>
          </div>
          <span class="bp-item-badge ${isFree ? 'bib-free' : 'bib-paid'}">${isFree ? 'Free' : '₱' + p.price}</span>
          ${actionBtn}
          ${dlBtn}
        </div>`;
      }).join('') : '<div class="bp-empty"><p>No products found from this creator.</p></div>'}
    </div>`;
}

async function bpOpenProduct(productId) {
  const products = await loadProducts();
  const p        = products.find(prod => prod.id === productId);
  if (!p) { showToast('Product not found.'); return; }

  const files = p.attachedFiles || [];
  if (!files.length) { showToast('No files attached to this product yet.'); return; }

  
  if (files.length === 1) {
    _bpOpenFile(files[0], p.title);
  } else {
    _bpShowFilePicker(p);
  }
}

function _bpOpenFile(file, productTitle) {
  if (!file || !file.dataUrl) {
    showToast('File content is not available. Try re-attaching it from the creator hub.');
    return;
  }
  const win = window.open('', '_blank');
  if (!win) { showToast('Please allow popups to view this file.'); return; }

  const isPdf      = file.type === 'pdf'     || file.name?.match(/\.pdf$/i);
  const isNotepad  = file.type === 'notepad';
  const isTxt      = file.type === 'txt'     || file.name?.match(/\.txt$/i);

  if (isPdf) {
    
    win.document.write(`<html><head><title>${_bpEsc(productTitle || 'Product')}</title>
      <style>*{margin:0;padding:0}html,body{height:100%;overflow:hidden}</style>
      </head><body>
      <embed src="${file.dataUrl}" width="100%" height="100%" type="application/pdf" />
      </body></html>`);
  } else if (isNotepad) {
    
    win.document.open();
    
    try {
      const base64  = file.dataUrl.split(',')[1] || '';
      const decoded = decodeURIComponent(escape(atob(base64)));
      win.document.write(decoded);
    } catch (e) {
      
      const blob = _dataUrlToBlob(file.dataUrl);
      const url  = URL.createObjectURL(blob);
      win.location.href = url;
    }
    win.document.close();
  } else if (isTxt) {
    try {
      const base64  = file.dataUrl.split(',')[1] || '';
      const content = decodeURIComponent(escape(atob(base64)));
      win.document.write(`<html><head><title>${_bpEsc(productTitle || 'Product')}</title>
        <style>body{font-family:'Segoe UI',system-ui,sans-serif;padding:32px;max-width:800px;margin:0 auto;line-height:1.7;color:#071d2e}pre{white-space:pre-wrap;font-family:inherit}</style>
        </head><body><h2 style="margin-bottom:16px">${_bpEsc(productTitle || file.name || 'File')}</h2>
        <pre>${_bpEsc(content)}</pre></body></html>`);
      win.document.close();
    } catch (e) {
      win.location.href = file.dataUrl;
    }
  } else {
    
    win.location.href = file.dataUrl;
  }
}

function _bpEsc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mime  = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bytes = atob(data);
  const arr   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function _bpShowFilePicker(p) {
  const files = p.attachedFiles || [];
  const old   = document.getElementById('bp-file-picker-modal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id        = 'bp-file-picker-modal';
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:420px;text-align:left;padding:28px" onclick="event.stopPropagation()">
      <h3 class="modal-title" style="margin-bottom:14px">${escHtml(p.title || 'Product')}</h3>
      <p style="font-size:.84rem;color:var(--text-light);margin-bottom:16px">${files.length} file${files.length !== 1 ? 's' : ''} available — click to open</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${files.map((f, i) => `
          <button onclick="bpOpenFileByIdx('${escHtml(p.id)}',${i})" style="display:flex;align-items:center;gap:10px;padding:10px 13px;border:1.5px solid var(--border-input);border-radius:10px;background:var(--bg-card);cursor:pointer;text-align:left;font-family:var(--font-body);transition:border-color .15s">
            <span style="font-size:1rem">${f.type === 'pdf' ? '📄' : f.type === 'notepad' ? '📝' : '📃'}</span>
            <span style="font-size:.84rem;font-weight:600;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(f.name || 'File ' + (i+1))}</span>
          </button>`).join('')}
      </div>
      <div class="modal-actions" style="margin-top:16px">
        <button class="modal-cancel" onclick="document.getElementById('bp-file-picker-modal').remove()">Close</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

async function bpOpenFileByIdx(productId, idx) {
  const products = await loadProducts();
  const p = products.find(pr => pr.id === productId);
  if (!p) return;
  const file = (p.attachedFiles || [])[idx];
  if (!file) return;
  document.getElementById('bp-file-picker-modal')?.remove();
  _bpOpenFile(file, p.title);
}

async function bpDownloadProduct(productId) {
  const products = await loadProducts();
  const p        = products.find(pr => pr.id === productId);
  if (!p) return;

  const files = (p.attachedFiles || []).filter(f => f.dataUrl);
  if (!files.length) { showToast('No files attached to this product.'); return; }

  // Single file — download directly, no zip needed
  if (files.length === 1) {
    _bpTriggerFileDownload(files[0].dataUrl, files[0].name || 'file');
    showToast('⬇ Downloading file…');
    return;
  }

  // Multiple files — bundle into a zip named after the product title
  showToast('⏳ Preparing zip…');

  try {
    // Load JSZip from CDN if not already present
    if (typeof JSZip === 'undefined') {
      await _bpLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    }

    const zip      = new JSZip();
    const folderName = _bpSafeFileName(p.title || 'product');
    const folder   = zip.folder(folderName);

    // Track filenames to avoid collisions inside the zip
    const usedNames = {};
    files.forEach(f => {
      const base = _bpSafeFileName(f.name || 'file');
      usedNames[base] = (usedNames[base] || 0) + 1;
      const finalName = usedNames[base] > 1
        ? base.replace(/(\.[^.]+)$/, `_${usedNames[base]}$1`)
        : base;

      // dataUrl → binary: strip the header and decode base64
      const comma = f.dataUrl.indexOf(',');
      const b64   = comma !== -1 ? f.dataUrl.slice(comma + 1) : f.dataUrl;
      folder.file(finalName, b64, { base64: true });
    });

    const blob    = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const zipUrl  = URL.createObjectURL(blob);
    _bpTriggerFileDownload(zipUrl, folderName + '.zip');
    setTimeout(() => URL.revokeObjectURL(zipUrl), 5000);

    showToast(`⬇ Downloaded ${files.length} files as "${folderName}.zip"`);
  } catch (err) {
    console.error('bpDownloadProduct zip error:', err);
    showToast('Could not create zip. Please try again.');
  }
}

/* ── Trigger a single file download via a temporary <a> ── */
function _bpTriggerFileDownload(url, filename) {
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 300);
}

/* ── Load an external script and wait for it ── */
function _bpLoadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const s   = document.createElement('script');
    s.src     = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

/* ── Sanitise a string into a safe filename ── */
function _bpSafeFileName(str) {
  return String(str)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')   
    .replace(/\s+/g, '-')                      
    .replace(/-{2,}/g, '-')                    
    .replace(/^-|-$/g, '')                     
    .slice(0, 80)                              
    || 'product';
}

async function bpOverviewProduct(productId) {
  const products = await loadProducts();
  const p        = products.find(pr => pr.id === productId);
  if (!p) { showToast('Product not found.'); return; }

  const TYPE_ICONS = { notes:'📄', guide:'📘', cheatsheet:'⚡', flashcards:'🗂️', slides:'🖥️', template:'📋' };
  const icon       = TYPE_ICONS[(p.type || 'notes').toLowerCase()] || '📦';
  const isFree     = !p.price || p.price === 0;

  const old = document.getElementById('bp-overview-modal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id        = 'bp-overview-modal';
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:440px;text-align:left;padding:28px" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <span style="font-size:2rem">${icon}</span>
        <div>
          <h3 class="modal-title" style="margin-bottom:2px">${escHtml(p.title || 'Untitled')}</h3>
          <span style="font-size:.75rem;font-weight:700;padding:3px 10px;border-radius:20px;background:var(--accent);color:var(--brand-mid);border:1px solid var(--border-panel)">${escHtml(p.type || 'Product')}</span>
        </div>
      </div>
      <p style="font-size:.88rem;color:var(--text-light);line-height:1.65;margin-bottom:16px">${escHtml(p.description || 'No description provided.')}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">
        <span style="font-size:.75rem;font-weight:700;padding:4px 11px;border-radius:20px;background:${isFree ? '#f0fdf4' : '#eaf2f8'};color:${isFree ? '#16a34a' : '#0d2b42'};border:1px solid ${isFree ? '#86efac' : '#c0d9eb'}">${isFree ? 'Free' : '₱' + p.price}</span>
        ${p.subject ? `<span style="font-size:.75rem;font-weight:700;padding:4px 11px;border-radius:20px;background:var(--accent);color:var(--brand-mid);border:1px solid var(--border-panel)">${escHtml(p.subject)}</span>` : ''}
      </div>
      <div class="modal-actions">
        <button class="modal-cancel" onclick="document.getElementById('bp-overview-modal').remove()">Close</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

async function _bpRenderSubscription(root) {
  root.innerHTML = `<div class="bp-loading">Loading…</div>`;

  const [userSubs, accounts, products, quizzes] = await Promise.all([
    loadUserSubs(),
    loadAccounts(),
    loadProducts(),
    loadQuizzes(),
  ]);

  
  const mySubs = userSubs.filter(s => s.userEmail === currentUser.email);

  const subCardsHTML = mySubs.length
    ? (await Promise.all(mySubs.map(sub => _bpBuildSubCard(sub, accounts, products, quizzes)))).join('')
    : '';

  root.innerHTML = `
    ${_bpBreadcrumb([
      { label: 'Backpack', onclick: "_bpNav(null)" },
      { label: 'My Subscription' }
    ])}
    <div class="bp-unified-hd">
      <div class="bp-unified-icon bpi-green">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </div>
      <div>
        <div class="bp-unified-ttl">My Subscription${mySubs.length !== 1 ? 's' : ''}</div>
        <div class="bp-unified-sub">${mySubs.length ? `${mySubs.length} active plan${mySubs.length !== 1 ? 's' : ''} · manage and browse content` : 'Manage your active plans and browse all unlocked content'}</div>
      </div>
    </div>
    ${mySubs.length ? `<div style="display:flex;flex-direction:column;gap:16px">${subCardsHTML}</div>` : `
      <div class="bp-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <p>You don't have any active subscriptions yet.</p>
        <button class="bp-empty-btn" onclick="_bpNav(null);appNav('findbuddies')">Browse Creators</button>
      </div>`}`;
}

async function _bpBuildSubCard(sub, accounts, products, quizzes) {
  const acc          = accounts.find(a => a.email === sub.creatorEmail);
  const creatorName  = acc ? acc.name : sub.creatorEmail.split('@')[0];
  const init         = acc ? getInitials(acc) : (creatorName[0] || '?').toUpperCase();
  const color        = avatarColor(acc);
  const since        = sub.since ? new Date(sub.since).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

  // Fetch the plan detail
  const plan = await getCreatorSubscription(sub.creatorEmail);
  const planName = plan?.name || 'Subscription';

  // Get all products and quizzes from this creator (subscriber gets access to all)
  const creatorProds   = products.filter(p => p.creatorEmail === sub.creatorEmail);
  const creatorQuizzes = quizzes.filter(q => q.creatorEmail === sub.creatorEmail && q.access === 'subscription');
  const TYPE_ICONS     = { notes:'📄', guide:'📘', cheatsheet:'⚡', flashcards:'🗂️', slides:'🖥️', template:'📋' };

  const contentItems = [
    ...creatorProds.map(p => ({
      icon:  TYPE_ICONS[(p.type||'notes').toLowerCase()] || '📦',
      title: p.title || 'Untitled',
      meta:  (p.type || 'Product') + (p.attachedFiles?.length ? ` · ${p.attachedFiles.length} file${p.attachedFiles.length!==1?'s':''}` : ''),
      onclick: `bpOpenProduct('${escHtml(p.id)}')`,
      btnIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
    })),
    ...creatorQuizzes.map(q => ({
      icon:    '🧠',
      title:   q.title || 'Untitled Quiz',
      meta:    `Quiz · ${Array.isArray(q.questions) ? q.questions.length : 0} questions`,
      onclick: `bpTakeSubQuiz('${escHtml(q.id)}')`,
      btnIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    })),
  ];

  return `
    <div class="bp-sub-card">
      <div class="bp-sub-head">
        <div>
          <div class="bp-sub-name">${escHtml(planName)} ✦</div>
          <div class="bp-sub-price">₱${sub.price || 0}/mo · subscribed ${since}</div>
        </div>
        <button class="bp-sub-cancel-btn" onclick="bpCancelSubscription('${escHtml(sub.creatorEmail)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          Cancel subscription
        </button>
      </div>
      <div class="bp-sub-creator-row">
        <div class="bp-sub-av" style="background:${color}">${escHtml(init)}</div>
        <div style="flex:1">
          <div class="bp-sub-creator-name">${escHtml(creatorName)}</div>
          <div class="bp-sub-creator-badge">✦ Creator</div>
        </div>
        <button class="bp-item-btn bp-btn-view" style="font-size:.75rem;padding:6px 11px" onclick="openUserProfile('${escHtml(sub.creatorEmail)}')">View Profile</button>
      </div>
      <div class="bp-sub-content-lbl">All available content (${contentItems.length})</div>
      <div class="bp-sub-content-list">
        ${contentItems.length ? contentItems.map(item => `
          <div class="bp-sub-content-item" onclick="${item.onclick}">
            <div class="bp-sci-icon">${item.icon}</div>
            <div style="flex:1;min-width:0">
              <div class="bp-sci-title">${escHtml(item.title)}</div>
              <div class="bp-sci-meta">${escHtml(item.meta)}</div>
            </div>
            <button class="bp-sci-open" onclick="event.stopPropagation();${item.onclick}">${item.btnIcon}</button>
          </div>`).join('')
          : `<div class="bp-sub-empty">No content available yet from this creator.</div>`}
      </div>
    </div>`;
}

async function bpCancelSubscription(creatorEmail) {
  if (!confirm('Cancel your subscription? You will lose access to subscriber-only content.')) return;
  try {
    const { error } = await sb.from('user_subscriptions')
      .delete()
      .eq('user_email', currentUser.email)
      .eq('creator_email', creatorEmail);
    if (error) throw error;
    showToast('Subscription cancelled.');
    _bpRenderSubscription(document.getElementById('bp-root'));
  } catch (e) {
    console.error('bpCancelSubscription:', e);
    showToast('Could not cancel subscription. Please try again.');
  }
}

async function bpTakeSubQuiz(quizId) {
  const quizzes = await loadQuizzes();
  const quiz    = quizzes.find(q => q.id === quizId);
  if (!quiz) { showToast('Quiz not found.'); return; }
  if (typeof launchQuizPlayer === 'function') launchQuizPlayer(quiz, false);
  else if (typeof previewQuiz === 'function') previewQuiz(quizId);
}

/* ══════════════════════════════════════
   QUIZZES — item list for one creator
══════════════════════════════════════ */
async function _bpRenderQuizList(root) {
  root.innerHTML = `<div class="bp-loading">Loading…</div>`;

  const [purchases, quizzes, accounts] = await Promise.all([
    loadPurchases(),
    loadQuizzes(),
    loadAccounts(),
  ]);

  const myPurchaseIds = new Set(purchases.filter(p => p.userEmail === currentUser.email).map(p => p.productId));
  const creatorQuizzes = quizzes.filter(q => q.creatorEmail === _bpQuizCreator && q.access === 'priced' && myPurchaseIds.has(q.id));

  const acc         = accounts.find(a => a.email === _bpQuizCreator);
  const creatorName = acc ? acc.name : _bpQuizCreator.split('@')[0];
  const init        = acc ? getInitials(acc) : (creatorName[0] || '?').toUpperCase();
  const color       = avatarColor(acc);

  root.innerHTML = `
    ${_bpBreadcrumb([
      { label: 'Backpack',     onclick: "_bpNav(null)" },
      { label: 'Paid Quizzes', onclick: "_bpNav('quizzes')" },
      { label: creatorName }
    ])}
    <div class="bp-unified-hd">
      <div class="bp-creator-av" style="background:${color};width:44px;height:44px;border-radius:13px;font-size:.88rem;flex-shrink:0">${escHtml(init)}</div>
      <div>
        <div class="bp-unified-ttl">${escHtml(creatorName)}</div>
        <div class="bp-unified-sub">${creatorQuizzes.length} unlocked quiz${creatorQuizzes.length !== 1 ? 'zes' : ''}</div>
      </div>
    </div>
    <div class="bp-item-list">
      ${creatorQuizzes.length ? creatorQuizzes.map(q => {
        const qCount = Array.isArray(q.questions) ? q.questions.length : 0;
        const isFree = !q.price || q.price === 0;
        return `<div class="bp-item-row">
          <div class="bp-item-icon-wrap">🧠</div>
          <div class="bp-item-body">
            <div class="bp-item-title">${escHtml(q.title || 'Untitled Quiz')}</div>
            <div class="bp-item-meta">${qCount} question${qCount !== 1 ? 's' : ''}${q.subject ? ' · ' + escHtml(q.subject) : ''}</div>
          </div>
          <span class="bp-item-badge ${isFree ? 'bib-free' : 'bib-quiz'}">${isFree ? 'Free' : '₱' + q.price}</span>
          <button class="bp-item-btn bp-btn-play" onclick="bpTakeSubQuiz('${escHtml(q.id)}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Take Quiz
          </button>
        </div>`;
      }).join('') : '<div class="bp-empty"><p>No quizzes found from this creator.</p></div>'}
    </div>`;
}

/* ══════════════════════════════════════
   SAVED POSTS
══════════════════════════════════════ */
async function _bpRenderSavedPosts(root) {
  root.innerHTML = `<div class="bp-loading">Loading…</div>`;

  const [savedObj, allPosts, accounts] = await Promise.all([
    loadSaved(),
    loadPosts(),
    loadAccounts(),
  ]);

  await cacheCreators();

  const savedIds   = Object.keys(savedObj);
  const savedPosts = allPosts.filter(p => savedIds.includes(p.id))
                             .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  root.innerHTML = `
    ${_bpBreadcrumb([
      { label: 'Backpack', onclick: "_bpNav(null)" },
      { label: 'Saved Posts' }
    ])}
    <div class="bp-unified-hd">
      <div class="bp-unified-icon bpi-red">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </div>
      <div>
        <div class="bp-unified-ttl">Saved Posts</div>
        <div class="bp-unified-sub">${savedPosts.length} bookmarked post${savedPosts.length !== 1 ? 's' : ''} · click the bookmark to unsave</div>
      </div>
    </div>
    <div class="bp-saved-list" id="bp-saved-list">
      ${savedPosts.length
        ? savedPosts.map(p => _bpBuildSavedPostCard(p, accounts)).join('')
        : `<div class="bp-empty">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
             <p>No saved posts yet. Bookmark posts from your feed to find them here.</p>
           </div>`}
    </div>`;
}

function _bpBuildSavedPostCard(p, accounts) {
  const author   = accounts.find(a => a.email?.toLowerCase() === p.authorEmail?.toLowerCase());
  if (!author) return '';
  const name     = author.name || 'Unknown';
  const init     = getInitials(author);
  const color    = avatarColor(author);
  const headline = author.headline || 'Student';
  const timeStr  = formatTimeAgo(p.ts || p.timestamp);
  const tags     = Array.isArray(p.tags) ? p.tags : [];
  const likes    = Array.isArray(p.likes) ? p.likes : [];
  const likeCount = likes.length;

  const chips = [
    p.subject  ? `<span class="bp-sp-chip">📚 ${escHtml(p.subject)}</span>`  : '',
    p.schedule ? `<span class="bp-sp-chip">🕐 ${escHtml(p.schedule)}</span>` : '',
    p.location ? `<span class="bp-sp-chip">📍 ${escHtml(p.location)}</span>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="bp-sp-card" id="bp-sp-${escHtml(p.id)}">
      <div class="bp-sp-header">
        <div class="bp-sp-avatar" style="background:${color};cursor:pointer" onclick="openUserProfile('${escHtml(p.authorEmail)}')">${escHtml(init)}</div>
        <div class="bp-sp-author" style="cursor:pointer" onclick="openUserProfile('${escHtml(p.authorEmail)}')">
          <div class="bp-sp-author-name">${escHtml(name)}${getCreatorBadgeHTML(p.authorEmail)}</div>
          <div class="bp-sp-author-meta">${escHtml(headline)} · ${timeStr}</div>
        </div>
        <button class="bp-sp-unsave" title="Unsave post" onclick="bpUnsavePost('${escHtml(p.id)}')">
          <svg viewBox="0 0 24 24" fill="#2e6899" stroke="#2e6899" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
      <div class="bp-sp-body">${escHtml(p.body || '')}</div>
      ${chips ? `<div class="bp-sp-chips">${chips}</div>` : ''}
      <div class="bp-sp-actions">
        <button class="bp-sp-act-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          ${likeCount} like${likeCount !== 1 ? 's' : ''}
        </button>
        <button class="bp-sp-act-btn" onclick="appNav('feed');setTimeout(()=>scrollToPost('${escHtml(p.id)}'),120)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          View in feed
        </button>
      </div>
    </div>`;
}

async function bpUnsavePost(postId) {
  await toggleSavePost(postId);
  // Remove card from DOM immediately
  const card = document.getElementById('bp-sp-' + postId);
  if (card) {
    card.style.transition = 'opacity .2s, transform .2s';
    card.style.opacity    = '0';
    card.style.transform  = 'translateX(8px)';
    setTimeout(() => {
      card.remove();
      // Update the subtitle count
      const sub = document.querySelector('#bp-root .bp-page-sub');
      const remaining = document.querySelectorAll('#bp-saved-list .bp-sp-card').length;
      if (sub) sub.textContent = `${remaining} bookmarked post${remaining !== 1 ? 's' : ''} · click the bookmark to unsave`;
      if (!remaining) {
        const list = document.getElementById('bp-saved-list');
        if (list) list.innerHTML = `<div class="bp-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          <p>No saved posts yet.</p>
        </div>`;
      }
    }, 220);
  }
  showToast('Post removed from Backpack');
}


