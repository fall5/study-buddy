/* ═══════════════════════════════════════════════════════════
   STUDY BUDDY — messages.js
   Full messaging system: conv list, chat view, send, search.

   Dependencies (globals from other files):
     app.js     → currentUser, AVATAR_COLORS, loadAccounts,
                  updateSidebarBadges, appNav, getInitials,
                  escHtml, showToast, formatShortTime, sb,
                  sbUpsert, sbDelete, sbDeleteWhere, loadMatches
   ═══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
let activeChatEmail  = null;



let _dmChannel   = null;
let _gcChannel   = null;
let _subscribing = false;

/* ══════════════════════════════════════
   PHASE 4: MOBILE PANEL TOGGLE FUNCTIONS
══════════════════════════════════════ */
function _showChatPanelMobile() {
  if (window.innerWidth >= 640) return;  // Desktop, don't toggle
  const chatPanel = document.querySelector('.chat-panel');
  if (chatPanel) {
    chatPanel.classList.add('active');
  }
}

function _hideChatPanelMobile() {
  if (window.innerWidth >= 640) return;  // Desktop, don't toggle
  const chatPanel = document.querySelector('.chat-panel');
  if (chatPanel) {
    chatPanel.classList.remove('active');
  }
}

/* ══════════════════════════════════════
   PHASE 4: BACK BUTTON INITIALIZATION
══════════════════════════════════════ */
function initBackButton() {
  const backBtn = document.querySelector('.chat-header-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      _hideChatPanelMobile();
    });
  }
}

function subscribeToMessages() {
  if (_subscribing) {
    console.warn('[Messages] subscribeToMessages called while already subscribing — skipped.');
    return;
  }
  _subscribing = true;

  if (_dmChannel) { sb.removeChannel(_dmChannel); _dmChannel = null; }

  _dmChannel = sb.channel('dm-inbox-' + currentUser.email + '-' + Date.now())
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'messages',
    }, payload => _onIncomingDM(payload.new))
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'group_chats',
    }, payload => _onGroupChatUpdated(payload.new))
    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'group_chats',
    }, payload => _onGroupChatUpdated(payload.new))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Messages] DM channel subscribed');
        _subscribing = false;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Messages] DM channel error:', status);
        _subscribing = false;
      }
    });
}

/* Fires on every group_chats UPDATE (member added/removed, rename, etc).
   Checks if this user is in the new members list and refreshes accordingly. */
async function _onGroupChatUpdated(gc) {
  if (!currentUser || !gc) return;
  const members = gc.members || [];
  const isMember = members.includes(currentUser.email);

  /* Always invalidate so the next renderConvList fetch is fresh */
  _invalidateGroupCache();

  if (!isMember) {
    /* User was removed — if they're viewing this group, eject them */
    if (activeGroupChatId === gc.id) {
      activeGroupChatId = null;
      _activeGroupData  = null;
      _groupSettingsOpen = false;
      const panel = document.getElementById('group-settings-panel');
      if (panel) panel.style.display = 'none';
      showChatEmpty();
      showToast('You were removed from this group.');
    }
    renderConvList();
    return;
  }

  /* User is (still) a member — refresh conv list so new group appears / updates */
  await renderConvList();

  /* If this is the group the user is currently viewing, refresh the header
     (member count, name) and re-subscribe so they get new messages live */
  if (activeGroupChatId === gc.id) {
    _activeGroupData = gc;
    const memberCount = members.length;
    const headerStatus = document.getElementById('chat-header-status');
    if (headerStatus) headerStatus.textContent = `${memberCount} member${memberCount !== 1 ? 's' : ''}`;
    const headerName = document.getElementById('chat-header-name');
    if (headerName && gc.name) headerName.textContent = escHtml(gc.name);
    /* Re-subscribe so the new member also gets real-time messages */
    subscribeToGroupChat(gc.id);
  }
}

function subscribeToGroupChat(groupChatId) {
  if (_gcChannel) { sb.removeChannel(_gcChannel); _gcChannel = null; }

  _gcChannel = sb.channel('gc-' + groupChatId + '-' + Date.now())
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'group_messages',
    }, payload => _onIncomingGroupMessage(payload.new))
    .on('postgres_changes', {
      event:  'DELETE',
      schema: 'public',
      table:  'group_chats',
      filter: `id=eq.${groupChatId}`,
    }, () => _onGroupChatDeleted(groupChatId))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Messages] Group channel subscribed:', groupChatId);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Messages] Group channel error:', status);
      }
    });
}

/* Called on every member's screen the moment the host deletes the group */
function _onGroupChatDeleted(groupChatId) {
  /* Only act if the user is currently viewing this group */
  if (activeGroupChatId !== groupChatId) {
    /* Not currently open — just refresh the conv list silently */
    _invalidateGroupCache();
    renderConvList();
    return;
  }

  /* Currently open — close it, clear state, show empty panel */
  _invalidateGroupCache();
  _invalidateGroupReadCache(groupChatId);
  activeGroupChatId = null;
  _activeGroupData  = null;
  _groupSettingsOpen = false;

  const panel = document.getElementById('group-settings-panel');
  if (panel) panel.style.display = 'none';

  showChatEmpty();
  renderConvList();
  showToast('This group was deleted by the host.');
}

function unsubscribeMessages() {
  if (_dmChannel) { sb.removeChannel(_dmChannel); _dmChannel = null; }
  if (_gcChannel) { sb.removeChannel(_gcChannel); _gcChannel = null; }
  _subscribing = false;
  _teardownLazyLoader();
}

function _onChatInputChange(textarea) {
  /* Auto-grow textarea */
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
}

async function _onIncomingDM(msg) {
  if (!currentUser) return;
  if (msg.from_email !== currentUser.email && msg.to_email !== currentUser.email) return;
  if (msg.from_email === currentUser.email) {
    _updateConvPreview(msg.to_email, msg.text, msg.created_at);
    return;
  }

  if (_msgCache) {
    const alreadyExists = _msgCache.some(m => m.id === msg.id);
    if (!alreadyExists) _msgCache.push(msg);
  }

  if (activeChatEmail === msg.from_email) {
    _appendIncomingDMBubble(msg);
    markMessagesRead(msg.from_email);
    _updateConvPreview(msg.from_email, msg.text, msg.created_at);
  } else {
    _bumpConvUnreadBadge(msg.from_email);
    _updateConvPreview(msg.from_email, msg.text, msg.created_at);
    const existingConvEl = document.getElementById('conv-' + msg.from_email);
    if (!existingConvEl) {
      _invalidateMsgCache();
      renderConvList();
    }
    updateSidebarBadges();
    /* in-app notification */
    if (typeof notifyNewMessage === 'function') {
      _getAccounts().then(accounts => {
        const sender = accounts.find(a => a.email === msg.from_email);
        if (sender) notifyNewMessage(sender, msg.text || '', false, '');
      });
    }
    if (document.hidden && Notification.permission === 'granted') {
      _getAccounts().then(accounts => {
        const sender     = accounts.find(a => a.email === msg.from_email);
        const senderName = sender ? sender.name : msg.from_email;
        new Notification(`New message from ${senderName}`, {
          body: (msg.text || '').slice(0, 80),
          icon: '/favicon.ico',
        });
      });
    }
  }
}

