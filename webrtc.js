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

  /* ══════════════════════════════════════════════════════════════
     METERED TURN CONFIGURATION
     Replace the two values below with your Metered credentials:
       METERED_API_KEY  → Metered dashboard → Settings → API Key
       METERED_DOMAIN   → e.g. "studybuddy.metered.live"

     On every call start, _getIceServers() fetches short-lived
     TURN credentials from Metered's API. If the fetch fails
     it falls back to STUN-only so calls still work on open networks.

     Free tier: 50 GB/month relayed — enough for hundreds of sessions.
  ══════════════════════════════════════════════════════════════ */
  const METERED_API_KEY = 'MqxXJ7f55T64IsvzO8URYxyJlF0VHkOOncJCHojeSdyGW09T';
  const METERED_DOMAIN  = 'study-buddy.metered.live';

  /* STUN-only fallback — used when Metered fetch fails */
  const STUN_ONLY = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
  ];

  /* Cache credentials for 4 min — avoid hammering the API when
     multiple peers join in quick succession */
  let _iceCache   = null;
  let _iceCacheTs = 0;
  const ICE_TTL_MS = 4 * 60 * 1000;

  async function _getIceServers() {
    const now = Date.now();
    if (_iceCache && (now - _iceCacheTs) < ICE_TTL_MS) return _iceCache;
    try {
      const res = await fetch(
        `https://${METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`,
        { method: 'GET', headers: { Accept: 'application/json' } }
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const servers = await res.json();
      if (!Array.isArray(servers) || !servers.length) throw new Error('empty response');
      _iceCache   = servers;
      _iceCacheTs = now;
      console.log('[SBCall] Fetched', servers.length, 'ICE servers from Metered.');
      return _iceCache;
    } catch (err) {
      console.warn('[SBCall] Metered fetch failed — falling back to STUN only:', err.message);
      return STUN_ONLY;
    }
  }

  /* ── Module state ──────────────────────────────────────────── */
  let _sessionId       = null;
  let _myEmail         = null;
  let _sb              = null;
  let _localStream     = null;   // kept alive across rooms — never stopped unless logout
  let _micOn           = true;
  let _camOn           = true;
  let _channel         = null;
  let _peers           = {};
  let _active          = false;
  let _pollTimer       = null;
  let _screenStream    = null;
  let _screenSharing   = false;

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

    /* 4. Pre-fetch ICE credentials so first peer connection has no delay */
    await _getIceServers();

    /* 5. Announce presence + initiate offers to existing participants */
    await _announceAndConnect();

    /* 6. Periodic re-scan for new participants (fallback) */
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

    /* Stop screen share if active */
    if (_screenStream) {
      _screenStream.getTracks().forEach(t => t.stop());
      _screenStream = null;
    }
    _screenSharing = false;

    /* ── Do NOT stop _localStream tracks ──
       Keeping the stream alive means the browser considers permission
       already granted — no re-prompt on the next room join.
       Tracks are only fully stopped by releaseMedia() called at logout. */

    /* Clear grid tiles */
    const grid = _grid();
    if (grid) grid.innerHTML = '';

    _sessionId = _myEmail = _sb = null;
    _micOn = _camOn = true;
    _updateButtons();
  }

  /**
   * Fully release the local media stream — call only on logout.
   * After this, the next join will re-prompt for permission.
   */
  function releaseMedia() {
    if (_localStream) {
      _localStream.getTracks().forEach(t => t.stop());
      _localStream = null;
    }
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
    // ── Reuse existing live stream if tracks are still running ──
    // This means permission is only asked ONCE — on first room join.
    // Subsequent joins reuse the same stream with no prompt.
    if (_localStream) {
      const tracks = _localStream.getTracks();
      if (tracks.length && tracks.every(t => t.readyState === 'live')) {
        // Re-enable all tracks (they may have been muted last session)
        _localStream.getAudioTracks().forEach(t => { t.enabled = true; });
        if (wantVideo) {
          _localStream.getVideoTracks().forEach(t => { t.enabled = true; });
        } else {
          _localStream.getVideoTracks().forEach(t => { t.enabled = false; });
        }
        _micOn = true;
        _camOn = wantVideo;
        return;
      }
    }
    // ── First join or stream died — request permission ──
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
      if (typeof showToast === 'function') showToast(msg);
      else console.warn('[SBCall]', msg);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     SIGNALLING  (Supabase Realtime + call_signals table)
  ══════════════════════════════════════════════════════════════ */

  function _subscribeSignals() {
    /* Use Supabase Broadcast — works with anon key, no RLS issues,
       zero latency vs postgres_changes which requires authenticated role. */
    _channel = _sb
      .channel('sbcall:' + _sessionId, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'signal' }, ({ payload }) => _handleSignal(payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[SBCall] Realtime channel subscribed:', 'sbcall:' + _sessionId);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[SBCall] Realtime channel error:', status);
        }
      });
  }

  async function _sendSignal(toEmail, type, data) {
    // Guard: module may have been torn down between the async call being
    // scheduled and it actually executing (e.g. leave() nulls these out).
    if (!_sb || !_sessionId || !_myEmail || !_channel) {
      console.warn('[SBCall] sendSignal skipped — session already torn down');
      return;
    }
    try {
      await _channel.send({
        type:    'broadcast',
        event:   'signal',
        payload: {
          session_id:     _sessionId,
          sender_email:   _myEmail,
          receiver_email: toEmail,
          type,
          data,
        },
      });
    } catch (err) {
      console.error('[SBCall] sendSignal error:', err);
    }
  }

  async function _handleSignal(payload) {
    /* Ignore signals not addressed to us or sent by us.
       payload shape: { session_id, sender_email, receiver_email, type, data } */
    if (!_active || !_myEmail) return;
    if (payload.sender_email === _myEmail) return;
    if (payload.receiver_email && payload.receiver_email !== _myEmail) return;

    // data is already a plain object (broadcast, not DB row)
    const data = payload.data;
    const from = payload.sender_email;

    switch (payload.type) {
      case 'offer':      await _handleOffer(from, data);      break;
      case 'answer':     await _handleAnswer(from, data);     break;
      case 'candidate':  await _handleCandidate(from, data);  break;
      case 'highlight':    _handleHighlight(data);                        break;
      case 'room_state':   _handleRoomState(data);                        break;
      case 'kick':
        if (typeof handleIncomingKick === 'function') handleIncomingKick(payload);
        break;
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
    if (!_active || !_sb || !_sessionId || !_myEmail) return;
    const participants = await _fetchParticipants();
    for (const email of participants) {
      if (email === _myEmail) continue;
      if (_peers[email])      continue;        // already connected
      await _createOffer(email);
    }
  }

  async function _scanParticipants() {
    if (!_active || !_sb || !_sessionId || !_myEmail) return;
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
        // ── Clear spotlight only when DB confirms the person is gone ──
        // This is the authoritative check — not a transient connection event.
        if (typeof onHighlightedParticipantLeft === 'function') {
          onHighlightedParticipantLeft(email);
        }
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
  async function _createPC(remoteEmail) {
    if (_peers[remoteEmail]) return _peers[remoteEmail];

    const iceServers = await _getIceServers();
    const pc = new RTCPeerConnection({ iceServers });
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
      const state = pc.connectionState;

      // 'disconnected' is transient — a brief network hiccup can cause it
      // and the connection often recovers on its own.  Only treat 'failed'
      // and 'closed' as terminal so a momentary blip never tears down the
      // peer or clears the spotlight for the wrong reason.
      if (state === 'failed' || state === 'closed') {
        _closePeer(remoteEmail);
        return;
      }

      // ── Screen-share catch-up for late joiners ──────────────────────
      // replaceTrack() only works reliably once the DTLS transport is open.
      // Doing it at 'connected' guarantees the sender is fully negotiated,
      // so the late joiner receives the screen stream instead of the camera.
      if (state === 'connected' && _screenSharing && _screenStream) {
        const screenTrack = _screenStream.getVideoTracks()[0];
        if (screenTrack) {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack).catch(e => {
              console.warn('[SBCall] replaceTrack (connected catch-up):', e);
            });
          }
        }
      }
    };

    /* Render placeholder tile immediately */
    _renderRemoteTile(remoteEmail, null);

    return pc;
  }

  async function _createOffer(remoteEmail) {
    const pc     = await _createPC(remoteEmail);
    const offer  = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await _sendSignal(remoteEmail, 'offer', { sdp: offer.sdp, type: offer.type });
  }

  async function _handleOffer(from, data) {
    // ── Glare guard ────────────────────────────────────────────────────
    // Both peers can call _createOffer simultaneously (_announceAndConnect
    // and _scanParticipants racing).  If we are already in 'have-local-offer'
    // for this peer, both sides sent an offer at the same time (glare).
    // Resolve by letting the peer with the lexicographically higher email win:
    // the winner ignores the incoming offer; the loser rolls back their offer
    // and accepts the incoming one instead.
    const existing = _peers[from];
    if (existing && existing.signalingState === 'have-local-offer') {
      if (_myEmail > from) {
        // We win — discard their offer; they will accept ours as an answer.
        return;
      }
      // We lose — roll back our pending offer before accepting theirs.
      try { await existing.setLocalDescription({ type: 'rollback' }); } catch (_) {}
    }

    const pc = await _createPC(from);

    // Ignore duplicate offers on an already-stable connection.
    if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-remote-offer') {
      return;
    }

    await pc.setRemoteDescription(new RTCSessionDescription(data));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await _sendSignal(from, 'answer', { sdp: answer.sdp, type: answer.type });

    // ── If we are the host, send the current room state to the new joiner ──
    // This gives them the active highlight + screen-share status immediately,
    // without waiting for the next broadcast cycle.
    const hostEmail = typeof window !== 'undefined' ? window._sbRoomHostEmail : null;
    if (hostEmail && hostEmail === _myEmail) {
      const highlightedEmail = typeof window !== 'undefined'
        ? (window._sbHighlightedEmail || null)
        : null;
      await _sendSignal(from, 'room_state', {
        highlightedEmail: highlightedEmail,
        isScreenSharing:  _screenSharing,
      });
    }
  }

  async function _handleAnswer(from, data) {
    const pc = _peers[from];
    if (!pc) return;
    // Only accept an answer when we are waiting for one.
    // Any other state (stable = already connected, have-remote-offer = glare)
    // means this answer is stale or out of order — discard it silently.
    if (pc.signalingState !== 'have-local-offer') return;
    await pc.setRemoteDescription(new RTCSessionDescription(data));
    // Screen-track catch-up for this peer is handled in _createPC()'s
    // onconnectionstatechange when state === 'connected', after ICE completes.
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
    // Note: highlight state is NOT cleared here.
    // _scanParticipants() is the authoritative place — it checks the DB
    // and calls onHighlightedParticipantLeft() only when the person is
    // confirmed absent from the session, not on a transient disconnect.
  }

  /* ══════════════════════════════════════════════════════════════
     HIGHLIGHT SIGNALLING
     The host calls broadcastHighlight(email|null) to spotlight
     a participant. All clients receive a 'highlight' broadcast
     and call app.js onHighlightReceived() to update their grid.
  ══════════════════════════════════════════════════════════════ */

  /**
   * Broadcast a highlight change to all participants.
   * Called by app.js applyHighlight() — host only.
   * @param {string|null} email  participant to spotlight, or null to clear
   */
  async function broadcastHighlight(email) {
    if (!_active || !_channel || !_myEmail) return;
    try {
      await _channel.send({
        type:    'broadcast',
        event:   'signal',
        payload: {
          session_id:     _sessionId,
          sender_email:   _myEmail,
          receiver_email: null,   // null = send to all participants
          type:           'highlight',
          data:           { email: email || null },
        },
      });
    } catch (err) {
      console.error('[SBCall] broadcastHighlight error:', err);
    }
  }

  /**
   * Handle an incoming highlight signal from the host.
   * Delegates to app.js onHighlightReceived() which owns the DOM.
   */
  function _handleHighlight(data) {
    if (typeof onHighlightReceived === 'function') {
      onHighlightReceived(data && data.email ? data.email : null);
    }
  }

  /**
   * Handle the room_state handshake sent by the host to a new joiner.
   * Carries { highlightedEmail, isScreenSharing } so the joiner's UI
   * immediately reflects the room's current state without a full re-render.
   */
  function _handleRoomState(data) {
    if (typeof onRoomStateReceived === 'function') {
      onRoomStateReceived(data || {});
    }
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

      // ── Place tile in the right container ──
      // If spotlight mode is active the non-spotlight tiles live inside
      // #sr-thumb-strip, not in the grid root.  Appending to the grid root
      // would place the tile outside the thumb row and break the layout.
      const thumbStrip = document.getElementById('sr-thumb-strip');
      if (thumbStrip && grid.classList.contains('spotlight')) {
        thumbStrip.appendChild(tile);
      } else {
        grid.appendChild(tile);
      }
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
     SCREEN SHARE
     Uses replaceTrack() on every active peer connection — no
     renegotiation needed, works on all modern browsers.
  ══════════════════════════════════════════════════════════════ */

  async function shareScreen() {
    if (_screenSharing) return;
    try {
      _screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: false,
      });
      _screenSharing = true;

      const screenTrack = _screenStream.getVideoTracks()[0];

      // Replace the video track on every active peer connection
      for (const pc of Object.values(_peers)) {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          try { await sender.replaceTrack(screenTrack); } catch (e) {
            console.warn('[SBCall] replaceTrack (screen):', e);
          }
        }
      }

      // Show screen stream in local tile
      _showStreamInLocalTile(_screenStream);

      // When user stops sharing via browser UI, restore camera
      screenTrack.addEventListener('ended', () => stopScreenShare());

      _updateScreenBtn(true);
    } catch (err) {
      _screenSharing = false;
      _screenStream  = null;
      if (err.name !== 'NotAllowedError') console.warn('[SBCall] getDisplayMedia:', err);
    }
  }

  async function stopScreenShare() {
    if (!_screenSharing) return;

    if (_screenStream) {
      _screenStream.getTracks().forEach(t => t.stop());
      _screenStream = null;
    }
    _screenSharing = false;

    // Restore original camera track on every peer connection
    const camTrack = _localStream ? _localStream.getVideoTracks()[0] : null;
    for (const pc of Object.values(_peers)) {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        try { await sender.replaceTrack(camTrack || null); } catch (e) {
          console.warn('[SBCall] replaceTrack (cam restore):', e);
        }
      }
    }

    // Restore camera in local tile
    _showStreamInLocalTile(_localStream);
    _updateScreenBtn(false);
  }

  function isScreenSharing() { return _screenSharing; }

  /* Update the local tile to show whichever stream is active */
  function _showStreamInLocalTile(stream) {
    const tile     = document.getElementById(_tileId(_myEmail));
    if (!tile) return;
    const videoEl  = tile.querySelector('video');
    const avatarEl = tile.querySelector('.video-tile-avatar');
    const hasVideo = stream && stream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled);
    if (videoEl) {
      if (hasVideo) {
        videoEl.srcObject = stream;
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

  function _updateScreenBtn(sharing) {
    const btn = document.getElementById('btn-toggle-screen');
    const lbl = document.getElementById('screen-label');
    if (btn) btn.classList.toggle('active-media', sharing);
    if (lbl) lbl.textContent = sharing ? 'Stop Share' : 'Share Screen';
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
      'linear-gradient(135deg,#071d2e,#0d2b42)',
      'linear-gradient(135deg,#0d2b42,#e8b468)',
      'linear-gradient(135deg,#0369a1,#38bdf8)',
      'linear-gradient(135deg,#065f46,#34d399)',
      'linear-gradient(135deg,#9f1239,#fb7185)',
    ];
    if (a?.avatarColor) return (typeof sanitizeAvatarColor === 'function' ? sanitizeAvatarColor(a.avatarColor) : a.avatarColor);
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
  function getScreenStream() { return _screenStream; }

  global.SBCall = {
    start,
    leave,
    toggleMic,
    toggleCam,
    getLocalStream,
    getScreenStream,
    isActive,
    setAccountCache,
    releaseMedia,
    shareScreen,
    stopScreenShare,
    isScreenSharing,
    broadcastHighlight,
  };

})(window);