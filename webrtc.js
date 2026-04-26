/*!
 * StudyBuddy WebRTC Module  v1.0
 * ─────────────────────────────────────────────────────────────
 * Mesh peer-to-peer video using Supabase Realtime for signalling.
 * Signals are written to `call_signals` table; Realtime triggers
 * delivery. Each participant opens one RTCPeerConnection per peer.
 *
 * Global exports (one object, no leaks):
 *   window.SBCall.start(sessionId, currentUserEmail, supabaseClient)
 *   window.SBCall.leave()
 *   window.SBCall.toggleMic()
 *   window.SBCall.toggleCam()
 *   window.SBCall.getLocalStream()
 *   window.SBCall.isActive()
 * ─────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  /* ── ICE servers (STUN only — free, sufficient for most networks) */
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
  ];

  /* ── Module state ──────────────────────────────────────────── */
  let _sessionId   = null;
  let _myEmail     = null;
  let _sb          = null;          // supabase client
  let _localStream = null;
  let _micOn       = true;
  let _camOn       = true;
  let _channel     = null;          // Supabase Realtime channel
  let _peers       = {};            // { email: RTCPeerConnection }
  let _active      = false;
  let _pollTimer   = null;          // periodic participant re-scan

  /* ── DOM helpers ───────────────────────────────────────────── */
  function _grid()    { return document.getElementById('video-grid'); }
  /* Use vtile-local for self to match renderVideoGrid in app.js */
  function _tileId(e) {
    return e === _myEmail
      ? 'vtile-local'
      : 'vtile-' + e.replace(/[^a-z0-9]/gi, '_');
  }

  /* ══════════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════════ */

  /**
   * Start a call inside the given session room.
   * @param {string} sessionId   — room id from sessions table
   * @param {string} userEmail   — currentUser.email
   * @param {object} sbClient    — supabase client instance
   * @param {object} [opts]
   * @param {boolean} [opts.video=true]
   */
  async function start(sessionId, userEmail, sbClient, opts = {}) {
    if (_active) await leave();                    // clean up any previous call

    _sessionId = sessionId;
    _myEmail   = userEmail;
    _sb        = sbClient;
    _active    = true;

    const wantVideo = opts.video !== false;

    /* 1. Acquire local media */
    await _acquireMedia(wantVideo);

    /* 2. Render my own local tile */
    _renderLocalTile();

    /* 3. Subscribe to Realtime signalling */
    _subscribeSignals();

    /* 4. Announce presence + initiate offers to existing participants */
    await _announceAndConnect();

    /* 5. Periodic re-scan for new participants (fallback) */
    _pollTimer = setInterval(_scanParticipants, 8000);

    _updateButtons();
    return _localStream;
  }

  /**
   * Leave the call — stops media, closes peers, cleans DOM.
   */
  async function leave() {
    _active = false;

    /* Stop poll */
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }

    /* Unsubscribe Realtime */
    if (_channel) {
      try { await _sb.removeChannel(_channel); } catch (_) {}
      _channel = null;
    }

    /* Close all peer connections */
    for (const [email, pc] of Object.entries(_peers)) {
      try { pc.close(); } catch (_) {}
      _removeTile(email);
    }
    _peers = {};

    /* Stop local tracks */
    if (_localStream) {
      _localStream.getTracks().forEach(t => t.stop());
      _localStream = null;
    }

    /* Clear local tile */
    const grid = _grid();
    if (grid) grid.innerHTML = '';

    _sessionId = _myEmail = _sb = null;
    _micOn = _camOn = true;
    _updateButtons();
  }

  function toggleMic() {
    if (!_localStream) return;
    _micOn = !_micOn;
    _localStream.getAudioTracks().forEach(t => t.enabled = _micOn);
    _updateButtons();
    _refreshLocalTile();
  }

  function toggleCam() {
    if (!_localStream) return;
    _camOn = !_camOn;
    _localStream.getVideoTracks().forEach(t => t.enabled = _camOn);
    _updateButtons();
    _refreshLocalTile();
  }

  function getLocalStream() { return _localStream; }
  function isActive()       { return _active; }

  /* ══════════════════════════════════════════════════════════════
     MEDIA
  ══════════════════════════════════════════════════════════════ */

  async function _acquireMedia(wantVideo) {
    try {
      _localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      _micOn = true;
      _camOn = wantVideo;
    } catch (err) {
      _localStream = null;
      _micOn = _camOn = false;
      const msg = err.name === 'NotAllowedError'
        ? '🎥 Camera/mic blocked — allow access in browser settings.'
        : err.name === 'NotFoundError'
        ? '🎥 No camera or microphone detected.'
        : `Media error: ${err.message}`;
      /* show in-app toast if available, else console */
      if (typeof showToast === 'function') showToast(msg);
      else console.warn('[SBCall]', msg);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     SIGNALLING  (Supabase Realtime + call_signals table)
  ══════════════════════════════════════════════════════════════ */

  function _subscribeSignals() {
    /* Subscribe to INSERT events on call_signals for this session */
    _channel = _sb
      .channel('call_signals:' + _sessionId)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'call_signals',
          filter: `session_id=eq.${_sessionId}`,
        },
        (payload) => _handleSignal(payload.new)
      )
      .subscribe();
  }

  async function _sendSignal(toEmail, type, data) {
    try {
      await _sb.from('call_signals').insert({
        id:           crypto.randomUUID(),
        session_id:   _sessionId,
        sender_email: _myEmail,
        receiver_email: toEmail,
        type,
        data:         JSON.stringify(data),
        created_at:   new Date().toISOString(),
      });
    } catch (err) {
      console.error('[SBCall] sendSignal error:', err);
    }
  }

  async function _handleSignal(row) {
    /* Ignore signals not addressed to us or sent by us */
    if (row.sender_email === _myEmail)        return;
    if (row.receiver_email && row.receiver_email !== _myEmail) return;

    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const from = row.sender_email;

    switch (row.type) {
      case 'offer':     await _handleOffer(from, data);     break;
      case 'answer':    await _handleAnswer(from, data);    break;
      case 'candidate': await _handleCandidate(from, data); break;
      default: break;
    }
  }

  /* ══════════════════════════════════════════════════════════════
     PEER CONNECTION MANAGEMENT
  ══════════════════════════════════════════════════════════════ */

  /**
   * Called once on join. Fetches participant list from sessions table
   * and sends an offer to each existing participant.
   */
  async function _announceAndConnect() {
    const participants = await _fetchParticipants();
    for (const email of participants) {
      if (email === _myEmail) continue;
      if (_peers[email])      continue;        // already connected
      await _createOffer(email);
    }
  }

  async function _scanParticipants() {
    if (!_active) return;
    const participants = await _fetchParticipants();
    for (const email of participants) {
      if (email === _myEmail) continue;
      if (_peers[email])      continue;
      await _createOffer(email);
    }
    /* Remove tiles for users no longer in session */
    for (const email of Object.keys(_peers)) {
      if (!participants.includes(email)) {
        _closePeer(email);
      }
    }
  }

  async function _fetchParticipants() {
    try {
      const { data } = await _sb
        .from('sessions')
        .select('participants')
        .eq('id', _sessionId)
        .single();
      return data?.participants || [];
    } catch (_) { return []; }
  }

  /* Create a new RTCPeerConnection for a remote peer */
  function _createPC(remoteEmail) {
    if (_peers[remoteEmail]) return _peers[remoteEmail];

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    _peers[remoteEmail] = pc;

    /* Add local tracks */
    if (_localStream) {
      _localStream.getTracks().forEach(track => pc.addTrack(track, _localStream));
    }

    /* ICE candidates → send to peer */
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        _sendSignal(remoteEmail, 'candidate', candidate.toJSON());
      }
    };

    /* Remote tracks → render in grid */
    pc.ontrack = ({ streams }) => {
      if (streams && streams[0]) {
        _renderRemoteTile(remoteEmail, streams[0]);
      }
    };

    /* Connection state monitoring */
    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        _closePeer(remoteEmail);
      }
    };

    /* Render placeholder tile immediately */
    _renderRemoteTile(remoteEmail, null);

    return pc;
  }

  async function _createOffer(remoteEmail) {
    const pc     = _createPC(remoteEmail);
    const offer  = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await _sendSignal(remoteEmail, 'offer', { sdp: offer.sdp, type: offer.type });
  }

  async function _handleOffer(from, data) {
    const pc = _createPC(from);
    await pc.setRemoteDescription(new RTCSessionDescription(data));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await _sendSignal(from, 'answer', { sdp: answer.sdp, type: answer.type });
  }

  async function _handleAnswer(from, data) {
    const pc = _peers[from];
    if (!pc) return;
    if (pc.signalingState === 'stable') return; // already set
    await pc.setRemoteDescription(new RTCSessionDescription(data));
  }

  async function _handleCandidate(from, data) {
    const pc = _peers[from];
    if (!pc || !data) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data));
    } catch (err) {
      /* Safe to ignore — candidates can arrive out of order */
      console.warn('[SBCall] ICE candidate error (non-fatal):', err.message);
    }
  }

  function _closePeer(email) {
    const pc = _peers[email];
    if (pc) { try { pc.close(); } catch (_) {} }
    delete _peers[email];
    _removeTile(email);
  }

  /* ══════════════════════════════════════════════════════════════
     VIDEO TILE RENDERING
  ══════════════════════════════════════════════════════════════ */

  function _renderLocalTile() {
    const grid = _grid();
    if (!grid) return;

    const id   = _tileId(_myEmail);
    let   tile = document.getElementById(id);

    /* If renderVideoGrid already created the tile, reuse it — don't prepend a new one */
    if (!tile) {
      tile = _makeTile(id, _myEmail, true);
      grid.prepend(tile);
    }

    const videoEl  = tile.querySelector('video');
    const avatarEl = tile.querySelector('.video-tile-avatar');
    const hasVideo = _localStream && _localStream.getVideoTracks().some(t => t.enabled);

    if (videoEl) {
      if (hasVideo && _localStream) {
        videoEl.srcObject = _localStream;
        videoEl.style.display = '';
        videoEl.play().catch(() => {});
        if (avatarEl) avatarEl.style.display = 'none';
      } else {
        videoEl.srcObject = null;
        videoEl.style.display = 'none';
        if (avatarEl) avatarEl.style.display = 'flex';
      }
    }
  }

  function _renderRemoteTile(email, stream) {
    const grid = _grid();
    if (!grid) return;

    const id   = _tileId(email);
    let   tile = document.getElementById(id);

    if (!tile) {
      tile = _makeTile(id, email, false);
      grid.appendChild(tile);
    }

    if (!stream) return;   // placeholder tile, stream not yet ready

    const videoEl  = tile.querySelector('video');
    const avatarEl = tile.querySelector('.video-tile-avatar');

    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.style.display = '';
      videoEl.play().catch(() => {});
      if (avatarEl) avatarEl.style.display = 'none';
    }
  }

  function _makeTile(id, email, isSelf) {
    /* Look up account info if available */
    const name  = _resolveDisplayName(email);
    const init  = _resolveInitials(email);
    const color = _resolveAvatarColor(email);

    const tile  = document.createElement('div');
    tile.className = 'video-tile';
    tile.id = id;
    tile.innerHTML = `
      <video autoplay playsinline ${isSelf ? 'muted' : ''} style="display:none"></video>
      <div class="video-tile-avatar" style="display:flex">
        <div class="video-tile-av-circle" style="background:${color}">${_esc(init)}</div>
        <div class="video-tile-name">${_esc(name)}${isSelf ? ' (You)' : ''}</div>
      </div>
      <div class="video-tile-label">
        ${_esc(isSelf ? 'You' : name.split(' ')[0])}
        <span class="tile-mic-off" style="${isSelf && !_micOn ? '' : 'display:none'}">🔇</span>
      </div>`;
    return tile;
  }

  function _removeTile(email) {
    const el = document.getElementById(_tileId(email));
    if (el) el.remove();
  }

  function _refreshLocalTile() {
    const tile = document.getElementById(_tileId(_myEmail));
    if (!tile) return;
    const videoEl  = tile.querySelector('video');
    const avatarEl = tile.querySelector('.video-tile-avatar');
    const hasVideo = _localStream && _localStream.getVideoTracks().some(t => t.enabled);

    if (videoEl) {
      if (hasVideo) {
        videoEl.srcObject = _localStream;
        videoEl.style.display = '';
        videoEl.play().catch(() => {});
        if (avatarEl) avatarEl.style.display = 'none';
      } else {
        videoEl.srcObject = null;
        videoEl.style.display = 'none';
        if (avatarEl) avatarEl.style.display = 'flex';
      }
    }
    const micOff = tile.querySelector('.tile-mic-off');
    if (micOff) micOff.style.display = _micOn ? 'none' : '';
  }

  /* ══════════════════════════════════════════════════════════════
     BUTTON STATE SYNC  (works with both old and new button IDs)
  ══════════════════════════════════════════════════════════════ */

  function _updateButtons() {
    /* Mic */
    const micBtn = document.getElementById('btn-toggle-mic');
    const micLbl = document.getElementById('mic-label');
    if (micBtn) {
      micBtn.classList.toggle('muted-btn', !_micOn);
      const on  = micBtn.querySelector('.mic-on');
      const off = micBtn.querySelector('.mic-off');
      if (on)  on.style.display  = _micOn ? '' : 'none';
      if (off) off.style.display = _micOn ? 'none' : '';
    }
    if (micLbl) micLbl.textContent = _micOn ? 'Mute' : 'Unmute';

    /* Cam */
    const camBtn = document.getElementById('btn-toggle-cam');
    const camLbl = document.getElementById('cam-label');
    if (camBtn) {
      camBtn.classList.toggle('muted-btn', !_camOn);
      const on  = camBtn.querySelector('.cam-on');
      const off = camBtn.querySelector('.cam-off');
      if (on)  on.style.display  = _camOn ? '' : 'none';
      if (off) off.style.display = _camOn ? 'none' : '';
    }
    if (camLbl) camLbl.textContent = _camOn ? 'Stop Video' : 'Start Video';
  }

  /* ══════════════════════════════════════════════════════════════
     ACCOUNT CACHE  (populated by app.js)
  ══════════════════════════════════════════════════════════════ */

  let _accountCache = [];
  function setAccountCache(accounts) { _accountCache = accounts || []; }

  function _resolveDisplayName(email) {
    const a = _accountCache.find(x => x.email === email);
    return a ? (a.name || email) : email;
  }
  function _resolveInitials(email) {
    const a = _accountCache.find(x => x.email === email);
    if (!a) return email[0].toUpperCase();
    if (a.initials) return a.initials;
    return (a.name || email).split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
  }
  function _resolveAvatarColor(email) {
    const a = _accountCache.find(x => x.email === email);
    const COLORS = [
      'linear-gradient(135deg,#7c3aed,#a78bfa)',
      'linear-gradient(135deg,#6d28d9,#c4b5fd)',
      'linear-gradient(135deg,#0369a1,#38bdf8)',
      'linear-gradient(135deg,#065f46,#34d399)',
      'linear-gradient(135deg,#9f1239,#fb7185)',
    ];
    if (a?.avatarColor) return a.avatarColor;
    /* Deterministic colour from email hash */
    let h = 0;
    for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
    return COLORS[Math.abs(h) % COLORS.length];
  }

  /* ══════════════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════════════ */

  function _esc(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ── Expose public surface ─────────────────────────────────── */
  global.SBCall = {
    start,
    leave,
    toggleMic,
    toggleCam,
    getLocalStream,
    isActive,
    setAccountCache,
  };

})(window);