async function _onIncomingGroupMessage(msg) {
  if (!currentUser) return;
  if (msg.from_email === currentUser.email) return;

  const accounts = await _getAccounts();
  const sender   = accounts.find(a => a.email === msg.from_email);
  const senderFirstName = sender ? sender.name.split(' ')[0] : 'Someone';

  /* Update the conv list item preview and move it to the top — always */
  _updateGroupConvPreview(msg.group_chat_id, senderFirstName, msg.text || '', msg.created_at);

  if (msg.group_chat_id === activeGroupChatId) {
    /* User is in this chat — append the bubble */
    _appendIncomingGroupBubble(msg, accounts);
  } else {
    /* User is not in this chat — bump unread badge and sidebar count */
    _bumpGroupUnreadBadge(msg.group_chat_id);
    updateSidebarBadges();
    /* in-app notification */
    if (typeof notifyNewMessage === 'function' && sender) {
      const gc = (await _getGroupChats()).find(g => g.id === msg.group_chat_id);
      notifyNewMessage(sender, msg.text || '', true, gc?.name || 'Group Chat');
    }
  }
}

function _appendIncomingDMBubble(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const placeholder = container.querySelector('.chat-start-msg');
  if (placeholder) placeholder.remove();

  const time = formatShortTime(new Date(msg.created_at).getTime());
  // Render invite card if type matches, otherwise plain bubble
  const bubbleHTML = msg.type === 'room_invite'
    ? _buildInviteCardHTML(msg, false)
    : msg.type === 'sub_invite'
    ? _buildSubInviteCardHTML(msg, false)
    : `<div class="chat-bubble">${escHtml(msg.text || '')}</div>`;

  const div = document.createElement('div');
  div.className = 'chat-msg theirs';
  div.innerHTML = `
    <div class="chat-msg-body">
      ${bubbleHTML}
      <div class="chat-msg-meta">
        <div class="chat-msg-time">${escHtml(time)}</div>
      </div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function _appendOutgoingBubble(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const placeholder = container.querySelector('.chat-start-msg');
  if (placeholder) placeholder.remove();

  const _dateOpts = { weekday: 'short', month: 'short', day: 'numeric' };
  const todayStr  = new Date().toLocaleDateString('en-US', _dateOpts);
  const msgDate   = new Date(msg.created_at).toLocaleDateString('en-US', _dateOpts);
  const lastDivider     = container.querySelector('.chat-date-divider:last-of-type');
  const lastDividerText = lastDivider ? lastDivider.textContent.trim() : null;
  const resolvedLabel   = msgDate === todayStr ? 'Today' : msgDate;
  if (lastDividerText !== resolvedLabel) {
    const divider = document.createElement('div');
    divider.className   = 'chat-date-divider';
    divider.textContent = resolvedLabel;
    container.appendChild(divider);
  }

  const time = formatShortTime(new Date(msg.created_at).getTime());
  const div  = document.createElement('div');
  div.className     = 'chat-msg mine';
  div.dataset.msgId = msg.id;
  div.innerHTML = `
    <div class="chat-msg-body">
      <div class="chat-bubble">${escHtml(msg.text || '')}</div>
      <div class="chat-msg-meta">
        <div class="chat-msg-time">${escHtml(time)}</div>
        <span class="msg-read-receipt" title="Sent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
      </div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function _appendIncomingGroupBubble(msg, accounts) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const placeholder = container.querySelector('.chat-start-msg');
  if (placeholder) placeholder.remove();

  const u      = accounts.find(a => a.email === msg.from_email);
  const uInit  = u ? getInitials(u) : '?';
  const uColor = avatarColor(u);
  const uName  = u ? u.name : msg.from_email;
  const time   = formatShortTime(new Date(msg.created_at).getTime());

  const div = document.createElement('div');
  div.className = 'chat-msg theirs';
  div.innerHTML = `
    <div class="chat-msg-avatar" style="background:${uColor}">${escHtml(uInit)}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-sender">${escHtml(uName)}</div>
      <div class="chat-bubble">${escHtml(msg.text || '')}</div>
      <div class="chat-msg-time">${escHtml(time)}</div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function _bumpConvUnreadBadge(partnerEmail) {
  const convEl = document.getElementById('conv-' + partnerEmail);
  if (!convEl) return;
  const previewRow = convEl.querySelector('.conv-preview-row');
  if (!previewRow) return;
  let badge = convEl.querySelector('.conv-unread-badge');
  if (badge) {
    const n = (parseInt(badge.textContent, 10) || 0) + 1;
    badge.textContent = n > 9 ? '9+' : String(n);
  } else {
    badge = document.createElement('span');
    badge.className   = 'conv-unread-badge';
    badge.textContent = '1';
    previewRow.appendChild(badge);
  }
  const list = convEl.parentElement;
  if (list && list.firstChild !== convEl) list.prepend(convEl);
}

function _bumpGroupUnreadBadge(groupChatId) {
  const convEl = document.getElementById('gc-conv-' + groupChatId);
  if (!convEl) return;
  const previewRow = convEl.querySelector('.conv-preview-row');
  if (!previewRow) return;
  let badge = convEl.querySelector('.conv-unread-badge');
  if (badge) {
    const n = (parseInt(badge.textContent, 10) || 0) + 1;
    badge.textContent = n > 9 ? '9+' : String(n);
  } else {
    badge = document.createElement('span');
    badge.className   = 'conv-unread-badge';
    badge.textContent = '1';
    previewRow.appendChild(badge);
  }
  const list = convEl.parentElement;
  if (list && list.firstChild !== convEl) list.prepend(convEl);
}

/* ══════════════════════════════════════
   IN-MEMORY CACHES
══════════════════════════════════════ */
let _msgCache       = null;
let _accountCache   = null;
let _groupChatCache = null;
// Per-group last-read timestamp cache — avoids N DB hits during renderConvList.
let _groupReadCache = {};

const MSG_PAGE_SIZE  = 100;
let   _msgPageOffset = 0;
let   _msgAllLoaded  = false;
let   _lazyObserver  = null;

function _invalidateMsgCache() {
  _msgCache      = null;
  _msgPageOffset = 0;
  _msgAllLoaded  = false;
}

function _invalidateAccountCache() { _accountCache = null; }

function _invalidateGroupCache() { _groupChatCache = null; }

function _invalidateGroupReadCache(groupChatId) {
  if (groupChatId) delete _groupReadCache[groupChatId];
  else _groupReadCache = {};
}

async function _getMyMessages() {
  if (_msgCache) return _msgCache;
  if (!currentUser) return [];
  const { data, error } = await sb.from('messages')
    .select('*')
    .or(`from_email.eq.${currentUser.email},to_email.eq.${currentUser.email}`)
    .order('created_at', { ascending: false })
    .range(0, MSG_PAGE_SIZE - 1);
  if (error) { console.error('_getMyMessages:', error.message); return []; }
  _msgCache      = (data || []).reverse();
  _msgPageOffset = MSG_PAGE_SIZE;
  _msgAllLoaded  = (data || []).length < MSG_PAGE_SIZE;
  return _msgCache;
}

async function _loadOlderMessages() {
  if (!currentUser || _msgAllLoaded) return [];
  const { data, error } = await sb.from('messages')
    .select('*')
    .or(`from_email.eq.${currentUser.email},to_email.eq.${currentUser.email}`)
    .order('created_at', { ascending: false })
    .range(_msgPageOffset, _msgPageOffset + MSG_PAGE_SIZE - 1);
  if (error) { console.error('_loadOlderMessages:', error.message); return []; }
  const older = (data || []).reverse();
  if (older.length < MSG_PAGE_SIZE) _msgAllLoaded = true;
  _msgPageOffset += older.length;
  if (_msgCache) _msgCache = [...older, ..._msgCache];
  else           _msgCache = older;
  return older;
}

function _setupLazyLoader(partnerEmail) {
  _teardownLazyLoader();
  if (_msgAllLoaded) return;

  const container = document.getElementById('chat-messages');
  if (!container) return;

  const sentinel = document.createElement('div');
  sentinel.id        = 'msg-load-sentinel';
  sentinel.className = 'msg-load-sentinel';
  sentinel.innerHTML = '<span class="msg-load-spinner"></span>';
  container.insertBefore(sentinel, container.firstChild);

  _lazyObserver = new IntersectionObserver(async (entries) => {
    if (!entries[0].isIntersecting) return;

    const prevHeight = container.scrollHeight;
    const older = await _loadOlderMessages();
    if (!older.length) {
      _teardownLazyLoader();
      sentinel.remove();
      return;
    }

    const accounts     = await _getAccounts();
    const _dateOpts    = { weekday: 'short', month: 'short', day: 'numeric' };
    const todayStr     = new Date().toLocaleDateString('en-US', _dateOpts);
    const yesterdayStr = new Date(Date.now() - 86400000).toLocaleDateString('en-US', _dateOpts);

    const parts = [];
    let   lastDate = '';
    older.filter(m =>
      (m.from_email === currentUser.email && m.to_email === partnerEmail) ||
      (m.from_email === partnerEmail      && m.to_email === currentUser.email)
    ).forEach(m => {
      const ts      = new Date(m.created_at).getTime();
      const dateStr = new Date(m.created_at).toLocaleDateString('en-US', _dateOpts);
      if (dateStr !== lastDate) {
        lastDate = dateStr;
        const label = dateStr === todayStr ? 'Today' : dateStr === yesterdayStr ? 'Yesterday' : dateStr;
        parts.push(`<div class="chat-date-divider">${escHtml(label)}</div>`);
      }
      const mine   = m.from_email === currentUser.email;
      const u      = accounts.find(a => a.email === m.from_email);
      const uInit  = u ? getInitials(u) : '?';
      const uColor = avatarColor(u);
      const time   = formatShortTime(ts);
      parts.push(`
      <div class="chat-msg ${mine ? 'mine' : 'theirs'}">
        ${!mine ? `<div class="chat-msg-avatar" style="background:${uColor}">${escHtml(uInit)}</div>` : ''}
        <div class="chat-msg-body">
          <div class="chat-bubble">${escHtml(m.text || '')}</div>
          <div class="chat-msg-meta">
            <div class="chat-msg-time">${escHtml(time)}</div>
          </div>
        </div>
      </div>`);
    });

    if (parts.length) {
      const frag = document.createRange().createContextualFragment(parts.join(''));
      sentinel.after(frag);
    }

    container.scrollTop += container.scrollHeight - prevHeight;

    if (_msgAllLoaded) {
      _teardownLazyLoader();
      sentinel.remove();
    }
  }, { root: container, threshold: 0.1 });

  _lazyObserver.observe(sentinel);
}

function _teardownLazyLoader() {
  if (_lazyObserver) { _lazyObserver.disconnect(); _lazyObserver = null; }
  const old = document.getElementById('msg-load-sentinel');
  if (old) old.remove();
}

async function _getAccounts() {
  if (_accountCache) return _accountCache;
  _accountCache = await loadAccounts();
  return _accountCache;
}

/* ══════════════════════════════════════
   SUPABASE HELPERS
══════════════════════════════════════ */
/* ══════════════════════════════════════
   ROOM INVITE CARD RENDERER
   Called by renderChatMessages and _appendIncomingDMBubble
   whenever a message has type === 'room_invite'.
   The attachment JSONB holds: { roomId, roomName, subject, lockPin, fromName }
   The card replaces the plain chat-bubble with a rich invite UI.
══════════════════════════════════════ */
function _buildInviteCardHTML(m, isMine) {
  let att = m.attachment;
  if (typeof att === 'string') { try { att = JSON.parse(att); } catch (_) { att = {}; } }
  att = att || {};

  const roomId   = att.roomId   || '';
  const roomName = att.roomName || 'Study Room';
  const subject  = att.subject  || '';
  const lockPin  = att.lockPin  || null;
  const fromName = att.fromName || (isMine ? 'You' : 'Someone');

  const subjectTag = subject
    ? `<span class="invite-card-subject">${escHtml(subject)}</span>`
    : '';

  const pinSection = lockPin
    ? `<div class="invite-card-pin">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
         Room PIN: <strong>${escHtml(lockPin)}</strong>
       </div>`
    : '';

  const joinBtn = (!isMine && roomId)
    ? `<button class="invite-card-join-btn" onclick="_acceptRoomInvite('${escHtml(roomId)}')">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
         Join Room
       </button>`
    : (isMine ? `<span class="invite-card-sent-label">Invite sent</span>` : '');

  return `<div class="invite-card">
    <div class="invite-card-header">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      Room Invite
    </div>
    <div class="invite-card-body">
      <div class="invite-card-room-name">${escHtml(roomName)}</div>
      ${subjectTag}
      ${pinSection}
    </div>
    ${joinBtn}
  </div>`;
}


/* ══════════════════════════════════════
   SUB INVITE CARD
   type === 'sub_invite'
   attachment: { tierId, tierName, creatorEmail, creatorName, price }
══════════════════════════════════════ */
function _buildSubInviteCardHTML(m, isMine) {
  let att = m.attachment;
  if (typeof att === 'string') { try { att = JSON.parse(att); } catch (_) { att = {}; } }
  att = att || {};

  const tierId      = att.tierId       || '';
  const tierName    = att.tierName     || 'Subscription';
  const creatorEmail = att.creatorEmail || '';
  const creatorName = att.creatorName  || 'Creator';
  const price       = att.price        || 0;
  const accepted    = att.accepted     || false;

  const priceLabel = price === 0 ? 'Free' : `₱${price}/mo`;

  const actionArea = isMine
    ? `<span class="invite-card-sent-label">Invite sent</span>`
    : accepted
    ? `<span class="invite-card-sent-label" style="color:var(--brand-base)">✓ Accepted</span>`
    : `<button class="invite-card-join-btn" onclick="_acceptSubInvite('${escHtml(m.id)}','${escHtml(tierId)}','${escHtml(creatorEmail)}',this)">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
         Accept Free Subscription
       </button>`;

  return `<div class="invite-card">
    <div class="invite-card-header">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      Free Subscription Offer
    </div>
    <div class="invite-card-body">
      <div class="invite-card-room-name">${escHtml(tierName)}</div>
      <span class="invite-card-subject">from ${escHtml(creatorName)} · ${escHtml(priceLabel)}</span>
    </div>
    ${actionArea}
  </div>`;
}

async function _acceptSubInvite(msgId, tierId, creatorEmail, btnEl) {
  if (!currentUser) { showToast('Please log in first.'); return; }
  try {
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Accepting…'; }
    const existing = await loadUserSubs();
    if (existing.some(s => s.userEmail === currentUser.email && s.creatorEmail === creatorEmail)) {
      showToast('You are already subscribed!'); return;
    }
    await saveUserSubs([{
      id:           'sub_free_' + Date.now(),
      userEmail:    currentUser.email,
      creatorEmail,
      tierId:       tierId || null,
      price:        0,
      since:        Date.now(),
    }]);
    // Mark message attachment as accepted
    await sb.from('messages').update({
      attachment: JSON.stringify({ accepted: true })
    }).eq('id', msgId);
    showToast('✅ Subscription accepted!');
    if (btnEl) {
      const card = btnEl.closest('.invite-card');
      if (card) {
        btnEl.outerHTML = `<span class="invite-card-sent-label" style="color:var(--brand-base)">✓ Accepted</span>`;
      }
    }
    if (typeof invalidateFeedCache === 'function') invalidateFeedCache();
    if (typeof renderFeed === 'function') renderFeed();
  } catch(e) {
    console.error('_acceptSubInvite:', e);
    showToast('Could not accept subscription. Please try again.');
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Accept Free Subscription'; }
  }
}

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

async function markMessagesRead(partnerEmail) {
  if (!currentUser || !partnerEmail) return;
  if (_msgCache) {
    _msgCache.forEach(m => {
      if (m.from_email === partnerEmail && m.to_email === currentUser.email) m.read = true;
    });
  }
  updateSidebarBadges();
  sb.from('messages')
    .update({ read: true })
    .eq('to_email', currentUser.email)
    .eq('from_email', partnerEmail)
    .eq('read', false)
    .then(({ error }) => {
      if (error) console.error('markMessagesRead:', error.message);
    });
}

async function getConversation(partnerEmail) {
  if (!currentUser || !partnerEmail) return [];
  const msgs = await _getMyMessages();
  return msgs.filter(m =>
    (m.from_email === currentUser.email && m.to_email === partnerEmail) ||
    (m.from_email === partnerEmail      && m.to_email === currentUser.email)
  );
}

async function getUnreadCount() {
  if (!currentUser) return 0;
  const { count, error } = await sb
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('to_email', currentUser.email)
    .eq('read', false);
  if (error) { console.error('getUnreadCount:', error.message); return 0; }
  return count || 0;
}

/* ══════════════════════════════════════
   GROUP READS — HELPERS
   Uses .maybeSingle() — no 406 when no row exists yet.
   Results cached in _groupReadCache to avoid N DB hits
   per renderConvList call. Cache is updated optimistically
   on open so unread badges clear immediately.
══════════════════════════════════════ */
async function _getGroupLastRead(groupChatId) {
  if (!currentUser || !groupChatId) return 0;
  if (_groupReadCache[groupChatId] !== undefined) return _groupReadCache[groupChatId];
  try {
    const { data, error } = await sb
      .from('group_reads')
      .select('last_read_at')
      .eq('user_email', currentUser.email)
      .eq('group_chat_id', groupChatId)
      .maybeSingle();
    if (error) {
      console.warn('[group_reads] fetch failed:', error.message);
      return 0;
    }
    const ts = data ? new Date(data.last_read_at).getTime() : 0;
    _groupReadCache[groupChatId] = ts;
    return ts;
  } catch (err) {
    console.warn('[group_reads] unexpected error:', err);
    return 0;
  }
}

async function _upsertGroupLastRead(groupChatId) {
  if (!currentUser || !groupChatId) return;
  try {
    const now = new Date().toISOString();
    const { error } = await sb
      .from('group_reads')
      .upsert(
        {
          user_email:    currentUser.email,
          group_chat_id: groupChatId,
          last_read_at:  now,
        },
        { onConflict: 'user_email,group_chat_id' }
      );
    if (error) {
      console.error('[group_reads] upsert failed:', error.message);
      return;
    }
    // Update local cache immediately so unread badges clear without a re-fetch
    _groupReadCache[groupChatId] = new Date(now).getTime();
  } catch (err) {
    console.warn('[group_reads] upsert unexpected error:', err);
  }
}

/* ══════════════════════════════════════
   PAGE INIT
══════════════════════════════════════ */
async function initMessagesPage() {
  activeChatEmail = null;
  _invalidateMsgCache();
  await Promise.all([_getMyMessages(), _getAccounts()]);
  await renderConvList();
  showChatEmpty();
  if (currentUser) subscribeToMessages();
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  // Clear the sidebar badge — user is now on the messages page
  const msgBadge = document.getElementById('msg-sidebar-badge');
  if (msgBadge) { msgBadge.textContent = ''; msgBadge.style.display = 'none'; }
}

/* ══════════════════════════════════════
   CONVERSATION LIST
══════════════════════════════════════ */
async function renderConvList() {
  const listEl = document.getElementById('conv-list-items');
  if (!listEl || !currentUser) return;

  const [allMsgs, accounts, groupChats] = await Promise.all([
    _getMyMessages(),
    _getAccounts(),
    _getMyGroupChats(),
  ]);

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
    return {
      type: 'dm', partnerEmail, last, unread, account,
      ts: last ? new Date(last.created_at).getTime() : 0,
    };
  });

  const gcConvs = await Promise.all(groupChats.map(async gc => {
    const lastRead = await _getGroupLastRead(gc.id);

    let unread = 0;
    let lastMsg = null;  // Phase 4: Add last message
    try {
      // Phase 4: Fetch last message for preview
      const { data: gcMsgs, error } = await sb.from('group_messages')
        .select('id, created_at, from_email, text')
        .eq('group_chat_id', gc.id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) console.warn('[group_messages] last message fetch failed:', error.message);
      if (gcMsgs && gcMsgs.length > 0) {
        lastMsg = gcMsgs[0];
      }
    } catch (err) {
      console.warn('[group_messages] last message error:', err);
    }

    // Count unread separately
    try {
      const { data: unreads, error } = await sb.from('group_messages')
        .select('id')
        .eq('group_chat_id', gc.id)
        .gt('created_at', new Date(lastRead || 0).toISOString())
        .neq('from_email', currentUser.email);
      if (!error) unread = (unreads || []).length;
    } catch (err) {
      console.warn('[unread count error]', err);
    }

    return {
      type: 'group',
      gc,
      unread,
      lastMsg,  // Phase 4: Include last message
      ts: gc.created_at ? new Date(gc.created_at).getTime() : 0,
    };
  }));

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
      const gcName   = gc.name || 'Study Group';
      const gcInit   = gcName.trim().charAt(0).toUpperCase();
      
      // Phase 4: Show last sender + message instead of generic text
      let previewText = `Group chat · ${gc.host_email === currentUser.email ? 'You host' : 'Joined'}`;
      if (cv.lastMsg) {
        const sender = accounts.find(a => a.email === cv.lastMsg.from_email);
        const senderName = sender ? sender.name.split(' ')[0] : 'User';
        const msgPreview = (cv.lastMsg.text || '').substring(0, 28);
        previewText = `${escHtml(senderName)}: ${escHtml(msgPreview)}${msgPreview.length > 28 ? '…' : ''}`;
      }
      
      return `
      <div class="conv-item conv-group-item ${isActive ? 'active' : ''}" id="gc-conv-${escHtml(gc.id)}"
           onclick="openGroupChat('${escHtml(gc.id)}')">
        <div class="conv-avatar-wrap">
          <div class="conv-avatar conv-group-avatar group">${escHtml(gcInit)}</div>
        </div>
        <div class="conv-info">
          <div class="conv-name-row">
            <span class="conv-name">${escHtml(gcName)}</span>
            <span class="conv-group-badge">${mCount} member${mCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="conv-preview-row">
            <span class="conv-preview">${previewText}</span>
            ${cv.unread ? `<span class="conv-unread-badge">${cv.unread > 9 ? '9+' : cv.unread}</span>` : ''}
          </div>
        </div>
      </div>`;
    }

    const name     = cv.account ? cv.account.name : cv.partnerEmail;
    const init     = cv.account ? getInitials(cv.account) : '?';
    const color    = avatarColor(cv.account);
    const preview  = cv.last ? (cv.last.text || '📎 Attachment').slice(0, 42) : '';
    const time     = cv.last ? formatShortTime(new Date(cv.last.created_at).getTime()) : '';
    const isActive = cv.partnerEmail === activeChatEmail;
    const isOnline = cv.account?._online || false;
    return `
    <div class="conv-item ${isActive ? 'active' : ''} ${cv.unread ? 'conv-unread' : ''}" id="conv-${escHtml(cv.partnerEmail)}"
         onclick="openChat('${escHtml(cv.partnerEmail)}')">
      <div class="conv-avatar-wrap">
        <div class="conv-avatar" style="background:${color}">${escHtml(init)}</div>
        ${isOnline ? `<div class="conv-online-dot"></div>` : ''}
      </div>
      <div class="conv-info">
        <div class="conv-name-row">
          <span class="conv-name">${escHtml(name)}</span>
          <span class="conv-time">${escHtml(time)}</span>
        </div>
        <div class="conv-preview-row">
          <span class="conv-preview">${escHtml(preview)}</span>
          ${cv.unread ? `<span class="conv-unread-badge">${cv.unread > 9 ? '9+' : cv.unread}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
  
  // Phase 4: Initialize back button after DOM is rendered
  initBackButton();
}

/* ══════════════════════════════════════
   OPEN CHAT
══════════════════════════════════════ */
async function openChat(partnerEmail) {
  if (!currentUser || !partnerEmail) return;
  activeChatEmail   = partnerEmail;
  activeGroupChatId = null;

  // Phase 4: Show chat panel on mobile
  _showChatPanelMobile();

  const sendBtn = document.querySelector('.chat-send-btn');
  if (sendBtn) sendBtn.setAttribute('onclick', 'sendChatMessage()');
  const input = document.getElementById('chat-input');
  if (input) {
    input.setAttribute('onkeydown', "if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMessage();}");
    input.placeholder = 'Type a message…';
  }

  const settingsPanel = document.getElementById('group-settings-panel');
  if (settingsPanel) settingsPanel.style.display = 'none';
  _groupSettingsOpen = false;
  _activeGroupData   = null;
  const profileBtn   = document.getElementById('chat-profile-btn');
  const settingsBtn  = document.getElementById('chat-settings-btn');
  if (profileBtn)  profileBtn.style.display  = 'flex';
  if (settingsBtn) settingsBtn.style.display = 'none';

  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
  const convEl = document.getElementById('conv-' + partnerEmail);
  if (convEl) convEl.classList.add('active');

  const empty  = document.getElementById('chat-empty');
  const active = document.getElementById('chat-active');
  if (empty)  empty.style.display  = 'none';
  if (active) active.style.display = 'flex';

  const accounts = await _getAccounts();
  const partner  = accounts.find(a => a.email === partnerEmail);
  const name     = partner ? partner.name : partnerEmail;
  const init     = partner ? getInitials(partner) : '?';
  const color    = avatarColor(partner);

  const headerAvatar = document.getElementById('chat-header-avatar');
  const headerName   = document.getElementById('chat-header-name');
  if (headerAvatar) { headerAvatar.textContent = init; headerAvatar.style.background = color; }
  if (headerName)   headerName.textContent = name;

  await renderChatMessages(partnerEmail);
  markMessagesRead(partnerEmail);
  updateSidebarBadges();   // recount after marking read

  if (convEl) {
    const badge = convEl.querySelector('.conv-unread-badge');
    if (badge) badge.remove();
  }

  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.focus();
    chatInput.style.height = 'auto';
  }
}

/* ══════════════════════════════════════
   RENDER CHAT MESSAGES
══════════════════════════════════════ */
async function renderChatMessages(partnerEmail) {
  const container = document.getElementById('chat-messages');
  if (!container || !currentUser) return;

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

  const _dateOpts    = { weekday: 'short', month: 'short', day: 'numeric' };
  const todayStr     = new Date().toLocaleDateString('en-US', _dateOpts);
  const yesterdayStr = new Date(Date.now() - 86400000).toLocaleDateString('en-US', _dateOpts);

  msgs.forEach(m => {
    const ts      = new Date(m.created_at).getTime();
    const dateStr = new Date(m.created_at).toLocaleDateString('en-US', _dateOpts);

    if (dateStr !== lastDate) {
      lastDate = dateStr;
      const label = dateStr === todayStr ? 'Today' : dateStr === yesterdayStr ? 'Yesterday' : dateStr;
      parts.push(`<div class="chat-date-divider">${escHtml(label)}</div>`);
    }

    const mine   = m.from_email === currentUser.email;
    const u      = accounts.find(a => a.email === m.from_email);
    const uInit  = u ? getInitials(u) : '?';
    const uColor = avatarColor(u);
    const time   = formatShortTime(ts);
    const readReceipt = mine
      ? `<span class="msg-read-receipt ${m.read ? 'read' : ''}" title="${m.read ? 'Seen' : 'Sent'}">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
           ${m.read ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
         </span>`
      : '';

    // ── Invite card vs plain bubble ──────────────────────────────
    const bubbleHTML = m.type === 'room_invite'
      ? _buildInviteCardHTML(m, mine)
      : m.type === 'sub_invite'
      ? _buildSubInviteCardHTML(m, mine)
      : `<div class="chat-bubble">${escHtml(m.text || '')}</div>`;

    parts.push(`
    <div class="chat-msg ${mine ? 'mine' : 'theirs'}">
      ${!mine ? `<div class="chat-msg-avatar" style="background:${uColor}">${escHtml(uInit)}</div>` : ''}
      <div class="chat-msg-body">
        ${bubbleHTML}
        <div class="chat-msg-meta">
          <div class="chat-msg-time">${escHtml(time)}</div>
          ${readReceipt}
        </div>
      </div>
    </div>`);
  });

  container.innerHTML = parts.join('');
  container.scrollTop = container.scrollHeight;
  _setupLazyLoader(partnerEmail);
}

/* ══════════════════════════════════════
   SEND CHAT MESSAGE
══════════════════════════════════════ */
async function sendChatMessage() {
  if (!currentUser || !activeChatEmail) return;
  const input = document.getElementById('chat-input');
  const text  = (input ? input.value : '').trim();
  if (!text) return;

  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }

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

  if (_msgCache) _msgCache.push(optimisticMsg);
  _appendOutgoingBubble(optimisticMsg);
  _updateConvPreview(activeChatEmail, text, now);

  sendMessageToDB(activeChatEmail, text).then(saved => {
    if (!saved) {
      if (_msgCache) {
        const idx = _msgCache.findIndex(m => m.id === optimisticMsg.id);
        if (idx !== -1) _msgCache.splice(idx, 1);
      }
      const badBubble = document.querySelector(`[data-msg-id="${CSS.escape(optimisticMsg.id)}"]`);
      if (badBubble) badBubble.remove();
      showToast('Failed to send message. Please try again.');
      updateSidebarBadges();
      return;
    }
    if (_msgCache) {
      const idx = _msgCache.findIndex(m => m.id === optimisticMsg.id);
      if (idx !== -1) _msgCache[idx] = saved;
    }
    const bubble = document.querySelector(`[data-msg-id="${CSS.escape(optimisticMsg.id)}"]`);
    if (bubble) bubble.dataset.msgId = saved.id;
  });
}

function _updateConvPreview(partnerEmail, text, isoTime) {
  const convEl = document.getElementById('conv-' + partnerEmail);
  if (!convEl) return;
  const previewEl = convEl.querySelector('.conv-preview');
  const timeEl    = convEl.querySelector('.conv-time');
  if (previewEl) previewEl.textContent = text.slice(0, 42);
  if (timeEl)    timeEl.textContent    = formatShortTime(new Date(isoTime).getTime());
  const list = convEl.parentElement;
  if (list && list.firstChild !== convEl) list.prepend(convEl);
}

/* Same as _updateConvPreview but for group chats.
   Uses the gc-conv-{id} element and the .conv-snippet class for preview text. */
function _updateGroupConvPreview(groupChatId, senderName, text, isoTime) {
  const convEl = document.getElementById('gc-conv-' + groupChatId);
  if (!convEl) return;
  const previewEl = convEl.querySelector('.conv-preview');
  const timeEl    = convEl.querySelector('.conv-time');
  const snippet   = senderName ? `${senderName}: ${text}` : text;
  if (previewEl) previewEl.textContent = snippet.slice(0, 42);
  if (timeEl)    timeEl.textContent    = formatShortTime(new Date(isoTime).getTime());
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
  _teardownLazyLoader();
}

/* ══════════════════════════════════════
   FILTER CONVERSATION LIST
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
   COMPOSE MODAL
══════════════════════════════════════ */
let _composeBuddies  = [];
let _composeType     = 'dm';       // 'dm' | 'group'
let _composeSelected = new Set();  // emails selected for group

async function openComposeModal() {
  if (!currentUser) return;
  _composeType     = 'dm';
  _composeSelected = new Set();
  const modal = document.getElementById('compose-modal');
  if (modal) modal.style.display = 'flex';
  _setComposeType('dm');

  const searchInput = document.getElementById('compose-search-input');
  if (searchInput) { searchInput.value = ''; searchInput.focus(); }

  const [accounts, matches] = await Promise.all([
    _getAccounts(),
    loadMatches ? loadMatches() : [],
  ]);

  const connectedEmails = matches
    .filter(m => m.status === 'accepted' &&
      (m.from === currentUser.email || m.to === currentUser.email))
    .map(m => m.from === currentUser.email ? m.to : m.from);

  _composeBuddies = accounts.filter(a => connectedEmails.includes(a.email));
  _renderComposeBuddyList(_composeBuddies);
}

function closeComposeModal(e) {
  const modal = document.getElementById('compose-modal');
  if (!e || e.target === modal) {
    if (modal) modal.style.display = 'none';
    _composeSelected = new Set();
  }
}

function _setComposeType(type) {
  _composeType     = type;
  _composeSelected = new Set();
  document.getElementById('compose-type-dm')?.classList.toggle('active', type === 'dm');
  document.getElementById('compose-type-group')?.classList.toggle('active', type === 'group');
  const confirmBtn = document.getElementById('compose-confirm-btn');
  if (confirmBtn) {
    confirmBtn.style.display = type === 'group' ? 'inline-flex' : 'none';
    confirmBtn.textContent   = 'Create Group';
  }
  const input = document.getElementById('compose-search-input');
  if (input) { input.value = ''; input.placeholder = type === 'group' ? 'Add buddies to group…' : 'Search buddies…'; }
  _renderComposeBuddyList(_composeBuddies);
}

function filterComposeBuddies(q) {
  const filtered = q
    ? _composeBuddies.filter(b => b.name.toLowerCase().includes(q.toLowerCase()))
    : _composeBuddies;
  _renderComposeBuddyList(filtered);
}

function _renderComposeBuddyList(buddies) {
  const list = document.getElementById('compose-buddy-list');
  if (!list) return;
  if (!buddies.length) {
    list.innerHTML = `<div class="compose-empty">No connected buddies found.<br>Connect with someone on Find Buddies first!</div>`;
    return;
  }
  if (_composeType === 'group') {
    list.innerHTML = buddies.map(b => {
      const init     = getInitials(b);
      const color    = avatarColor(b);
      const selected = _composeSelected.has(b.email);
      return `
      <div class="compose-buddy-item ${selected ? 'selected' : ''}" onclick="_toggleComposeSelect('${escHtml(b.email)}')">
        <div class="compose-buddy-avatar" style="background:${color}">${escHtml(init)}</div>
        <div class="compose-buddy-name">${escHtml(b.name)}</div>
        <div class="compose-check ${selected ? 'on' : ''}">
          ${selected ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:10px;height:10px"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
        </div>
      </div>`;
    }).join('');
  } else {
    list.innerHTML = buddies.map(b => {
      const init  = getInitials(b);
      const color = avatarColor(b);
      return `
      <div class="compose-buddy-item" onclick="_startComposeChat('${escHtml(b.email)}')">
        <div class="compose-buddy-avatar" style="background:${color}">${escHtml(init)}</div>
        <div class="compose-buddy-name">${escHtml(b.name)}</div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:var(--text-light);flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
    }).join('');
  }
}

function _toggleComposeSelect(email) {
  if (_composeSelected.has(email)) _composeSelected.delete(email);
  else _composeSelected.add(email);
  const confirmBtn = document.getElementById('compose-confirm-btn');
  if (confirmBtn) confirmBtn.textContent = _composeSelected.size > 0 ? `Create Group (${_composeSelected.size})` : 'Create Group';
  _renderComposeBuddyList(_composeBuddies);
}

async function _confirmCompose() {
  if (_composeType === 'group') {
    if (_composeSelected.size < 1) { showToast('Select at least one buddy to create a group.'); return; }
    document.getElementById('compose-modal').style.display = 'none';
    _composeSelected = new Set();
    openGroupPickerModal();
  }
}

async function _startComposeChat(email) {
  document.getElementById('compose-modal').style.display = 'none';
  await openChat(email);
}

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

/* ══════════════════════════════════════
   GROUP CHATS — STATE & FETCH
   FIX: PostgREST's cs operator for TEXT[] columns breaks when
   the value contains '@' (email addresses) — it gets misread as
   a JSONB containment query and fails with "invalid input syntax
   for type json". The only reliable fix for supabase-js v2 with
   this PostgREST version is to fetch all rows and filter
   client-side. The result is cached so this only runs once per
   session (or after a cache invalidation).
══════════════════════════════════════ */
let activeGroupChatId = null;

async function _getMyGroupChats() {
  if (_groupChatCache) return _groupChatCache;
  if (!currentUser) return [];
  const { data, error } = await sb.from('group_chats').select('*');
  if (error) { console.error('_getMyGroupChats:', error.message); return []; }
  _groupChatCache = (data || []).filter(g =>
    Array.isArray(g.members) && g.members.includes(currentUser.email)
  );
  return _groupChatCache;
}

async function getGroupMessages(groupChatId) {
  const { data, error } = await sb.from('group_messages')
    .select('*')
    .eq('group_chat_id', groupChatId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getGroupMessages:', error.message); return []; }
  return data || [];
}

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
let _activeGroupData = null;

async function openGroupChat(groupChatId) {
  if (!currentUser || !groupChatId) return;
  activeGroupChatId = groupChatId;
  activeChatEmail   = null;

  // Phase 4: Show chat panel on mobile
  _showChatPanelMobile();

  _teardownLazyLoader();

  // Upsert last-read and update local cache so badge clears immediately
  await _upsertGroupLastRead(groupChatId);
  updateSidebarBadges();   // recount after marking group read

  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
  const convEl = document.getElementById('gc-conv-' + groupChatId);
  if (convEl) {
    convEl.classList.add('active');
    const badge = convEl.querySelector('.conv-unread-badge');
    if (badge) badge.remove();
  }

  const empty  = document.getElementById('chat-empty');
  const active = document.getElementById('chat-active');
  if (empty)  empty.style.display  = 'none';
  if (active) active.style.display = 'flex';

  const settingsPanel = document.getElementById('group-settings-panel');
  if (settingsPanel) settingsPanel.style.display = 'none';

  const { data: gc } = await sb.from('group_chats').select('*').eq('id', groupChatId).single();
  _activeGroupData = gc || null;
  const name        = gc ? gc.name : 'Group Chat';
  const memberCount = gc ? (gc.members || []).length : 0;

  const headerAvatar = document.getElementById('chat-header-avatar');
  const headerName   = document.getElementById('chat-header-name');
  const headerStatus = document.getElementById('chat-header-status');
  const profileBtn   = document.getElementById('chat-profile-btn');
  const settingsBtn  = document.getElementById('chat-settings-btn');

  if (headerAvatar) {
    const gcInitial = name ? name.trim().charAt(0).toUpperCase() : 'G';
    headerAvatar.textContent      = gcInitial;
    headerAvatar.style.background = 'linear-gradient(135deg,#071d2e,#0d2b42)';
    headerAvatar.style.fontSize   = '.95rem';
    headerAvatar.style.fontFamily = "'Syne','Trebuchet MS','Segoe UI',system-ui,sans-serif";
    headerAvatar.style.fontWeight = '800';
  }
  if (headerName)   headerName.textContent   = escHtml(name);
  if (headerStatus) headerStatus.textContent = `${memberCount} member${memberCount !== 1 ? 's' : ''}`;

  if (profileBtn)  profileBtn.style.display  = 'none';
  if (settingsBtn) settingsBtn.style.display = 'flex';

  const sendBtn = document.querySelector('.chat-send-btn');
  if (sendBtn) sendBtn.setAttribute('onclick', 'sendGroupChatMessage()');
  const input = document.getElementById('chat-input');
  if (input) {
    input.setAttribute('onkeydown', "if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendGroupChatMessage();}");
    input.placeholder = 'Message group…';
    input.focus();
  }

  await renderGroupMessages(groupChatId);
  subscribeToGroupChat(groupChatId);
}

/* ══════════════════════════════════════
   GROUP SETTINGS PANEL
══════════════════════════════════════ */
let _groupSettingsOpen = false;

function _getMyRole(gc) {
  if (!gc || !currentUser) return 'member';
  if (gc.host_email === currentUser.email) return 'host';
  const mgrs = Array.isArray(gc.managers) ? gc.managers : [];
  if (mgrs.includes(currentUser.email)) return 'manager';
  return 'member';
}

async function toggleGroupSettings() {
  const panel = document.getElementById('group-settings-panel');
  if (!panel) return;
  _groupSettingsOpen = !_groupSettingsOpen;
  panel.style.display = _groupSettingsOpen ? 'block' : 'none';
  if (_groupSettingsOpen && _activeGroupData) await _renderGroupSettingsPanel();
}

async function _renderGroupSettingsPanel() {
  const gc      = _activeGroupData;
  const role    = _getMyRole(gc);
  const canEdit = role === 'host' || role === 'manager';
  const isHost  = role === 'host';

  const renameSection = document.getElementById('gs-rename-section');
  if (renameSection) {
    const input = document.getElementById('group-rename-input');
    if (input) { input.value = gc.name || ''; input.disabled = !canEdit; }
    const btn = renameSection.querySelector('.group-rename-btn');
    if (btn) btn.style.display = canEdit ? '' : 'none';
  }

  const addSection = document.getElementById('gs-add-section');
  if (addSection) addSection.style.display = canEdit ? '' : 'none';

  const destroySection = document.getElementById('gs-destroy-section');
  if (destroySection) destroySection.style.display = isHost ? '' : 'none';

  const membersList = document.getElementById('group-members-list');
  if (!membersList) return;

  const members  = gc.members || [];
  const managers = Array.isArray(gc.managers) ? gc.managers : [];

  if (!members.length) {
    membersList.innerHTML = '<div class="group-settings-empty">No members yet.</div>';
    return;
  }

  const accounts = await _getAccounts();

  membersList.innerHTML = members.map(email => {
    const acc    = accounts.find(a => a.email === email);
    const name   = acc ? escHtml(acc.name) : escHtml(email);
    const init   = acc ? escHtml(getInitials(acc)) : '?';
    const color  = avatarColor(acc);
    const mRole  = email === gc.host_email ? 'host' : managers.includes(email) ? 'manager' : 'member';
    const isSelf = email === currentUser.email;

    const badgeHtml = mRole === 'host'    ? '<span class="group-host-tag">Host</span>'
                    : mRole === 'manager' ? '<span class="group-manager-tag">Manager</span>'
                    : '';

    let promoteBtn = '';
    if (isHost && !isSelf && mRole !== 'host') {
      if (mRole === 'member') {
        promoteBtn = `<button class="gs-action-btn gs-promote-btn" onclick="promoteToManager('${escHtml(email)}')" title="Make manager">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>
        </button>`;
      } else if (mRole === 'manager') {
        promoteBtn = `<button class="gs-action-btn gs-demote-btn" onclick="demoteManager('${escHtml(email)}')" title="Remove manager">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 6 12 11 7 6"/><polyline points="17 13 12 18 7 13"/></svg>
        </button>`;
      }
    }

    let removeBtn = '';
    const canRemoveThis = canEdit && !isSelf && mRole !== 'host' && !(role === 'manager' && mRole === 'manager');
    if (canRemoveThis) {
      removeBtn = `<button class="gs-action-btn gs-remove-btn" onclick="removeMemberFromGroup('${escHtml(email)}')" title="Remove member">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`;
    }

    return `
    <div class="group-member-row" id="gmr-${escHtml(email)}">
      <div class="group-member-avatar" style="background:${color}">${init}</div>
      <div class="group-member-name">${name}${badgeHtml}</div>
      <div class="gs-member-actions">${promoteBtn}${removeBtn}</div>
    </div>`;
  }).join('');

  if (canEdit) await _renderAddMemberList(accounts, members);
}

async function _renderAddMemberList(accounts, currentMembers, queryOverride) {
  const list = document.getElementById('gs-add-list');
  if (!list) return;

  if (!accounts || !currentMembers) {
    accounts       = await _getAccounts();
    currentMembers = _activeGroupData ? (_activeGroupData.members || []) : [];
  }

  const q = (queryOverride !== undefined
    ? queryOverride
    : (document.getElementById('gs-add-search')?.value || '')
  ).toLowerCase();

  const allMatches = loadMatches ? await loadMatches() : [];
  const connectedEmails = allMatches
    .filter(m => m.status === 'accepted' && (m.from === currentUser.email || m.to === currentUser.email))
    .map(m => m.from === currentUser.email ? m.to : m.from);

  const candidates = accounts.filter(a =>
    connectedEmails.includes(a.email) &&
    !currentMembers.includes(a.email) &&
    (!q || a.name.toLowerCase().includes(q))
  );

  if (!candidates.length) {
    list.innerHTML = `<div class="group-settings-empty">${q ? 'No match found.' : 'No connected buddies to add.'}</div>`;
    return;
  }

  list.innerHTML = candidates.map(b => {
    const init  = escHtml(getInitials(b));
    const color = avatarColor(b);
    return `
    <div class="gs-add-item">
      <div class="group-member-avatar" style="background:${color};width:26px;height:26px;font-size:.6rem">${init}</div>
      <span class="gs-add-name">${escHtml(b.name)}</span>
      <button class="gs-action-btn gs-add-btn" onclick="addMemberToGroup('${escHtml(b.email)}')">Add</button>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════
   GROUP SETTINGS — ACTIONS
══════════════════════════════════════ */
async function promoteToManager(email) {
  if (!currentUser || !_activeGroupData) return;
  if (_getMyRole(_activeGroupData) !== 'host') return;
  const managers = Array.isArray(_activeGroupData.managers) ? [..._activeGroupData.managers] : [];
  if (managers.includes(email)) return;
  managers.push(email);
  await sbUpsert('group_chats', { id: activeGroupChatId, managers }, 'id');
  _activeGroupData.managers = managers;
  _invalidateGroupCache();
  showToast('Member promoted to manager!');
  await _renderGroupSettingsPanel();
}

async function demoteManager(email) {
  if (!currentUser || !_activeGroupData) return;
  if (_getMyRole(_activeGroupData) !== 'host') return;
  const managers = (Array.isArray(_activeGroupData.managers) ? _activeGroupData.managers : []).filter(e => e !== email);
  await sbUpsert('group_chats', { id: activeGroupChatId, managers }, 'id');
  _activeGroupData.managers = managers;
  _invalidateGroupCache();
  showToast('Manager demoted to member.');
  await _renderGroupSettingsPanel();
}

async function removeMemberFromGroup(email) {
  if (!currentUser || !_activeGroupData) return;
  const role = _getMyRole(_activeGroupData);
  if (role === 'member') return;
  const members  = (_activeGroupData.members || []).filter(e => e !== email);
  const managers = (Array.isArray(_activeGroupData.managers) ? _activeGroupData.managers : []).filter(e => e !== email);
  await sbUpsert('group_chats', { id: activeGroupChatId, members, managers }, 'id');
  _activeGroupData.members  = members;
  _activeGroupData.managers = managers;
  _invalidateGroupCache();
  const headerStatus = document.getElementById('chat-header-status');
  if (headerStatus) headerStatus.textContent = `${members.length} member${members.length !== 1 ? 's' : ''}`;
  showToast('Member removed from group.');
  await _renderGroupSettingsPanel();
}

async function addMemberToGroup(email) {
  if (!currentUser || !_activeGroupData) return;
  const role = _getMyRole(_activeGroupData);
  if (role === 'member') return;
  const members = [...(_activeGroupData.members || [])];
  if (members.includes(email)) return;
  members.push(email);
  await sbUpsert('group_chats', { id: activeGroupChatId, members }, 'id');
  _activeGroupData.members = members;
  _invalidateGroupCache();
  const headerStatus = document.getElementById('chat-header-status');
  if (headerStatus) headerStatus.textContent = `${members.length} member${members.length !== 1 ? 's' : ''}`;
  showToast('Member added to group!');
  await _renderGroupSettingsPanel();
}

async function destroyGroupChat() {
  if (!currentUser || !_activeGroupData) return;
  if (_getMyRole(_activeGroupData) !== 'host') return;
  const confirmed = confirm(`Delete "${_activeGroupData.name}"? This cannot be undone.`);
  if (!confirmed) return;
  await sbDelete('group_chats', 'id', activeGroupChatId);
  await sbDeleteWhere('group_messages', { group_chat_id: activeGroupChatId });
  _invalidateGroupCache();
  _invalidateGroupReadCache(activeGroupChatId);
  activeGroupChatId = null;
  _activeGroupData  = null;
  const panel = document.getElementById('group-settings-panel');
  if (panel) panel.style.display = 'none';
  _groupSettingsOpen = false;
  showToast('Group deleted.');
  showChatEmpty();
  await renderConvList();
}

/* ══════════════════════════════════════
   RENAME GROUP CHAT
══════════════════════════════════════ */
async function renameGroupChat() {
  if (!currentUser || !activeGroupChatId || !_activeGroupData) return;
  const role = _getMyRole(_activeGroupData);
  if (role === 'member') { showToast('Only the host or managers can rename this group.'); return; }
  const input   = document.getElementById('group-rename-input');
  const newName = (input ? input.value.trim() : '');
  if (!newName || newName === _activeGroupData.name) return;
  const btn = document.querySelector('.group-rename-btn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }
  await sbUpsert('group_chats', { id: activeGroupChatId, name: newName }, 'id');
  _activeGroupData.name = newName;
  _invalidateGroupCache();
  const headerName = document.getElementById('chat-header-name');
  if (headerName) headerName.textContent = escHtml(newName);
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
  const _dateOpts    = { weekday: 'short', month: 'short', day: 'numeric' };
  const todayStr     = new Date().toLocaleDateString('en-US', _dateOpts);
  const yesterdayStr = new Date(Date.now() - 86400000).toLocaleDateString('en-US', _dateOpts);

  msgs.forEach(m => {
    const ts      = new Date(m.created_at).getTime();
    const dateStr = new Date(m.created_at).toLocaleDateString('en-US', _dateOpts);
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      const label = dateStr === todayStr ? 'Today' : dateStr === yesterdayStr ? 'Yesterday' : dateStr;
      parts.push(`<div class="chat-date-divider">${escHtml(label)}</div>`);
    }
    const mine   = m.from_email === currentUser.email;
    const u      = accounts.find(a => a.email === m.from_email);
    const uInit  = u ? getInitials(u) : '?';
    const uColor = avatarColor(u);
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

  if (input) { input.value = ''; input.style.height = 'auto'; }

  const now = new Date().toISOString();

  const container = document.getElementById('chat-messages');
  if (container) {
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

  /* Update the sender's own conv list preview and move group to top */
  _updateGroupConvPreview(activeGroupChatId, 'You', text, now);

  sendGroupMessageToDB(activeGroupChatId, text);
}

/* ══════════════════════════════════════
   GROUP PICKER MODAL
══════════════════════════════════════ */
let _groupPickerSelected = new Set();
let _groupPickerBuddies  = [];

async function openGroupPickerModal(postId = null) {
  if (!currentUser) return;
  _groupPickerSelected = new Set();
  const modal = document.getElementById('group-picker-modal');
  if (modal) {
    modal.classList.add('open');
    // Persist postId so createGroupChat() can wire it to group_chats.post_id
    modal.dataset.postId = postId || '';
  }

  const [allMatches, accounts] = await Promise.all([
    loadMatches ? loadMatches() : [],
    _getAccounts(),
  ]);

  const connectedEmails = allMatches
    .filter(m => m.status === 'accepted' && (m.from === currentUser.email || m.to === currentUser.email))
    .map(m => m.from === currentUser.email ? m.to : m.from);

  const buddies = accounts.filter(a => connectedEmails.includes(a.email));
  _groupPickerBuddies = buddies;
  _renderGroupPickerList(buddies);
  _updateGroupPickerSelected(accounts);
  _updateGroupCreateBtn();
}

function _renderGroupPickerList(buddies, filterQ = '') {
  const list = document.getElementById('group-picker-list');
  if (!list) return;
  const filtered = filterQ ? buddies.filter(b => b.name.toLowerCase().includes(filterQ.toLowerCase())) : buddies;
  if (!filtered.length) {
    list.innerHTML = `<div class="group-picker-empty">No connected buddies found. Connect with someone first!</div>`;
    return;
  }
  list.innerHTML = filtered.map(b => {
    const init  = getInitials(b);
    const color = avatarColor(b);
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
    const acc  = accounts.find(a => a.email === email);
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

function filterGroupPickerList(q) {
  _renderGroupPickerList(_groupPickerBuddies, q);
}

function closeGroupPickerModal(e) {
  if (e && e.target !== document.getElementById('group-picker-modal')) return;
  document.getElementById('group-picker-modal')?.classList.remove('open');
}

async function createGroupChat() {
  if (!currentUser || !_groupPickerSelected.size) return;
  const nameInput = document.getElementById('group-chat-name');
  const name      = (nameInput ? nameInput.value.trim() : '') || 'Study Group';
  const gcId      = 'gc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const members   = [currentUser.email, ..._groupPickerSelected];

  // Read postId stored when the modal opened
  const modal  = document.getElementById('group-picker-modal');
  const postId = modal?.dataset.postId || null;

  await sbUpsert('group_chats', {
    id:         gcId,
    post_id:    postId || null,
    name,
    host_email: currentUser.email,
    members,
    created_at: new Date().toISOString(),
  }, 'id');

  modal?.classList.remove('open');
  if (nameInput) nameInput.value = '';
  _groupPickerSelected = new Set();
  _invalidateGroupCache();
  showToast(`Group "${escHtml(name)}" created!`);
  await renderConvList();
  await openGroupChat(gcId);
}

