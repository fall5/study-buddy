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
      color:       r.color || '#7c3aed',
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
    color:        folder.color || '#7c3aed',
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
    html += `
      <div class="np-folder" id="npf-${escHtml(folder.id)}">
        <div class="np-folder-row" onclick="toggleNpFolder('${escHtml(folder.id)}')">
          <span class="np-folder-arrow ${open ? 'open' : ''}">▶</span>
          <svg class="np-folder-icon" viewBox="0 0 24 24" fill="none" stroke="${escHtml(folder.color)}" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="np-folder-name">${escHtml(folder.name)}</span>
          <span class="np-folder-count">${_npNotes.filter(n => n.folderId === folder.id).length}</span>
          <div class="np-folder-actions">
            <button title="New note in folder" onclick="event.stopPropagation();createNotepadNote('${escHtml(folder.id)}')">+</button>
            <button title="Delete folder"      onclick="event.stopPropagation();deleteNotepadFolder('${escHtml(folder.id)}')">✕</button>
          </div>
        </div>
        <div class="np-folder-children ${open ? 'open' : ''}">
          ${children.length
            ? children.sort((a, b) => b.updatedAt - a.updatedAt).map(n => _noteTreeItem(n)).join('')
            : '<div class="np-folder-empty">No notes yet — press + to add one</div>'}
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
  const active  = note.id === _npActiveId ? 'np-note-item-active' : '';
  const pinMark = note.isPinned ? '<span class="np-pin-mark">📌</span>' : '';
  const snippet = note.contentHtml
    ? (new DOMParser().parseFromString(note.contentHtml, 'text/html').body.textContent || '').slice(0, 55)
    : note.content.slice(0, 55);
  const folder  = _npFolders.find(f => f.id === note.folderId);
  const accent  = folder ? folder.color : 'var(--purple-bright)';
  const subject = note.subject
    ? `<span class="np-note-item-subject" style="color:${accent}">${escHtml(note.subject)}</span>`
    : '';

  return `
    <div class="np-note-item ${active}" id="npn-${escHtml(note.id)}"
         onclick="selectNotepadNote('${escHtml(note.id)}')">
      <span class="np-note-item-accent" style="background:${accent}"></span>
      <div class="np-note-item-body">
        <div class="np-note-item-top">
          <span class="np-note-item-title">${escHtml(note.title || 'Untitled')}</span>
          ${pinMark}
        </div>
        ${subject}
        ${snippet ? `<span class="np-note-item-snippet">${escHtml(snippet)}</span>` : ''}
      </div>
    </div>`;
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

  document.getElementById('np-note-title').value = note.title || '';
  document.getElementById('np-note-meta').textContent =
    'Updated ' + _npFmtDate(note.updatedAt);

  const subjectEl = document.getElementById('np-subject-input');
  if (subjectEl) subjectEl.value = note.subject || '';

  const folder   = _npFolders.find(f => f.id === note.folderId);
  const colorBar = document.getElementById('np-note-color-bar');
  if (colorBar) colorBar.style.background = folder ? folder.color : 'var(--purple-bright)';

  const pinBtn = document.getElementById('np-pin-btn');
  if (pinBtn) pinBtn.classList.toggle('active', !!note.isPinned);

  const editor = document.getElementById('np-editor');
  if (editor) editor.innerHTML = note.contentHtml || note.content || '';

  document.getElementById('np-viewer-empty').style.display = 'none';
  document.getElementById('np-note-wrap').style.display    = 'flex';

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
  note.title       = document.getElementById('np-note-title')?.value.trim() || 'Untitled';
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

  setTimeout(() => document.getElementById('np-note-title')?.focus(), 80);
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
  document.getElementById('np-folder-color-input').value = '#7c3aed';
  document.getElementById('np-folder-modal').classList.add('open');
  setTimeout(() => document.getElementById('np-folder-name-input')?.focus(), 80);
}

function closeNewFolderModal(e) {
  if (e && e.target !== document.getElementById('np-folder-modal')) return;
  document.getElementById('np-folder-modal').classList.remove('open');
}

async function confirmNewFolder() {
  const name  = document.getElementById('np-folder-name-input')?.value.trim();
  const color = document.getElementById('np-folder-color-input')?.value || '#7c3aed';
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
