/* ═══════════════════════════════════════════════════════════
   STUDY BUDDY — notepad.js
   Personal notepad: folders, notes, rich-text editor,
   per-note whiteboard tab, pin, search, autosave.

   Dependencies (globals from other files):
     app.js        → currentUser, sb, sbSelect, sbUpsert,
                     escHtml, showToast, getInitials
     whiteboard.js → StudyBuddyWhiteboard
   ═══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
let _npFolders    = [];        // { id, name, color, authorEmail }[]
let _npNotes      = [];        // { id, title, content, folderId, … }[]
let _npActiveId   = null;      // currently open note id
let _npActiveTab  = 'write';   // 'write' | 'whiteboard'
let _npWhiteboard = null;      // StudyBuddyWhiteboard instance
let _npSaveTimer  = null;      // debounce timer
let _npDirty      = false;     // unsaved changes flag
let _npSearchQ    = '';        // current search query

let _expandedFolders = new Set();

/* ══════════════════════════════════════
   MOBILE TWO-SCREEN FLOW
   On screens ≤720px the layout switches between
   a full-screen file list and a full-screen editor.
   The CSS handles the slide animation via .np-editor-open
   on .np-layout and body.np-editing-mobile.
══════════════════════════════════════ */
function _npIsMobile() {
  return window.matchMedia('(max-width: 720px)').matches;
}

function _npOpenEditorMobile() {
  const layout = document.querySelector('.np-layout');
  if (layout) layout.classList.add('np-editor-open');
  document.body.classList.add('np-editing-mobile');
}

function npGoBack() {
  // Autosave any unsaved changes before leaving the editor
  if (_npDirty && _npActiveId) saveNotepadNote(true);

  const layout = document.querySelector('.np-layout');
  if (layout) layout.classList.remove('np-editor-open');
  document.body.classList.remove('np-editing-mobile');
  // Deselect active note highlight so list looks clean
  document.querySelectorAll('.np-note-item').forEach(el =>
    el.classList.remove('np-note-item-active')
  );
}

/* ── Title input helper ──
   There are two title inputs: #np-note-title (mobile top bar)
   and #np-note-title-desktop (desktop title row). This helper
   reads/writes both so save and display stay in sync. */
function _npGetTitleValue() {
  // Prefer whichever is currently visible/active
  const mob = document.getElementById('np-note-title');
  const dsk = document.getElementById('np-note-title-desktop');
  // On mobile the mobile input is the live one; on desktop the desktop one.
  if (_npIsMobile()) return mob ? mob.value.trim() : (dsk ? dsk.value.trim() : '');
  return dsk ? dsk.value.trim() : (mob ? mob.value.trim() : '');
}

function _npSetTitleValue(val) {
  const mob = document.getElementById('np-note-title');
  const dsk = document.getElementById('np-note-title-desktop');
  if (mob) mob.value = val;
  if (dsk) dsk.value = val;
}

/* ══════════════════════════════════════
   SUPABASE HELPERS
   All reads go through sbSelect (from app.js).
   Writes go straight to sb to avoid extra round-trips.
══════════════════════════════════════ */
async function npLoadFolders() {
  if (!currentUser) return [];
  const rows = await sbSelect('notepad_folders');
  return rows
    .filter(r => r.author_email === currentUser.email)
    .map(r => ({
      id:          r.id,
      name:        r.name,
      color:       r.color || '#c8882a',
      authorEmail: r.author_email,
      createdAt:   new Date(r.created_at).getTime(),
    }));
}

async function npLoadNotes() {
  if (!currentUser) return [];
  const rows = await sbSelect('notes');
  return rows
    .filter(r => r.author_email === currentUser.email)
    .map(r => ({
      id:          r.id,
      title:       r.title        || 'Untitled',
      content:     r.content      || '',
      contentHtml: r.content_html || '',
      folderId:    r.folder_id    || null,
      subject:     r.subject      || '',
      tags:        r.tags         || [],
      isPinned:    r.is_pinned    || false,
      createdAt:   new Date(r.created_at).getTime(),
      updatedAt:   new Date(r.updated_at).getTime(),
    }));
}

