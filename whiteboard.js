/*!
 * StudyBuddy Whiteboard v1.0
 * Modular, self-contained canvas drawing tool.
 * Zero global conflicts with app.js.
 * Exposes only: window.StudyBuddyWhiteboard
 */
(function (global) {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────────── */
  const LS_PREFIX   = 'sb_wb_';
  const MAX_HISTORY = 40;
  const PRESETS = [
    '#1e0a3c','#ef4444','#f97316','#eab308',
    '#22c55e','#3b82f6','#7c3aed','#ec4899',
    '#64748b','#000000',
  ];

  /* ── SVG icons (inline — no external deps) ─────────────────────── */
  const ICON = {
    pen:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
    eraser: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 20H7L3 16 15 4l5 5-4.5 4.5"/><path d="M6 20L18 8"/></svg>`,
    undo:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`,
    redo:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 0 4-4h12"/></svg>`,
    trash:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
    save:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    download:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  };

  /* ════════════════════════════════════════════════════════════════
     StudyBuddyWhiteboard class
  ════════════════════════════════════════════════════════════════ */
  class StudyBuddyWhiteboard {
    /**
     * @param {object} options
     * @param {string}   options.containerId  — id of the host element
     * @param {string}  [options.noteId]      — key for localStorage persistence
     * @param {function}[options.onSave]      — callback(dataUrl) after save
     */
    constructor({ containerId, noteId = 'default', onSave = null }) {
      this._cid     = containerId;
      this._noteId  = noteId;
      this._onSave  = onSave;

      /* tool state */
      this._color   = '#1e0a3c';
      this._size    = 5;
      this._tool    = 'pen';   // 'pen' | 'eraser'

      /* drawing state */
      this._drawing = false;
      this._lastX   = 0;
      this._lastY   = 0;

      /* history */
      this._undo    = [];   // ImageData[]
      this._redo    = [];   // ImageData[]

      /* DOM refs — populated in _init */
      this._container  = null;
      this._canvas     = null;
      this._ctx        = null;
      this._keyHandler = null;
      this._resizeObs  = null;

      this._init();
    }

    /* ── Bootstrap ─────────────────────────────────────────────── */
    _init() {
      this._container = document.getElementById(this._cid);
      if (!this._container) {
        console.warn(`[StudyBuddyWhiteboard] container #${this._cid} not found`);
        return;
      }
      this._container.innerHTML = this._buildHTML();
      this._bindRefs();
      this._attachEvents();
      this._resizeCanvas();
      this.load();
    }

    _buildHTML() {
      const presets = PRESETS.map(c =>
        `<button class="sbwb-preset" data-color="${c}" title="${c}"
          style="background:${c};${c === '#ffffff' ? 'border:1.5px solid #ccc' : ''}"></button>`
      ).join('');

      return `
      <div class="sbwb-toolbar">

        <div class="sbwb-group sbwb-tools">
          <button class="sbwb-tool sbwb-active" data-tool="pen"    title="Pen (P)">${ICON.pen}</button>
          <button class="sbwb-tool"             data-tool="eraser" title="Eraser (E)">${ICON.eraser}</button>
        </div>

        <div class="sbwb-group sbwb-colors">
          <label class="sbwb-color-swatch" title="Custom colour">
            <input  type="color" class="sbwb-color-input" value="#1e0a3c">
            <span   class="sbwb-color-dot" style="background:#1e0a3c"></span>
          </label>
          <div class="sbwb-presets">${presets}</div>
        </div>

        <div class="sbwb-group sbwb-sizing">
          <span class="sbwb-size-icon small">●</span>
          <input type="range" class="sbwb-slider" min="1" max="48" value="5" title="Brush size">
          <span class="sbwb-size-icon large">●</span>
          <span class="sbwb-size-label">5 px</span>
        </div>

        <div class="sbwb-group sbwb-actions">
          <button class="sbwb-btn" data-action="undo"     title="Undo (Ctrl+Z)">${ICON.undo}</button>
          <button class="sbwb-btn" data-action="redo"     title="Redo (Ctrl+Y)">${ICON.redo}</button>
          <button class="sbwb-btn" data-action="clear"    title="Clear canvas">${ICON.trash}</button>
          <button class="sbwb-btn sbwb-save-btn" data-action="save" title="Save to notepad">${ICON.save} Save</button>
          <button class="sbwb-btn" data-action="download" title="Download as PNG">${ICON.download}</button>
        </div>

      </div>
      <div class="sbwb-canvas-wrap">
        <canvas class="sbwb-canvas"></canvas>
      </div>
      <div class="sbwb-status"></div>`;
    }

    _bindRefs() {
      this._canvas = this._container.querySelector('.sbwb-canvas');
      this._ctx    = this._canvas.getContext('2d');
    }

    /* ── Event wiring ───────────────────────────────────────────── */
    _attachEvents() {
      const c = this._canvas;

      /* mouse */
      c.addEventListener('mousedown',  e => this._onDown(e));
      c.addEventListener('mousemove',  e => this._onMove(e));
      c.addEventListener('mouseup',    ()  => this._onUp());
      c.addEventListener('mouseleave', ()  => this._onUp());

      /* touch */
      c.addEventListener('touchstart', e => { e.preventDefault(); this._onDown(e.touches[0]); }, { passive: false });
      c.addEventListener('touchmove',  e => { e.preventDefault(); this._onMove(e.touches[0]); }, { passive: false });
      c.addEventListener('touchend',   ()  => this._onUp());

      /* toolbar — colour picker */
      const picker = this._container.querySelector('.sbwb-color-input');
      picker.addEventListener('input', e => this._applyColor(e.target.value));

      /* toolbar — presets */
      this._container.querySelectorAll('.sbwb-preset').forEach(btn =>
        btn.addEventListener('click', () => this._applyColor(btn.dataset.color))
      );

      /* toolbar — size slider */
      const slider = this._container.querySelector('.sbwb-slider');
      slider.addEventListener('input', () => {
        this._size = +slider.value;
        this._container.querySelector('.sbwb-size-label').textContent = `${this._size} px`;
      });

      /* toolbar — tool buttons */
      this._container.querySelectorAll('.sbwb-tool').forEach(btn =>
        btn.addEventListener('click', () => this._applyTool(btn.dataset.tool))
      );

      /* toolbar — action buttons */
      this._container.querySelectorAll('.sbwb-btn[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          switch (btn.dataset.action) {
            case 'undo':     this.undo();     break;
            case 'redo':     this.redo();     break;
            case 'clear':    this.clear();    break;
            case 'save':     this.save();     break;
            case 'download': this.download(); break;
          }
        });
      });

      /* keyboard shortcuts (scoped to document while this instance is alive) */
      this._keyHandler = e => {
        /* only fire if whiteboard panel is visible */
        if (!this._container || !this._container.offsetParent) return;
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
        if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); this.redo(); }
        if (!ctrl && e.key === 'p') this._applyTool('pen');
        if (!ctrl && e.key === 'e') this._applyTool('eraser');
      };
      document.addEventListener('keydown', this._keyHandler);

      /* responsive resize */
      this._resizeObs = new ResizeObserver(() => this._resizeCanvas());
      const wrap = this._container.querySelector('.sbwb-canvas-wrap');
      if (wrap) this._resizeObs.observe(wrap);
    }

    /* ── Canvas sizing (preserves content) ─────────────────────── */
    _resizeCanvas() {
      const wrap = this._container.querySelector('.sbwb-canvas-wrap');
      if (!wrap || !this._canvas) return;

      /* snapshot before resize */
      let snap = null;
      if (this._canvas.width > 0 && this._canvas.height > 0) {
        try { snap = this._canvas.toDataURL(); } catch (_) {}
      }

      this._canvas.width  = wrap.clientWidth  || 800;
      this._canvas.height = Math.max(wrap.clientHeight, 480);

      /* restore after resize */
      if (snap) {
        const img = new Image();
        img.onload = () => this._ctx.drawImage(img, 0, 0);
        img.src = snap;
      }
    }

    /* ── Drawing pipeline ───────────────────────────────────────── */
    _getPos(e) {
      const r = this._canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (this._canvas.width  / r.width),
        y: (e.clientY - r.top)  * (this._canvas.height / r.height),
      };
    }

    _onDown(e) {
      this._drawing = true;
      const { x, y } = this._getPos(e);
      this._lastX = x;
      this._lastY = y;

      /* snapshot BEFORE stroke for undo */
      this._pushUndo();

      /* paint a dot so single clicks are visible */
      const ctx = this._ctx;
      ctx.globalCompositeOperation = this._tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.beginPath();
      ctx.arc(x, y, this._size / 2, 0, Math.PI * 2);
      ctx.fillStyle = this._color;
      ctx.fill();
    }

    _onMove(e) {
      if (!this._drawing) return;
      const { x, y } = this._getPos(e);
      const ctx = this._ctx;

      ctx.globalCompositeOperation = this._tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.beginPath();
      ctx.moveTo(this._lastX, this._lastY);
      ctx.lineTo(x, y);
      ctx.strokeStyle  = this._color;
      ctx.lineWidth    = this._tool === 'eraser' ? this._size * 2.5 : this._size;
      ctx.lineCap      = 'round';
      ctx.lineJoin     = 'round';
      ctx.stroke();

      this._lastX = x;
      this._lastY = y;
    }

    _onUp() {
      if (!this._drawing) return;
      this._drawing = false;
      this._ctx.globalCompositeOperation = 'source-over';
    }

    /* ── Undo / Redo ────────────────────────────────────────────── */
    _pushUndo() {
      const snap = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);
      this._undo.push(snap);
      if (this._undo.length > MAX_HISTORY) this._undo.shift();
      this._redo = [];   /* new action clears redo */
      this._syncHistoryBtns();
    }

    _syncHistoryBtns() {
      const u = this._container.querySelector('[data-action="undo"]');
      const r = this._container.querySelector('[data-action="redo"]');
      if (u) u.disabled = this._undo.length === 0;
      if (r) r.disabled = this._redo.length === 0;
    }

    undo() {
      if (!this._undo.length) return;
      const cur = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);
      this._redo.push(cur);
      this._ctx.putImageData(this._undo.pop(), 0, 0);
      this._syncHistoryBtns();
    }

    redo() {
      if (!this._redo.length) return;
      const cur = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);
      this._undo.push(cur);
      this._ctx.putImageData(this._redo.pop(), 0, 0);
      this._syncHistoryBtns();
    }

    clear() {
      if (!confirm('Clear the entire canvas?')) return;
      this._pushUndo();
      this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }

    /* ── Tool & colour helpers ──────────────────────────────────── */
    _applyTool(tool) {
      this._tool = tool;
      this._container.querySelectorAll('.sbwb-tool').forEach(b =>
        b.classList.toggle('sbwb-active', b.dataset.tool === tool)
      );
    }

    _applyColor(color) {
      this._color = color;
      const picker = this._container.querySelector('.sbwb-color-input');
      const dot    = this._container.querySelector('.sbwb-color-dot');
      if (picker) picker.value = color;
      if (dot)    dot.style.background = color;
      /* auto-switch to pen when picking a colour */
      if (this._tool === 'eraser') this._applyTool('pen');
    }

    /* ── Persistence ────────────────────────────────────────────── */
    save() {
      try {
        const dataUrl = this._flatDataUrl();
        localStorage.setItem(LS_PREFIX + this._noteId, dataUrl);
        this._toast('✓ Whiteboard saved');
        if (typeof this._onSave === 'function') this._onSave(dataUrl);
      } catch (err) {
        this._toast('Save failed — storage may be full');
        console.error('[StudyBuddyWhiteboard] save error:', err);
      }
    }

    load() {
      try {
        const dataUrl = localStorage.getItem(LS_PREFIX + this._noteId);
        if (!dataUrl) return;
        const img = new Image();
        img.onload = () => this._ctx.drawImage(img, 0, 0);
        img.src = dataUrl;
      } catch (err) {
        console.error('[StudyBuddyWhiteboard] load error:', err);
      }
    }

    download() {
      const a = document.createElement('a');
      a.href     = this._flatDataUrl();
      a.download = `whiteboard-${this._noteId}.png`;
      a.click();
    }

    /**
     * Returns a flat (white-background) PNG data URL.
     * The drawing canvas may be transparent (eraser uses destination-out),
     * so we composite onto white before exporting.
     */
    _flatDataUrl() {
      const tmp = document.createElement('canvas');
      tmp.width  = this._canvas.width;
      tmp.height = this._canvas.height;
      const tCtx = tmp.getContext('2d');
      tCtx.fillStyle = '#ffffff';
      tCtx.fillRect(0, 0, tmp.width, tmp.height);
      tCtx.drawImage(this._canvas, 0, 0);
      return tmp.toDataURL('image/png');
    }

    /* ── Public API ─────────────────────────────────────────────── */

    /**
     * Switch to a different note's whiteboard (clears canvas, loads new data).
     * @param {string} noteId
     */
    setNoteId(noteId) {
      this._noteId = noteId;
      this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
      this._undo = [];
      this._redo = [];
      this._syncHistoryBtns();
      this.load();
    }

    /**
     * Enable or disable read-only mode.
     * In read-only: canvas pointer events off, toolbar dimmed, badge shown.
     * @param {boolean} isReadOnly
     */
    setReadOnly(isReadOnly) {
      this._readOnly = isReadOnly;

      if (!this._container) return;

      /* canvas */
      if (this._canvas) {
        this._canvas.style.pointerEvents = isReadOnly ? 'none' : 'auto';
        this._canvas.style.cursor        = isReadOnly ? 'default' : 'crosshair';
      }

      /* toolbar */
      const toolbar = this._container.querySelector('.sbwb-toolbar');
      if (toolbar) toolbar.style.opacity = isReadOnly ? '0.45' : '1';

      /* pointer-events on toolbar so nothing is clickable in read-only */
      if (toolbar) toolbar.style.pointerEvents = isReadOnly ? 'none' : 'auto';

      /* read-only overlay badge */
      let badge = this._container.querySelector('.sbwb-readonly-overlay');
      if (isReadOnly) {
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'sbwb-readonly-overlay';
          badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            style="width:16px;height:16px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            View only`;
          const wrap = this._container.querySelector('.sbwb-canvas-wrap');
          if (wrap) wrap.appendChild(badge);
        }
      } else {
        if (badge) badge.remove();
      }
    }

    /**
     * Returns a flat white-background PNG data URL of the current canvas.
     * Same as _flatDataUrl but public.
     */
    getDataUrl() { return this._flatDataUrl(); }

    /**
     * Load a data URL (PNG/JPEG) onto the canvas, replacing current content.
     * @param {string} dataUrl
     */
    loadFromDataUrl(dataUrl) {
      if (!dataUrl || !this._ctx) return;
      const img = new Image();
      img.onload = () => {
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        this._ctx.drawImage(img, 0, 0, this._canvas.width, this._canvas.height);
      };
      img.src = dataUrl;
    }

    /** Clean up event listeners (call when destroying the whiteboard). */
    destroy() {
      if (this._keyHandler)  document.removeEventListener('keydown', this._keyHandler);
      if (this._resizeObs)   this._resizeObs.disconnect();
    }

    /* ── Status toast ───────────────────────────────────────────── */
    _toast(msg) {
      const el = this._container.querySelector('.sbwb-status');
      if (!el) return;
      el.textContent = msg;
      el.classList.add('sbwb-status-show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove('sbwb-status-show'), 2200);
    }

    /* ── Static factory ─────────────────────────────────────────── */
    static create(options) { return new StudyBuddyWhiteboard(options); }
  }

  /* expose to global scope — single clean export */
  global.StudyBuddyWhiteboard = StudyBuddyWhiteboard;

})(window);
