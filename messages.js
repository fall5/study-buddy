/* ═══════════════════════════════════════════════════════════
   STUDY BUDDY — messages.js
   Full messaging system: conv list, chat view, send, search.

   Dependencies (globals from other files):
     app.js     → currentUser, AVATAR_COLORS, loadAccounts,
                  updateSidebarBadges, appNav, getInitials,
                  escHtml, showToast, formatShortTime, sb
   ═══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
let activeChatEmail  = null;

/* ══════════════════════════════════════
   IN-MEMORY CACHES
   _msgCache      — all messages for current user (invalidated on send/read)
   _accountCache  — accounts array (shared across pages, long-lived)
══════════════════════════════════════ */
let _msgCache     = null;   // null = stale
let _accountCache = null;   // null = stale

function _invalidateMsgCache()     { _msgCache = null; }
function _invalidateAccountCache() { _accountCache = null; }

async function _getMyMessages() {
  if (_msgCache) return _msgCache;
  if (!currentUser) return [];
  const { data, error } = await sb.from('messages')
    .select('*')
    .or(`from_email.eq.${currentUser.email},to_email.eq.${currentUser.email}`)
    .order('created_at', { ascending: true });
  if (error) { console.error('_getMyMessages:', error.message); return []; }
  _msgCache = data || [];
  return _msgCache;
}

async function _getAccounts() {
  if (_accountCache) return _accountCache;
  _accountCache = await loadAccounts();
  return _accountCache;
}

/* ══════════════════════════════════════
   SUPABASE HELPERS
══════════════════════════════════════ */

/* Load all messages for current user */
async function loadMyMessages() {
  return await _getMyMessages();
}

/* Send a message to Supabase */
async function sendMessageToDB(toEmail, text, type = 'text', attachment = null) {
  if (!currentUser || !toEmail || !text.trim()) return null;
  const { data, error } = await sb.from('messages').insert([{
    id:         'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    from_email: currentUser.email,
    to_email:   toEmail,
    text:       text.trim(),
    type,
    attachment,
    read:       false,
    created_at: new Date().toISOString(),
  }]).select().single();
  if (error) { console.error('sendMessageToDB:', error.message); return null; }
  return data;
}

/* Mark messages from partnerEmail as read — fire and forget */
async function markMessagesRead(partnerEmail) {
  if (!currentUser || !partnerEmail) return;
  // Update cache immediately so unread badges clear without waiting
  if (_msgCache) {
    _msgCache.forEach(m => {
      if (m.from_email === partnerEmail && m.to_email === currentUser.email) m.read = true;
    });
  }
  // DB write in background
  sb.from('messages')
    .update({ read: true })
    .eq('to_email', currentUser.email)
    .eq('from_email', partnerEmail)
    .eq('read', false);
}

/* Get unique conversation partners from cache */
async function getConversationPartners() {
  const msgs = await _getMyMessages();
  const seen = new Set();
  msgs.forEach(m => {
    const partner = m.from_email === currentUser.email ? m.to_email : m.from_email;
    seen.add(partner);
  });
  return [...seen];
}

/* Get messages between current user and one partner (from cache) */
async function getConversation(partnerEmail) {
  if (!currentUser || !partnerEmail) return [];
  const msgs = await _getMyMessages();
  return msgs.filter(m =>
    (m.from_email === currentUser.email && m.to_email === partnerEmail) ||
    (m.from_email === partnerEmail      && m.to_email === currentUser.email)
  );
}

/* Count unread messages from cache */
async function getUnreadCount() {
  if (!currentUser) return 0;
  const msgs = await _getMyMessages();
  return msgs.filter(m => m.to_email === currentUser.email && !m.read).length;
}

/* convId helper (kept for compat) */
function convId(emailA, emailB) {
  return [emailA, emailB].sort().join('::');
}

/* ══════════════════════════════════════
   PAGE INIT
══════════════════════════════════════ */
async function initMessagesPage() {
  activeChatEmail = null;
  // Warm both caches in parallel, then render
  _invalidateMsgCache();
  await Promise.all([_getMyMessages(), _getAccounts()]);
  await renderConvList();
  showChatEmpty();
}