async function npSaveNoteToDb(note) {
  await sbUpsert('notes', {
    id:           note.id,
    author_email: currentUser.email,
    title:        note.title       || '',
    content:      note.content     || '',
    content_html: note.contentHtml || '',
    folder_id:    note.folderId    || null,
    subject:      note.subject     || '',
    tags:         note.tags        || [],
    updated_at:   new Date().toISOString(),
  }, 'id');
}

async function npSaveFolderToDb(folder) {
  await sbUpsert('notepad_folders', {
    id:           folder.id,
    author_email: currentUser.email,
    name:         folder.name,
    color:        folder.color || '#c8882a',
  }, 'id');
}

async function npDeleteNoteFromDb(id) {
  await sb.from('notes').delete().eq('id', id);
}

async function npDeleteFolderFromDb(id) {
  await sb.from('notepad_folders').delete().eq('id', id);
}

/* ══════════════════════════════════════
   PAGE INIT
   Loads folders + notes in parallel.
══════════════════════════════════════ */
async function initNotepadPage() {
  if (!currentUser) return;
  showNotepadEmpty();
  document.getElementById('np-tree').innerHTML =
    '<div class="np-tree-empty">Loading…</div>';

  // Parallel fetch — faster than sequential
  [_npFolders, _npNotes] = await Promise.all([npLoadFolders(), npLoadNotes()]);
  renderNotepadTree();

  // Wire folder-modal colour presets
  document.querySelectorAll('.np-fc-preset').forEach(btn => {
    btn.onclick = () => {
      document.getElementById('np-folder-color-input').value = btn.dataset.color;
    };
  });

  // Ctrl+S to save open note
  document.addEventListener('keydown', _npKeyHandler);
}

function _npKeyHandler(e) {
  const panel = document.getElementById('app-notepad');
  if (!panel || panel.style.display === 'none') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveNotepadNote();
  }
}

/* ══════════════════════════════════════
   TREE RENDERING
   Pure in-memory — no DB calls.
══════════════════════════════════════ */
function filterNotepadTree() {
  _npSearchQ = (document.getElementById('np-search')?.value || '').toLowerCase().trim();
  const clear = document.getElementById('np-search-clear');
  if (clear) clear.style.display = _npSearchQ ? 'inline-flex' : 'none';
  renderNotepadTree();
}

function clearNpSearch() {
  const input = document.getElementById('np-search');
  const clear = document.getElementById('np-search-clear');
  if (input) input.value = '';
  if (clear) clear.style.display = 'none';
  _npSearchQ = '';
  renderNotepadTree();
}

function renderNotepadTree() {
  _npUpdateStats();

  const tree = document.getElementById('np-tree');
  if (!tree) return;

  const q = _npSearchQ;
  const matchNote = n => !q ||
    n.title.toLowerCase().includes(q) ||
    n.content.toLowerCase().includes(q) ||
    (n.subject || '').toLowerCase().includes(q);

  let html = '';

  // ── Pinned notes — always at top ──
  const pinned = _npNotes.filter(n => n.isPinned && matchNote(n));
  if (pinned.length) {
    html += `<div class="np-section-label">📌 Pinned</div>`;
    html += pinned.sort((a, b) => b.updatedAt - a.updatedAt).map(n => _noteTreeItem(n)).join('');
  }

  // ── Folders ──
  for (const folder of _npFolders.sort((a, b) => a.name.localeCompare(b.name))) {
    const children = _npNotes.filter(n => n.folderId === folder.id && !n.isPinned && matchNote(n));
    if (q && !children.length) continue;

    const open = _expandedFolders.has(folder.id) || !!q;
    const folderNoteCount = _npNotes.filter(n => n.folderId === folder.id).length;
    html += `
      <div class="np-folder" id="npf-${escHtml(folder.id)}">
        <div class="np-folder-card ${open ? 'open' : ''}">
          <div class="np-folder-card-hd" onclick="toggleNpFolder('${escHtml(folder.id)}')">
            <svg class="np-folder-chevron ${open ? 'open' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            <div class="np-folder-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div class="np-folder-card-info">
              <span class="np-folder-card-name">${escHtml(folder.name)}</span>
              <span class="np-folder-card-sub">${folderNoteCount} note${folderNoteCount !== 1 ? 's' : ''}</span>
            </div>
            <span class="np-folder-card-badge">${folderNoteCount}</span>
            <div class="np-folder-actions">
              <button title="New note in folder" onclick="event.stopPropagation();createNotepadNote('${escHtml(folder.id)}')">+</button>
              <button title="Delete folder"      onclick="event.stopPropagation();deleteNotepadFolder('${escHtml(folder.id)}')">✕</button>
            </div>
          </div>
          <div class="np-folder-children ${open ? 'open' : ''}">
            ${children.length
              ? children.sort((a, b) => b.updatedAt - a.updatedAt).map(n => _noteTreeItemFolded(n)).join('')
              : '<div class="np-folder-empty">No notes yet — press + to add one</div>'}
          </div>
        </div>
      </div>`;
  }

  // ── Root-level notes ──
  const rootNotes = _npNotes.filter(n => !n.folderId && !n.isPinned && matchNote(n));
  if (rootNotes.length || !_npFolders.length) {
    if (_npFolders.length || pinned.length) {
      html += `<div class="np-section-label">Ungrouped</div>`;
    }
    html += rootNotes.sort((a, b) => b.updatedAt - a.updatedAt).map(n => _noteTreeItem(n)).join('');
  }

  if (!html) {
    html = `<div class="np-tree-empty">
      ${q ? 'No notes match your search.' : 'No notes yet. Hit <strong>New Note</strong> to get started.'}
    </div>`;
  }

  tree.innerHTML = html;
}

function _noteTreeItem(note) {
  const active  = note.id === _npActiveId;
  const pinMark = note.isPinned ? ' 📌' : '';
  const snippet = note.contentHtml
    ? (new DOMParser().parseFromString(note.contentHtml, 'text/html').body.textContent || '').slice(0, 60)
    : note.content.slice(0, 60);
  const time = _npFmtShort(note.updatedAt);

  return `
    <div class="np-note-item ${active ? 'np-note-item-active' : ''}" id="npn-${escHtml(note.id)}"
         onclick="selectNotepadNote('${escHtml(note.id)}')">
      <div class="np-note-item-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <div class="np-note-item-body">
        <div class="np-note-item-title">${escHtml(note.title || 'Untitled')}${escHtml(pinMark)}</div>
        <div class="np-note-item-snippet">${snippet ? escHtml(snippet) : 'No content yet'}</div>
      </div>
      <div class="np-note-item-time">${time}</div>
    </div>`;
}

/* Indented variant used inside folder cards (Option C) */
function _noteTreeItemFolded(note) {
  const active = note.id === _npActiveId;
  const time   = _npFmtShort(note.updatedAt);
  return `
    <div class="np-folder-note-row ${active ? 'np-note-item-active' : ''}" id="npn-${escHtml(note.id)}"
         onclick="selectNotepadNote('${escHtml(note.id)}')">
      <svg class="np-folder-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span class="np-folder-note-title">${escHtml(note.title || 'Untitled')}</span>
      <span class="np-folder-note-time">${time}</span>
    </div>`;
}