/* ══════════════════════════════════════
   CONVERSATION LIST
   Uses both caches — zero extra DB calls after init.
══════════════════════════════════════ */
async function renderConvList() {
  const listEl = document.getElementById('conv-list-items');
  if (!listEl || !currentUser) return;

  // Load DMs, group chats, and accounts in parallel
  const [allMsgs, accounts, groupChats] = await Promise.all([
    _getMyMessages(),
    _getAccounts(),
    _getMyGroupChats(),
  ]);

  // ── Build DM conversations ──
  const partnerSet = new Set();
  allMsgs.forEach(m => {
    const partner = m.from_email === currentUser.email ? m.to_email : m.from_email;
    partnerSet.add(partner);
  });

  const dmConvs = [...partnerSet].map(partnerEmail => {
    const partnerMsgs = allMsgs.filter(m =>
      (m.from_email === currentUser.email && m.to_email === partnerEmail) ||
      (m.from_email === partnerEmail      && m.to_email === currentUser.email)
    );
    const last    = partnerMsgs[partnerMsgs.length - 1];
    const unread  = partnerMsgs.filter(m => m.to_email === currentUser.email && !m.read).length;
    const account = accounts.find(a => a.email === partnerEmail);
    return { type: 'dm', partnerEmail, last, unread, account,
             ts: last ? new Date(last.created_at).getTime() : 0 };
  });

  // ── Build group chat items ──
  const gcConvs = groupChats.map(gc => ({
    type: 'group',
    gc,
    ts:   gc.created_at ? new Date(gc.created_at).getTime() : 0,
  }));

  // ── Merge and sort by most recent ──
  const allConvs = [...dmConvs, ...gcConvs].sort((a, b) => b.ts - a.ts);

  if (!allConvs.length) {
    listEl.innerHTML = `<div class="conv-empty">No conversations yet.<br>Connect with a study buddy to start chatting!</div>`;
    return;
  }

  listEl.innerHTML = allConvs.map(cv => {
    if (cv.type === 'group') {
      const gc       = cv.gc;
      const isActive = gc.id === activeGroupChatId;
      const mCount   = (gc.members || []).length;
      return `
      <div class="conv-item conv-group-item ${isActive ? 'active' : ''}" id="gc-conv-${escHtml(gc.id)}"
           onclick="openGroupChat('${escHtml(gc.id)}')">
        <div class="conv-avatar conv-group-avatar">👥</div>
        <div class="conv-info">
          <div class="conv-name-row">
            <span class="conv-name">${escHtml(gc.name || 'Study Group')}</span>
            <span class="conv-group-badge">${mCount} members</span>
          </div>
          <div class="conv-preview-row">
            <span class="conv-preview">Group chat · ${gc.host_email === currentUser.email ? 'You host' : 'Joined'}</span>
          </div>
        </div>
      </div>`;
    }

    // DM
    const name     = cv.account ? cv.account.name : cv.partnerEmail;
    const init     = cv.account ? getInitials(cv.account) : '?';
    const color    = cv.account ? (cv.account.avatarColor || AVATAR_COLORS[0]) : AVATAR_COLORS[0];
    const preview  = cv.last ? (cv.last.text || '📎 Attachment').slice(0, 42) : '';
    const time     = cv.last ? formatShortTime(new Date(cv.last.created_at).getTime()) : '';
    const isActive = cv.partnerEmail === activeChatEmail;
    return `
    <div class="conv-item ${isActive ? 'active' : ''}" id="conv-${escHtml(cv.partnerEmail)}"
         onclick="openChat('${escHtml(cv.partnerEmail)}')">
      <div class="conv-avatar" style="background:${color}">${escHtml(init)}</div>
      <div class="conv-info">
        <div class="conv-name-row">
          <span class="conv-name">${escHtml(name)}</span>
          <span class="conv-time">${escHtml(time)}</span>
        </div>
        <div class="conv-preview-row">
          <span class="conv-preview">${escHtml(preview)}</span>
          ${cv.unread ? `<span class="conv-unread-badge">${cv.unread}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════
   OPEN CHAT
   Optimistic: header renders immediately from account cache,
   then messages load. markMessagesRead is fire-and-forget.
══════════════════════════════════════ */
async function openChat(partnerEmail) {
  if (!currentUser || !partnerEmail) return;
  activeChatEmail   = partnerEmail;
  activeGroupChatId = null;   // clear any open group chat

  // Reset send button back to DM mode
  const sendBtn = document.querySelector('.chat-send-btn');
  if (sendBtn) sendBtn.setAttribute('onclick', 'sendMessage()');
  const input = document.getElementById('chat-input');
  if (input) {
    input.setAttribute('onkeydown', "if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage();}");
    input.placeholder = 'Type a message…';
  }

  // Hide group settings, show profile button
  const settingsPanel = document.getElementById('group-settings-panel');
  if (settingsPanel) settingsPanel.style.display = 'none';
  _groupSettingsOpen = false;
  _activeGroupData   = null;
  const profileBtn   = document.getElementById('chat-profile-btn');
  const settingsBtn  = document.getElementById('chat-settings-btn');
  if (profileBtn)  profileBtn.style.display  = 'flex';
  if (settingsBtn) settingsBtn.style.display = 'none';

  // ── 1. Instant UI feedback — mark active, show panel ──
  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
  const convEl = document.getElementById('conv-' + partnerEmail);
  if (convEl) convEl.classList.add('active');

  const empty  = document.getElementById('chat-empty');
  const active = document.getElementById('chat-active');
  if (empty)  empty.style.display  = 'none';
  if (active) active.style.display = 'flex';

  // ── 2. Populate header from cache (no DB call) ──
  const accounts = await _getAccounts();
  const partner  = accounts.find(a => a.email === partnerEmail);
  const name     = partner ? partner.name : partnerEmail;
  const init     = partner ? getInitials(partner) : '?';
  const color    = partner ? (partner.avatarColor || AVATAR_COLORS[0]) : AVATAR_COLORS[0];

  const headerAvatar = document.getElementById('chat-header-avatar');
  const headerName   = document.getElementById('chat-header-name');
  if (headerAvatar) { headerAvatar.textContent = init; headerAvatar.style.background = color; }
  if (headerName)   headerName.textContent = name;

  // ── 3. Render messages from cache, mark read, update badges in parallel ──
  await renderChatMessages(partnerEmail);
  markMessagesRead(partnerEmail);          // fire and forget — updates cache + DB in bg
  updateSidebarBadges();                   // fire and forget

  // Update conv list unread badges in-place (no full re-render)
  if (convEl) {
    const badge = convEl.querySelector('.conv-unread-badge');
    if (badge) badge.remove();
  }

  const chatInput = document.getElementById('chat-input');
  if (chatInput) chatInput.focus();
}

/* ══════════════════════════════════════
   RENDER CHAT MESSAGES
   Reads from cache — no extra DB call if already loaded.
══════════════════════════════════════ */
async function renderChatMessages(partnerEmail) {
  const container = document.getElementById('chat-messages');
  if (!container || !currentUser) return;

  // Both from cache
  const [msgs, accounts] = await Promise.all([
    getConversation(partnerEmail),
    _getAccounts(),
  ]);

  if (!msgs.length) {
    const partner = accounts.find(a => a.email === partnerEmail);
    const name    = partner ? partner.name : partnerEmail;
    container.innerHTML = `<div class="chat-start-msg">This is the beginning of your conversation with <strong>${escHtml(name)}</strong>. Say hello! 👋</div>`;
    return;
  }

  let lastDate = '';
  const parts  = [];

  msgs.forEach(m => {
    const ts      = new Date(m.created_at).getTime();
    const dateStr = new Date(m.created_at).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    const isToday = dateStr === new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    const isYest  = dateStr === new Date(Date.now() - 86400000).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });

    if (dateStr !== lastDate) {
      lastDate = dateStr;
      const label = isToday ? 'Today' : isYest ? 'Yesterday' : dateStr;
      parts.push(`<div class="chat-date-divider">${escHtml(label)}</div>`);
    }

    const mine  = m.from_email === currentUser.email;
    const u     = accounts.find(a => a.email === m.from_email);
    const uInit = u ? getInitials(u) : '?';
    const uColor = u ? (u.avatarColor || AVATAR_COLORS[0]) : AVATAR_COLORS[0];
    const time  = formatShortTime(ts);

    parts.push(`
    <div class="chat-msg ${mine ? 'mine' : 'theirs'}">
      ${!mine ? `<div class="chat-msg-avatar" style="background:${uColor}">${escHtml(uInit)}</div>` : ''}
      <div class="chat-msg-body">
        <div class="chat-bubble">${escHtml(m.text || '')}</div>
        <div class="chat-msg-time">${escHtml(time)}</div>
      </div>
    </div>`);
  });

  container.innerHTML = parts.join('');
  container.scrollTop = container.scrollHeight;
}

/* ══════════════════════════════════════
   SEND CHAT MESSAGE
   Optimistic: bubble appears instantly, DB write in background.
══════════════════════════════════════ */
async function sendChatMessage() {
  if (!currentUser || !activeChatEmail) return;
  const input = document.getElementById('chat-input');
  const text  = (input ? input.value : '').trim();
  if (!text) return;

  // ── 1. Clear input immediately ──
  if (input) input.value = '';

  // ── 2. Build message object ──
  const now = new Date().toISOString();
  const optimisticMsg = {
    id:         'msg_' + Date.now() + '_local',
    from_email: currentUser.email,
    to_email:   activeChatEmail,
    text,
    type:       'text',
    attachment: null,
    read:       false,
    created_at: now,
  };

  // ── 3. Inject into cache and render bubble immediately ──
  if (_msgCache) _msgCache.push(optimisticMsg);
  await renderChatMessages(activeChatEmail);

  // Update conv list preview in-place (no full re-render)
  _updateConvPreview(activeChatEmail, text, now);

  // ── 4. Persist to DB in background ──
  sendMessageToDB(activeChatEmail, text).then(saved => {
    if (!saved) {
      // DB failed — remove optimistic msg from cache and show error
      if (_msgCache) {
        const idx = _msgCache.findIndex(m => m.id === optimisticMsg.id);
        if (idx !== -1) _msgCache.splice(idx, 1);
      }
      renderChatMessages(activeChatEmail);
      showToast('Failed to send message. Please try again.');
      return;
    }
    // Replace optimistic msg with the real DB record
    if (_msgCache) {
      const idx = _msgCache.findIndex(m => m.id === optimisticMsg.id);
      if (idx !== -1) _msgCache[idx] = saved;
    }
  });
}

/* Update the conv list preview text in-place without re-rendering the whole list */
function _updateConvPreview(partnerEmail, text, isoTime) {
  const convEl = document.getElementById('conv-' + partnerEmail);
  if (!convEl) return;
  const previewEl = convEl.querySelector('.conv-preview');
  const timeEl    = convEl.querySelector('.conv-time');
  if (previewEl) previewEl.textContent = text.slice(0, 42);
  if (timeEl)    timeEl.textContent    = formatShortTime(new Date(isoTime).getTime());
  // Bubble the conversation to the top of the list
  const list = convEl.parentElement;
  if (list && list.firstChild !== convEl) list.prepend(convEl);
}

/* ══════════════════════════════════════
   SHOW EMPTY STATE
══════════════════════════════════════ */
function showChatEmpty() {
  const empty  = document.getElementById('chat-empty');
  const active = document.getElementById('chat-active');
  if (empty)  empty.style.display  = '';
  if (active) active.style.display = 'none';
  activeChatEmail = null;
}

/* ══════════════════════════════════════
   FILTER CONVERSATION LIST
   Pure DOM — no DB calls at all.
══════════════════════════════════════ */
function filterConversations(query) {
  const items = document.querySelectorAll('.conv-item');
  const q     = (query || '').toLowerCase().trim();
  items.forEach(el => {
    const name = (el.querySelector('.conv-name')?.textContent    || '').toLowerCase();
    const prev = (el.querySelector('.conv-preview')?.textContent || '').toLowerCase();
    el.style.display = (!q || name.includes(q) || prev.includes(q)) ? '' : 'none';
  });
}

/* ══════════════════════════════════════
   BADGE HELPERS
══════════════════════════════════════ */
async function clearChatBadge() {
  const badge = document.getElementById('msg-badge');
  if (badge) badge.style.display = 'none';
}

async function bumpChatBadge() {
  const count = await getUnreadCount();
  const badge = document.getElementById('msg-badge');
  if (!badge) return;
  if (count > 0) { badge.textContent = count > 9 ? '9+' : String(count); badge.style.display = ''; }
  else badge.style.display = 'none';
}

/* ══════════════════════════════════════
   NAVIGATION HELPERS
══════════════════════════════════════ */
async function openMessagesWith(partnerEmail) {
  if (!currentUser) return;
  await appNav('messages');
  if (partnerEmail) await openChat(partnerEmail);
}

async function goToChat(partnerEmail) {
  await appNav('messages');
  if (partnerEmail) await openChat(partnerEmail);
}

/* kept for compat */
async function messageViewing() {}
async function openChatUserProfile(email) {}

/* ══════════════════════════════════════
   GROUP CHATS — STATE
══════════════════════════════════════ */
let activeGroupChatId = null;
let _groupChatCache   = null;

function _invalidateGroupCache() { _groupChatCache = null; }

async function _getMyGroupChats() {
  if (_groupChatCache) return _groupChatCache;
  if (!currentUser) return [];
  const { data, error } = await sb.from('group_chats').select('*');
  if (error) { console.error('_getMyGroupChats:', error.message); return []; }
  // Filter to groups where current user is a member
  _groupChatCache = (data || []).filter(g => Array.isArray(g.members) && g.members.includes(currentUser.email));
  return _groupChatCache;
}

/* ── Load group chat messages ── */
async function getGroupMessages(groupChatId) {
  const { data, error } = await sb.from('group_messages')
    .select('*')
    .eq('group_chat_id', groupChatId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getGroupMessages:', error.message); return []; }
  return data || [];
}

/* ── Send a group message ── */
async function sendGroupMessageToDB(groupChatId, text) {
  if (!currentUser || !text.trim()) return null;
  const { data, error } = await sb.from('group_messages').insert([{
    id:            'gm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    group_chat_id: groupChatId,
    from_email:    currentUser.email,
    text:          text.trim(),
    created_at:    new Date().toISOString(),
  }]).select().single();
  if (error) { console.error('sendGroupMessageToDB:', error.message); return null; }
  return data;
}

/* ══════════════════════════════════════
   OPEN GROUP CHAT
══════════════════════════════════════ */
let _activeGroupData = null;  // cached group chat object for settings panel

async function openGroupChat(groupChatId) {
  if (!currentUser || !groupChatId) return;
  activeGroupChatId = groupChatId;
  activeChatEmail   = null;   // clear DM state

  // Mark conv items
  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
  const convEl = document.getElementById('gc-conv-' + groupChatId);
  if (convEl) convEl.classList.add('active');

  const empty  = document.getElementById('chat-empty');
  const active = document.getElementById('chat-active');
  if (empty)  empty.style.display  = 'none';
  if (active) active.style.display = 'flex';

  // Close settings panel if open from a previous chat
  const settingsPanel = document.getElementById('group-settings-panel');
  if (settingsPanel) settingsPanel.style.display = 'none';

  // Load group info
  const { data: gc } = await sb.from('group_chats').select('*').eq('id', groupChatId).single();
  _activeGroupData = gc || null;
  const name        = gc ? gc.name : 'Group Chat';
  const memberCount = gc ? (gc.members || []).length : 0;
  const isHost      = gc && gc.host_email === currentUser.email;

  const headerAvatar   = document.getElementById('chat-header-avatar');
  const headerName     = document.getElementById('chat-header-name');
  const headerStatus   = document.getElementById('chat-header-status');
  const profileBtn     = document.getElementById('chat-profile-btn');
  const settingsBtn    = document.getElementById('chat-settings-btn');

  if (headerAvatar) {
    headerAvatar.textContent      = '👥';
    headerAvatar.style.background = 'linear-gradient(135deg,#7c3aed,#a78bfa)';
    headerAvatar.style.fontSize   = '1.1rem';
  }
  if (headerName)   headerName.textContent   = escHtml(name);
  if (headerStatus) headerStatus.textContent = `${memberCount} member${memberCount !== 1 ? 's' : ''}`;

  // Show settings gear, hide profile button (no single profile for groups)
  if (profileBtn)  profileBtn.style.display  = 'none';
  if (settingsBtn) settingsBtn.style.display = 'flex';

  // Switch input to group mode
  const sendBtn = document.querySelector('.chat-send-btn');
  if (sendBtn) sendBtn.setAttribute('onclick', 'sendGroupChatMessage()');
  const input = document.getElementById('chat-input');
  if (input) {
    input.setAttribute('onkeydown', "if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendGroupChatMessage();}");
    input.placeholder = 'Message group…';
    input.focus();
  }

  await renderGroupMessages(groupChatId);
}

/* ══════════════════════════════════════
   GROUP SETTINGS PANEL
   Toggle slide-down panel with rename + members list.
══════════════════════════════════════ */
let _groupSettingsOpen = false;

async function toggleGroupSettings() {
  const panel = document.getElementById('group-settings-panel');
  if (!panel) return;

  _groupSettingsOpen = !_groupSettingsOpen;
  panel.style.display = _groupSettingsOpen ? 'block' : 'none';

  if (!_groupSettingsOpen || !_activeGroupData) return;

  // Pre-fill rename input with current name
  const renameInput = document.getElementById('group-rename-input');
  if (renameInput) renameInput.value = _activeGroupData.name || '';

  // Render members list
  const membersList = document.getElementById('group-members-list');
  if (!membersList) return;

  const members  = _activeGroupData.members || [];
  if (!members.length) { membersList.innerHTML = '<div class="group-settings-empty">No members yet.</div>'; return; }

  const accounts = typeof loadAccounts === 'function' ? await loadAccounts() : [];

  membersList.innerHTML = members.map(email => {
    const acc   = accounts.find(a => a.email === email);
    const name  = acc ? escHtml(acc.name) : escHtml(email);
    const init  = acc ? escHtml(getInitials(acc)) : '?';
    const color = acc ? (acc.avatarColor || AVATAR_COLORS[0]) : AVATAR_COLORS[0];
    const isHost = email === _activeGroupData.host_email;
    return `
    <div class="group-member-row">
      <div class="group-member-avatar" style="background:${color}">${init}</div>
      <div class="group-member-name">${name}${isHost ? ' <span class="group-host-tag">Host</span>' : ''}</div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════
   RENAME GROUP CHAT
══════════════════════════════════════ */
async function renameGroupChat() {
  if (!currentUser || !activeGroupChatId || !_activeGroupData) return;
  const input   = document.getElementById('group-rename-input');
  const newName = (input ? input.value.trim() : '');
  if (!newName || newName === _activeGroupData.name) return;

  const btn = document.querySelector('.group-rename-btn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  await sbUpsert('group_chats', { id: activeGroupChatId, name: newName }, 'id');

  // Update in-memory cache and UI
  _activeGroupData.name = newName;
  _invalidateGroupCache();

  const headerName = document.getElementById('chat-header-name');
  if (headerName) headerName.textContent = escHtml(newName);

  // Update conv list item name in-place
  const convEl = document.getElementById('gc-conv-' + activeGroupChatId);
  if (convEl) {
    const nameEl = convEl.querySelector('.conv-name');
    if (nameEl) nameEl.textContent = escHtml(newName);
  }

  if (btn) { btn.textContent = 'Saved!'; btn.disabled = false; setTimeout(() => { btn.textContent = 'Save'; }, 1500); }
  showToast('Group renamed!');
}

/* ══════════════════════════════════════
   RENDER GROUP MESSAGES
══════════════════════════════════════ */
async function renderGroupMessages(groupChatId) {
  const container = document.getElementById('chat-messages');
  if (!container || !currentUser) return;

  const [msgs, accounts] = await Promise.all([
    getGroupMessages(groupChatId),
    _getAccounts(),
  ]);

  if (!msgs.length) {
    container.innerHTML = `<div class="chat-start-msg">This is the beginning of your group chat. Say hello! 👋</div>`;
    return;
  }

  let lastDate = '';
  const parts  = [];

  msgs.forEach(m => {
    const ts      = new Date(m.created_at).getTime();
    const dateStr = new Date(m.created_at).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    const isToday = dateStr === new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    const isYest  = dateStr === new Date(Date.now() - 86400000).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });

    if (dateStr !== lastDate) {
      lastDate = dateStr;
      const label = isToday ? 'Today' : isYest ? 'Yesterday' : dateStr;
      parts.push(`<div class="chat-date-divider">${escHtml(label)}</div>`);
    }

    const mine   = m.from_email === currentUser.email;
    const u      = accounts.find(a => a.email === m.from_email);
    const uInit  = u ? getInitials(u) : '?';
    const uColor = u ? (u.avatarColor || AVATAR_COLORS[0]) : AVATAR_COLORS[0];
    const uName  = u ? u.name : m.from_email;
    const time   = formatShortTime(ts);

    parts.push(`
    <div class="chat-msg ${mine ? 'mine' : 'theirs'}">
      ${!mine ? `<div class="chat-msg-avatar" style="background:${uColor}">${escHtml(uInit)}</div>` : ''}
      <div class="chat-msg-body">
        ${!mine ? `<div class="chat-msg-sender">${escHtml(uName)}</div>` : ''}
        <div class="chat-bubble">${escHtml(m.text || '')}</div>
        <div class="chat-msg-time">${escHtml(time)}</div>
      </div>
    </div>`);
  });

  container.innerHTML = parts.join('');
  container.scrollTop = container.scrollHeight;
}

/* ══════════════════════════════════════
   SEND GROUP CHAT MESSAGE
══════════════════════════════════════ */
async function sendGroupChatMessage() {
  if (!currentUser || !activeGroupChatId) return;
  const input = document.getElementById('chat-input');
  const text  = (input ? input.value : '').trim();
  if (!text) return;

  if (input) input.value = '';

  const optimistic = {
    id:            'gm_' + Date.now() + '_local',
    group_chat_id: activeGroupChatId,
    from_email:    currentUser.email,
    text,
    created_at:    new Date().toISOString(),
  };

  // Render immediately
  const container = document.getElementById('chat-messages');
  if (container) {
    const mine = true;
    const time = formatShortTime(Date.now());
    container.insertAdjacentHTML('beforeend', `
      <div class="chat-msg mine">
        <div class="chat-msg-body">
          <div class="chat-bubble">${escHtml(text)}</div>
          <div class="chat-msg-time">${escHtml(time)}</div>
        </div>
      </div>`);
    container.scrollTop = container.scrollHeight;
  }

  sendGroupMessageToDB(activeGroupChatId, text);
}

/* ══════════════════════════════════════
   GROUP PICKER MODAL
   Opened from "New Group" button in sidebar.
══════════════════════════════════════ */
let _groupPickerSelected = new Set();

async function openGroupPickerModal(postId = null) {
  if (!currentUser) return;
  _groupPickerSelected = new Set();

  const modal = document.getElementById('group-picker-modal');
  if (modal) modal.classList.add('open');

  // Load connected buddies
  const [allMatches, accounts] = await Promise.all([
    loadMatches ? loadMatches() : [],
    _getAccounts(),
  ]);

  const connectedEmails = allMatches
    .filter(m => m.status === 'accepted' && (m.from === currentUser.email || m.to === currentUser.email))
    .map(m => m.from === currentUser.email ? m.to : m.from);

  const buddies = accounts.filter(a => connectedEmails.includes(a.email));

  _renderGroupPickerList(buddies);
  _updateGroupPickerSelected(accounts);
  _updateGroupCreateBtn();
}

function _renderGroupPickerList(buddies, filterQ = '') {
  const list = document.getElementById('group-picker-list');
  if (!list) return;

  const filtered = filterQ
    ? buddies.filter(b => b.name.toLowerCase().includes(filterQ.toLowerCase()))
    : buddies;

  if (!filtered.length) {
    list.innerHTML = `<div class="group-picker-empty">No connected buddies found. Connect with someone first!</div>`;
    return;
  }

  list.innerHTML = filtered.map(b => {
    const init  = getInitials(b);
    const color = b.avatarColor || AVATAR_COLORS[0];
    const sel   = _groupPickerSelected.has(b.email);
    return `
    <div class="group-picker-item ${sel ? 'selected' : ''}" id="gpi-${escHtml(b.email)}"
         onclick="toggleGroupPickerBuddy('${escHtml(b.email)}', this)">
      <div class="group-picker-avatar" style="background:${color}">${escHtml(init)}</div>
      <div class="group-picker-name">${escHtml(b.name)}</div>
      <div class="group-picker-check ${sel ? 'checked' : ''}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
    </div>`;
  }).join('');
}

function toggleGroupPickerBuddy(email, el) {
  if (_groupPickerSelected.has(email)) {
    _groupPickerSelected.delete(email);
    el.classList.remove('selected');
    el.querySelector('.group-picker-check')?.classList.remove('checked');
  } else {
    _groupPickerSelected.add(email);
    el.classList.add('selected');
    el.querySelector('.group-picker-check')?.classList.add('checked');
  }
  _getAccounts().then(accounts => _updateGroupPickerSelected(accounts));
  _updateGroupCreateBtn();
}

function _updateGroupPickerSelected(accounts) {
  const wrap = document.getElementById('group-picker-selected');
  if (!wrap) return;
  if (!_groupPickerSelected.size) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = [..._groupPickerSelected].map(email => {
    const acc = accounts.find(a => a.email === email);
    const name = acc ? acc.name.split(' ')[0] : email;
    return `<span class="group-selected-chip">${escHtml(name)}
      <button onclick="toggleGroupPickerBuddy('${escHtml(email)}', document.getElementById('gpi-${escHtml(email)}'))">✕</button>
    </span>`;
  }).join('');
}

function _updateGroupCreateBtn() {
  const btn = document.getElementById('group-create-btn');
  if (btn) btn.disabled = _groupPickerSelected.size === 0;
}

async function filterGroupPickerList(q) {
  const accounts = await _getAccounts();
  const [allMatches] = await Promise.all([ loadMatches ? loadMatches() : [] ]);
  const connectedEmails = allMatches
    .filter(m => m.status === 'accepted' && (m.from === currentUser.email || m.to === currentUser.email))
    .map(m => m.from === currentUser.email ? m.to : m.from);
  const buddies = accounts.filter(a => connectedEmails.includes(a.email));
  _renderGroupPickerList(buddies, q);
}

function closeGroupPickerModal(e) {
  if (e && e.target !== document.getElementById('group-picker-modal')) return;
  document.getElementById('group-picker-modal')?.classList.remove('open');
}

async function createGroupChat() {
  if (!currentUser || !_groupPickerSelected.size) return;

  const nameInput = document.getElementById('group-chat-name');
  const name = (nameInput ? nameInput.value.trim() : '') || 'Study Group';

  const gcId = 'gc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const members = [currentUser.email, ..._groupPickerSelected];

  await sbUpsert('group_chats', {
    id:         gcId,
    post_id:    null,
    name,
    host_email: currentUser.email,
    members,
    created_at: new Date().toISOString(),
  }, 'id');

  document.getElementById('group-picker-modal')?.classList.remove('open');
  if (nameInput) nameInput.value = '';
  _groupPickerSelected = new Set();

  _invalidateGroupCache();
  showToast(`Group "${escHtml(name)}" created!`);
  await renderConvList();
  await openGroupChat(gcId);
}