function _npFmtShort(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'now';
  if (m < 60) return m + 'm';
  if (h < 24) return h + 'h';
  if (d < 7)  return d + 'd';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toggleNpFolder(folderId) {
  if (_expandedFolders.has(folderId)) {
    _expandedFolders.delete(folderId);
  } else {
    _expandedFolders.add(folderId);
  }
  renderNotepadTree();
}

/* ══════════════════════════════════════
   SELECT + VIEW NOTE
   Optimistic: editor populates instantly from in-memory
   state — zero DB calls needed.
══════════════════════════════════════ */
async function selectNotepadNote(id) {
  if (_npDirty && _npActiveId) await saveNotepadNote(true);

  _npActiveId = id;
  const note = _npNotes.find(n => n.id === id);
  if (!note) return;

  // ── Instant render from memory ──
  document.querySelectorAll('.np-note-item').forEach(el =>
    el.classList.toggle('np-note-item-active', el.id === `npn-${id}`)
  );

  _npSetTitleValue(note.title || '');
  document.getElementById('np-note-meta').textContent =
    'Updated ' + _npFmtDate(note.updatedAt);

  const subjectEl = document.getElementById('np-subject-input');
  if (subjectEl) subjectEl.value = note.subject || '';

  const folder   = _npFolders.find(f => f.id === note.folderId);
  const colorBar = document.getElementById('np-note-color-bar');
  if (colorBar) colorBar.style.background = folder ? folder.color : 'var(--brand-base)';

  const pinBtn = document.getElementById('np-pin-btn');
  if (pinBtn) pinBtn.classList.toggle('active', !!note.isPinned);

  const editor = document.getElementById('np-editor');
  if (editor) editor.innerHTML = note.contentHtml || note.content || '';

  document.getElementById('np-viewer-empty').style.display = 'none';
  document.getElementById('np-note-wrap').style.display    = 'flex';

  // Mobile: slide to full-screen editor
  _npOpenEditorMobile();

  await switchNotepadTab(_npActiveTab, true);
  _npDirty = false;
}

/* ══════════════════════════════════════
   TAB SWITCHING
══════════════════════════════════════ */
async function switchNotepadTab(tab, forceInit = false) {
  _npActiveTab = tab;

  document.getElementById('nptab-write')?.classList.toggle('active', tab === 'write');
  document.getElementById('nptab-whiteboard')?.classList.toggle('active', tab === 'whiteboard');
  const pw = document.getElementById('np-panel-write');
  const pb = document.getElementById('np-panel-whiteboard');
  if (pw) pw.style.display = tab === 'write'       ? 'flex' : 'none';
  if (pb) pb.style.display = tab === 'whiteboard'  ? 'flex' : 'none';

  if (tab === 'whiteboard' && _npActiveId) {
    if (!_npWhiteboard || forceInit) {
      if (_npWhiteboard) { _npWhiteboard.destroy(); _npWhiteboard = null; }
      await new Promise(r => setTimeout(r, 40));
      _npWhiteboard = StudyBuddyWhiteboard.create({
        containerId: 'np-whiteboard-host',
        noteId:      _npActiveId,
        onSave:      () => showToast('Whiteboard saved locally'),
      });
    } else if (_npWhiteboard._noteId !== _npActiveId) {
      _npWhiteboard.setNoteId(_npActiveId);
    }
  }
}

/* ══════════════════════════════════════
   INPUT HANDLERS
══════════════════════════════════════ */
function onNotepadTitleInput() {
  _npDirty = true;
  _scheduleNpAutosave();
}

function onNotepadEditorInput() {
  _npDirty = true;
  _scheduleNpAutosave();
  _updateNpStats();
}

function _updateNpStats() {
  const editor = document.getElementById('np-editor');
  if (!editor) return;
  const text  = editor.innerText || editor.textContent || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const mins  = Math.max(1, Math.ceil(words / 200));
  const wEl = document.getElementById('np-word-count');
  const cEl = document.getElementById('np-char-count');
  const rEl = document.getElementById('np-read-time');
  if (wEl) wEl.textContent = `${words} word${words !== 1 ? 's' : ''}`;
  if (cEl) cEl.textContent = `${chars} char${chars !== 1 ? 's' : ''}`;
  if (rEl) rEl.textContent = `${mins} min read`;
}

function _scheduleNpAutosave() {
  clearTimeout(_npSaveTimer);
  _npSaveTimer = setTimeout(() => saveNotepadNote(true), 1800);
}

/* ══════════════════════════════════════
   SAVE NOTE
   Updates in-memory state first (instant),
   then persists to DB in background when silent.
══════════════════════════════════════ */
async function saveNotepadNote(silent = false) {
  if (!_npActiveId || !currentUser) return;
  const note = _npNotes.find(n => n.id === _npActiveId);
  if (!note) return;

  const editor = document.getElementById('np-editor');
  note.title       = _npGetTitleValue() || 'Untitled';
  note.subject     = document.getElementById('np-subject-input')?.value.trim() || '';
  note.contentHtml = editor ? editor.innerHTML : '';
  note.content     = editor ? (editor.innerText || editor.textContent || '') : '';
  note.updatedAt   = Date.now();

  const indEl = document.getElementById('np-autosave-indicator');
  const txtEl = document.getElementById('np-autosave-text');
  if (indEl) indEl.classList.add('saving');
  if (txtEl) txtEl.textContent = 'Saving…';

  // ── Fire DB write; don't block the UI on autosave ──
  const savePromise = npSaveNoteToDb(note);
  _npDirty = false;

  if (silent) {
    // Fire and forget on autosave
    savePromise.then(() => {
      if (indEl) indEl.classList.remove('saving');
      if (txtEl) txtEl.textContent = 'Saved';
    });
  } else {
    await savePromise;
    if (indEl) indEl.classList.remove('saving');
    if (txtEl) txtEl.textContent = 'Saved';
    showToast('✓ Note saved');
  }

  // Update tree item in-place
  const itemEl = document.getElementById(`npn-${_npActiveId}`);
  if (itemEl) {
    const titleEl = itemEl.querySelector('.np-note-item-title');
    if (titleEl) titleEl.textContent = note.title;
  }
  document.getElementById('np-note-meta').textContent = 'Updated just now';
}

/* ══════════════════════════════════════
   CREATE NOTE
   Inserts into in-memory array first (instant tree update),
   then persists to DB.
══════════════════════════════════════ */
async function createNotepadNote(folderId = null) {
  if (!currentUser) return;
  const note = {
    id:          'np_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title:       'Untitled Note',
    content:     '',
    contentHtml: '',
    folderId,
    subject:     '',
    tags:        [],
    isPinned:    false,
    createdAt:   Date.now(),
    updatedAt:   Date.now(),
  };

  // ── Instant: update memory and tree ──
  _npNotes.unshift(note);
  if (folderId) _expandedFolders.add(folderId);
  renderNotepadTree();
  await selectNotepadNote(note.id);

  // ── Background: persist to DB ──
  npSaveNoteToDb(note);

  setTimeout(() => {
    const el = _npIsMobile()
      ? document.getElementById('np-note-title')
      : document.getElementById('np-note-title-desktop');
    el?.focus();
  }, 80);
}

/* ══════════════════════════════════════
   DELETE NOTE
══════════════════════════════════════ */
async function deleteNotepadNote() {
  if (!_npActiveId) return;
  if (!confirm('Delete this note? This cannot be undone.')) return;

  const id = _npActiveId;
  // ── Instant: remove from memory ──
  _npNotes = _npNotes.filter(n => n.id !== id);
  _npActiveId = null;
  _npDirty    = false;
  try { localStorage.removeItem('sb_wb_' + id); } catch (_) {}
  showNotepadEmpty();
  renderNotepadTree();

  // ── Background: delete from DB ──
  npDeleteNoteFromDb(id);
  showToast('Note deleted');
}

/* ══════════════════════════════════════
   FOLDER CRUD
══════════════════════════════════════ */
function openNewFolderModal() {
  document.getElementById('np-folder-name-input').value  = '';
  document.getElementById('np-folder-color-input').value = '#c8882a';
  document.getElementById('np-folder-modal').classList.add('open');
  setTimeout(() => document.getElementById('np-folder-name-input')?.focus(), 80);
}

function closeNewFolderModal(e) {
  if (e && e.target !== document.getElementById('np-folder-modal')) return;
  document.getElementById('np-folder-modal').classList.remove('open');
}

async function confirmNewFolder() {
  const name  = document.getElementById('np-folder-name-input')?.value.trim();
  const color = document.getElementById('np-folder-color-input')?.value || '#c8882a';
  if (!name) { showToast('Please enter a folder name'); return; }

  const folder = {
    id:          'npf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name,
    color,
    authorEmail: currentUser.email,
    createdAt:   Date.now(),
  };

  // ── Instant: update memory and tree ──
  _npFolders.push(folder);
  _expandedFolders.add(folder.id);
  document.getElementById('np-folder-modal').classList.remove('open');
  renderNotepadTree();
  showToast(`📁 Folder "${name}" created`);

  // ── Background: persist to DB ──
  npSaveFolderToDb(folder);
}

async function deleteNotepadFolder(folderId) {
  const folder = _npFolders.find(f => f.id === folderId);
  if (!folder) return;
  const noteCount = _npNotes.filter(n => n.folderId === folderId).length;
  const msg = noteCount
    ? `Delete folder "${folder.name}" and move its ${noteCount} note(s) to Ungrouped?`
    : `Delete folder "${folder.name}"?`;
  if (!confirm(msg)) return;

  // ── Instant: update memory ──
  _npNotes.filter(n => n.folderId === folderId).forEach(n => { n.folderId = null; });
  _npFolders = _npFolders.filter(f => f.id !== folderId);
  _expandedFolders.delete(folderId);
  renderNotepadTree();
  showToast('Folder deleted');

  // ── Background: persist to DB ──
  Promise.all([
    ..._npNotes.filter(n => n.folderId === null && n.id).map(n => npSaveNoteToDb(n)),
    npDeleteFolderFromDb(folderId),
  ]);
}

/* ══════════════════════════════════════
   PIN / UNPIN
══════════════════════════════════════ */
async function toggleNotepadPin() {
  if (!_npActiveId) return;
  const note = _npNotes.find(n => n.id === _npActiveId);
  if (!note) return;

  note.isPinned = !note.isPinned;
  const pinBtn = document.getElementById('np-pin-btn');
  if (pinBtn) pinBtn.classList.toggle('active', note.isPinned);
  renderNotepadTree();
  showToast(note.isPinned ? '📌 Note pinned' : 'Note unpinned');

  // Background DB write
  npSaveNoteToDb(note);
}

/* ══════════════════════════════════════
   UI HELPERS
══════════════════════════════════════ */
function showNotepadEmpty() {
  const empty = document.getElementById('np-viewer-empty');
  const wrap  = document.getElementById('np-note-wrap');
  if (empty) empty.style.display = 'flex';
  if (wrap)  wrap.style.display  = 'none';
  // Mobile: return to list view
  const layout = document.querySelector('.np-layout');
  if (layout) layout.classList.remove('np-editor-open');
  document.body.classList.remove('np-editing-mobile');
}

function _npFmtDate(ts) {
  if (!ts) return '';
  const d   = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time    = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `today at ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${time}`;
}

function _npUpdateStats() {
  const total   = document.getElementById('np-total-count');
  const folders = document.getElementById('np-folder-count');
  if (total)   total.textContent   = `${_npNotes.length} note${_npNotes.length !== 1 ? 's' : ''}`;
  if (folders) folders.textContent = `${_npFolders.length} folder${_npFolders.length !== 1 ? 's' : ''}`;
}

/* ══════════════════════════════════════
   DOWNLOAD / EXPORT
   Supports PDF (print method), Markdown, and plain text.
   PDF uses a hidden print iframe so the rest of the app
   UI is never disrupted and no external library is needed.
══════════════════════════════════════ */

function toggleNpDownloadMenu(e) {
  e.stopPropagation();
  // Find the nearest .np-download-menu sibling or descendant of the wrapper
  const wrap = e.currentTarget.closest('.np-download-wrap');
  const menu = wrap ? wrap.querySelector('.np-download-menu') : document.getElementById('np-download-menu');
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  _closeNpDownloadMenu();
  if (!isOpen) {
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    e.currentTarget.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', _closeNpDownloadMenu, { once: true }), 0);
  }
}

function _closeNpDownloadMenu() {
  document.querySelectorAll('.np-download-menu').forEach(menu => {
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
  });
  document.querySelectorAll('[aria-expanded="true"]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
}

async function downloadNote(format) {
  _closeNpDownloadMenu();
  if (!_npActiveId) return;

  // Make sure latest edits are captured (no DB round-trip needed)
  const note = _npNotes.find(n => n.id === _npActiveId);
  if (!note) return;

  const editor = document.getElementById('np-editor');
  const liveHtml    = editor ? editor.innerHTML : note.contentHtml || '';
  const livePlain   = editor ? (editor.innerText || editor.textContent || '') : note.content || '';
  const liveTitle   = _npGetTitleValue() || note.title || 'Untitled Note';
  const subject     = (document.getElementById('np-subject-input')?.value.trim()) || note.subject || '';

  // Filesystem-safe filename base
  const fileBase = liveTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'note';

  if (format === 'txt') {
    _npTriggerDownload(fileBase + '.txt', livePlain, 'text/plain');
    showToast('📄 Text file downloaded');
    return;
  }

  if (format === 'md') {
    // Convert basic HTML tags to Markdown
    const md = _npHtmlToMarkdown(liveHtml, liveTitle, subject);
    _npTriggerDownload(fileBase + '.md', md, 'text/markdown');
    showToast('📝 Markdown file downloaded');
    return;
  }

  if (format === 'pdf') {
    _npPrintToPdf(liveTitle, subject, liveHtml);
    showToast('🖨️ Opening print dialog for PDF…');
  }
}

/* ── Trigger a browser file download ── */
function _npTriggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

/* ── Basic HTML → Markdown converter ── */
function _npHtmlToMarkdown(html, title, subject) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  // Walk nodes and build markdown string
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    const tag = node.tagName ? node.tagName.toLowerCase() : '';
    const inner = Array.from(node.childNodes).map(walk).join('');
    switch (tag) {
      case 'h1': return `\n# ${inner}\n`;
      case 'h2': return `\n## ${inner}\n`;
      case 'h3': return `\n### ${inner}\n`;
      case 'strong': case 'b': return `**${inner}**`;
      case 'em': case 'i':    return `*${inner}*`;
      case 'u':               return `<u>${inner}</u>`;
      case 'code':            return `\`${inner}\``;
      case 'pre':             return `\n\`\`\`\n${inner}\n\`\`\`\n`;
      case 'a':               return `[${inner}](${node.getAttribute('href') || ''})`;
      case 'li':              return `- ${inner}\n`;
      case 'ul': case 'ol':   return `\n${inner}`;
      case 'br':              return '\n';
      case 'p': case 'div':   return `\n${inner}\n`;
      default:                return inner;
    }
  }

  const body = walk(tmp)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const header = [
    `# ${title}`,
    subject ? `**Subject:** ${subject}` : '',
    `**Exported:** ${new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}`,
    '',
    '---',
    '',
  ].filter(l => l !== null).join('\n');

  return header + body;
}

/* ── PDF via a hidden print iframe ──
   Opens the browser print dialog targeting only the note content,
   leaving the rest of the app completely undisturbed.
── */
function _npPrintToPdf(title, subject, contentHtml) {
  // Build a self-contained print document
  const dateStr = new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });

  const printDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${_escHtmlStr(title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    @page {
      size: A4;
      margin: 24mm 20mm 20mm;
    }

    body {
      font-family: 'DM Sans', 'Segoe UI', system-ui, sans-serif;
      font-size: 11pt;
      color: #071d2e;
      line-height: 1.7;
      background: #fff;
    }

    /* ── Header ── */
    .pdf-header {
      border-bottom: 2px solid #143352;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .pdf-title {
      font-family: 'Syne', 'Trebuchet MS', sans-serif;
      font-size: 22pt;
      font-weight: 800;
      color: #071d2e;
      line-height: 1.2;
      margin-bottom: 6px;
    }
    .pdf-meta {
      font-size: 9pt;
      color: #65676b;
      display: flex;
      gap: 16px;
    }
    .pdf-subject-pill {
      display: inline-block;
      background: #ffffff;
      color: #0d2b42;
      border: 1px solid #e8b468;
      border-radius: 20px;
      padding: 1px 10px;
      font-size: 8.5pt;
      font-weight: 600;
    }

    /* ── Body content ── */
    .pdf-body { margin-top: 4px; }
    .pdf-body h1 { font-family: 'Syne', sans-serif; font-size: 16pt; font-weight: 800; color: #071d2e; margin: 20px 0 8px; }
    .pdf-body h2 { font-family: 'Syne', sans-serif; font-size: 13pt; font-weight: 700; color: #0d2b42; margin: 16px 0 6px; }
    .pdf-body h3 { font-size: 11pt; font-weight: 600; color: #0d2b42; margin: 12px 0 4px; }
    .pdf-body p  { margin-bottom: 8px; }
    .pdf-body ul, .pdf-body ol { padding-left: 20px; margin-bottom: 8px; }
    .pdf-body li { margin-bottom: 3px; }
    .pdf-body strong { font-weight: 500; }
    .pdf-body em { font-style: italic; }
    .pdf-body code {
      background: #ffffff; border: 1px solid #c0d9eb;
      border-radius: 4px; padding: 1px 5px;
      font-family: 'Courier New', monospace; font-size: 9.5pt; color: #071d2e;
    }
    .pdf-body pre {
      background: #ffffff; border: 1px solid #c0d9eb;
      border-radius: 6px; padding: 12px 16px; margin-bottom: 10px;
      overflow-x: auto;
    }
    .pdf-body pre code { background: none; border: none; padding: 0; }
    .pdf-body blockquote {
      border-left: 3px solid #e8b468; padding-left: 14px;
      margin: 10px 0; color: #0d2b42; font-style: italic;
    }

    /* ── Footer ── */
    .pdf-footer {
      position: fixed;
      bottom: 10mm;
      left: 20mm; right: 20mm;
      font-size: 8pt;
      color: #a0aec0;
      display: flex;
      justify-content: space-between;
      border-top: 0.5px solid #d6e6f0;
      padding-top: 4px;
    }
  </style>
</head>
<body>
  <div class="pdf-header">
    <div class="pdf-title">${_escHtmlStr(title)}</div>
    <div class="pdf-meta">
      ${subject ? `<span class="pdf-subject-pill">${_escHtmlStr(subject)}</span>` : ''}
      <span>${dateStr}</span>
      <span>Study Buddy Notes</span>
    </div>
  </div>
  <div class="pdf-body">${contentHtml}</div>
  <div class="pdf-footer">
    <span>${_escHtmlStr(title)}</span>
    <span>Study Buddy · ${dateStr}</span>
  </div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
  document.body.appendChild(iframe);

  iframe.contentDocument.open();
  iframe.contentDocument.write(printDoc);
  iframe.contentDocument.close();

  // Wait for fonts/images then trigger print
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      // Remove iframe after a short delay
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 400);
  };
}

/* ── HTML escape helper (safe to call before escHtml is available) ── */
function _escHtmlStr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════
   KEYBOARD SHORTCUTS
   Ctrl+N = new note (when notepad is active)
══════════════════════════════════════ */
document.addEventListener('keydown', e => {
  const panel = document.getElementById('app-notepad');
  if (!panel || panel.style.display === 'none') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    createNotepadNote(null);
  }
});
