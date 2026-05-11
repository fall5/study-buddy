/* ═══════════════════════════════════════════════════════════
   STUDY BUDDY — shared.js
   Single source of truth for all utility functions used across
   every page file. Load this BEFORE app.js in index.html.

   Provides (all globals):
     escHtml(str)                   — XSS-safe HTML escape
     getInitialsFromName(name)      — "Jane Doe" → "JD"
     getInitials(userObj)           — user object → initials string
     getUserHandle(userObj)         — user object → "@janehandle"
     getDisplayName(userObj)        — user object → display name string
     normalizeEmail(email)          — trim + lowercase
     avatarColor(userObj)           — returns gradient string
     avatarHTML(userObj, cls?)      — returns full avatar <div> HTML
     formatTimeAgo(timestamp)       — ms timestamp → "3 minutes ago"
     formatShortTime(timestamp)     — ms timestamp → "3:45 PM" / "Mon"
     formatFileSize(bytes)          — bytes → "1.2 MB"
   ═══════════════════════════════════════════════════════════ */

/* ──────────── AVATAR COLOURS ──────────── */
/* Single definition — referenced by app.js, messages.js, etc.
   via the global AVATAR_COLORS. Do NOT redefine in any other file. */
const AVATAR_COLORS = [
  'linear-gradient(135deg,#071d2e,#0d2b42)',
  'linear-gradient(135deg,#0d2b42,#e8b468)',
  'linear-gradient(135deg,#0d2b42,#c8dcea)',
  'linear-gradient(135deg,#071d2e,#c8882a)',
  'linear-gradient(135deg,#071d2e,#1e4d73)',
  'linear-gradient(135deg,#071d2e,#1e4d73)',
  'linear-gradient(135deg,#0d2b42,#c8dcea)',
  'linear-gradient(135deg,#0d2b42,#e8f2f9)',
];

/* ──────────── HTML ESCAPING ──────────── */
/**
 * Escapes a value for safe insertion into HTML.
 * Covers &, <, >, ", ' — all XSS vectors.
 * Use everywhere a user-supplied value goes into innerHTML / template literals.
 */
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ──────────── EMAIL ──────────── */
/**
 * Returns a trimmed, lowercased email string.
 * Safe to call on null/undefined — returns ''.
 */
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/* ──────────── USER DISPLAY ──────────── */
/**
 * Returns the best two-character initials for a name string.
 * "Jane Doe" → "JD", "Alice" → "AL", null → "?"
 */
function getInitialsFromName(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Returns initials for a user object.
 * Prefers user.initials (DB-stored), falls back to getInitialsFromName.
 */
function getInitials(u) {
  if (!u) return '?';
  if (u.initials) return u.initials;
  return getInitialsFromName(u.name);
}

/**
 * Returns the display name for a user object.
 * Falls back to the email prefix if name is missing.
 */
function getDisplayName(u) {
  if (!u) return 'Unknown';
  if (u.name) return u.name;
  return u.email ? u.email.split('@')[0] : 'Unknown';
}

/**
 * Returns the handle string (e.g. "@janesmith") for a user object.
 * Derived from name — matches the existing profile page convention.
 */
function getUserHandle(u) {
  if (!u) return '@user';
  const base = u.name || u.email || 'user';
  return '@' + base.toLowerCase().replace(/\s+/g, '');
}

/* ──────────── AVATAR ──────────── */
/**
 * Returns the avatar background gradient for a user.
 * Falls back to AVATAR_COLORS[0] if user has no avatarColor.
 * This is the single place that resolves the avatarColor fallback —
 * no other file should write `u.avatarColor || AVATAR_COLORS[0]`.
 */
/* Map of old purple DB-stored gradients → new navy/gold equivalents.
 * Users created before the rebrand have these stored in the database.
 * This sanitizer remaps them transparently at read time. */
const AVATAR_COLOR_REMAP = {
  'linear-gradient(135deg,#7c3aed,#a78bfa)': 'linear-gradient(135deg,#071d2e,#0d2b42)',
  'linear-gradient(135deg,#6d28d9,#c4b5fd)': 'linear-gradient(135deg,#0d2b42,#e8b468)',
  'linear-gradient(135deg,#8b5cf6,#ddd6fe)': 'linear-gradient(135deg,#0d2b42,#c8dcea)',
  'linear-gradient(135deg,#5b21b6,#a78bfa)': 'linear-gradient(135deg,#071d2e,#c8882a)',
  'linear-gradient(135deg,#4c1d95,#8b5cf6)': 'linear-gradient(135deg,#071d2e,#1e4d73)',
  'linear-gradient(135deg,#3b0764,#7c3aed)': 'linear-gradient(135deg,#071d2e,#143352)',
  'linear-gradient(135deg,#6d28d9,#f5f3ff)': 'linear-gradient(135deg,#0d2b42,#c8dcea)',
  'linear-gradient(135deg,#7c3aed,#ede9fe)': 'linear-gradient(135deg,#143352,#e8f2f9)',
  // Also catch any hex-only purple values
  '#7c3aed': 'linear-gradient(135deg,#071d2e,#0d2b42)',
  '#6d28d9': 'linear-gradient(135deg,#0d2b42,#1e4d73)',
  '#8b5cf6': 'linear-gradient(135deg,#143352,#c8dcea)',
  '#a78bfa': 'linear-gradient(135deg,#071d2e,#c8882a)',
  '#3b0764': 'linear-gradient(135deg,#071d2e,#0d2b42)',
};

/* Purple hex codes from the old palette — detected via substring match */
const PURPLE_HEX_PATTERN = /#(?:7c3aed|6d28d9|8b5cf6|a78bfa|c4b5fd|3b0764|5b21b6|4c1d95|9333ea|7e22ce|6b21a8|a855f7)/i;

function sanitizeAvatarColor(raw) {
  if (!raw) return AVATAR_COLORS[0];
  // Exact lookup first (fast path)
  if (AVATAR_COLOR_REMAP[raw]) return AVATAR_COLOR_REMAP[raw];
  // Normalised lookup (handles trailing spaces, etc.)
  const norm = raw.trim();
  if (AVATAR_COLOR_REMAP[norm]) return AVATAR_COLOR_REMAP[norm];
  // Substring match — catch any value that contains a purple hex
  if (PURPLE_HEX_PATTERN.test(norm)) {
    // Map to a navy/gold gradient based on which purple it is
    if (/7c3aed|5b21b6|4c1d95|3b0764/.test(norm)) return AVATAR_COLORS[0]; // deep navy
    if (/6d28d9/.test(norm))                        return AVATAR_COLORS[1]; // navy + gold
    if (/8b5cf6|a855f7/.test(norm))                 return AVATAR_COLORS[2]; // navy + mist
    if (/a78bfa|c4b5fd/.test(norm))                 return AVATAR_COLORS[3]; // navy + warm gold
    return AVATAR_COLORS[0]; // fallback
  }
  return norm;
}

function avatarColor(u) {
  const raw = (u && u.avatarColor) ? u.avatarColor : AVATAR_COLORS[0];
  return sanitizeAvatarColor(raw);
}

/**
 * Returns a complete avatar <div> HTML string.
 * @param {object|null} u     — user object (or null for fallback)
 * @param {string}      cls   — CSS class for the div (default: 'avatar')
 * @returns {string}          — safe HTML string
 *
 * Usage:
 *   avatarHTML(currentUser)               → <div class="avatar" style="background:…">JD</div>
 *   avatarHTML(user, 'comment-avatar')    → <div class="comment-avatar" style="…">JD</div>
 *   avatarHTML(null, 'post-avatar')       → fallback initials "?"
 */
function avatarHTML(u, cls = 'avatar') {
  const bg   = avatarColor(u);
  const init = escHtml(getInitials(u));
  return `<div class="${escHtml(cls)}" style="background:${bg}">${init}</div>`;
}

/* ──────────── TIME FORMATTING ──────────── */
/**
 * Returns a human-readable relative time string.
 * Input: ms timestamp (Date.now() format).
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Some time ago';
  const diff = Date.now() - timestamp;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m} minute${m > 1 ? 's' : ''} ago`;
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  if (d < 7)  return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Returns a short time label.
 * Today → "3:45 PM", this week → "Mon", older → "Jan 5"
 * Input: ms timestamp.
 */
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

/* ──────────── FILE UTILITIES ──────────── */
/**
 * Returns a human-readable file size string.
 * 0 → "0 B", 1500 → "1.5 KB", 2000000 → "1.9 MB"
 */
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024)    return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

/* ──────────── SUBJECT ↔ CATEGORY MAP ──────────── */
/**
 * Single source of truth mapping every subject string to its
 * parent category. Mirrors the <optgroup> labels in index.html.
 * Used by the ad targeting system and the profile subject picker.
 *
 * getSubjectCategories(subjectsArray) → unique category string[]
 */
const SUBJECT_CATEGORY_MAP = {
  // Computer Science
  'Data Structures and Algorithms':       'Computer Science',
  'Discrete Mathematics':                 'Computer Science',
  'Object-Oriented Programming':          'Computer Science',
  'Database Management Systems':          'Computer Science',
  'Operating Systems':                    'Computer Science',
  'Computer Networks':                    'Computer Science',
  'Software Engineering':                 'Computer Science',
  'Artificial Intelligence':              'Computer Science',
  'Machine Learning':                     'Computer Science',
  'Web Development':                      'Computer Science',
  'Mobile Application Development':       'Computer Science',
  'Cybersecurity':                        'Computer Science',
  'Cloud Computing':                      'Computer Science',

  // Information Technology
  'Information Management':               'Information Technology',
  'Systems Analysis and Design':          'Information Technology',
  'Database Administration':              'Information Technology',
  'Network Administration':               'Information Technology',
  'Web Systems and Technologies':         'Information Technology',
  'Human-Computer Interaction':           'Information Technology',
  'IT Project Management':                'Information Technology',
  'Information Assurance and Security':   'Information Technology',
  'Integrative Programming':              'Information Technology',

  // Multimedia Computing
  'Digital Arts and Design':              'Multimedia Computing',
  'Computer Animation':                   'Multimedia Computing',
  'Game Development':                     'Multimedia Computing',
  '3D Modeling':                          'Multimedia Computing',
  'Video Production':                     'Multimedia Computing',
  'Motion Graphics':                      'Multimedia Computing',
  'Sound Design':                         'Multimedia Computing',
  'User Experience Design':               'Multimedia Computing',

  // Business & Accountancy
  'Financial Accounting':                 'Business & Accountancy',
  'Managerial Accounting':                'Business & Accountancy',
  'Cost Accounting':                      'Business & Accountancy',
  'Auditing Theory':                      'Business & Accountancy',
  'Taxation':                             'Business & Accountancy',
  'Marketing Management':                 'Business & Accountancy',
  'Human Resource Management':            'Business & Accountancy',
  'Operations Management':                'Business & Accountancy',
  'Financial Management':                 'Business & Accountancy',
  'Strategic Management':                 'Business & Accountancy',
  'Entrepreneurship':                     'Business & Accountancy',

  // Engineering
  'Circuit Theory':                       'Engineering',
  'Digital Electronics':                  'Engineering',
  'Signals and Systems':                  'Engineering',
  'Communications Engineering':           'Engineering',
  'Control Systems':                      'Engineering',
  'Microprocessors and Microcontrollers': 'Engineering',
  'Embedded Systems':                     'Engineering',
  'Operations Research':                  'Engineering',
  'Quality Control':                      'Engineering',

  // Health Sciences
  'Anatomy and Physiology':               'Health Sciences',
  'Pharmacology':                         'Health Sciences',
  'Medical-Surgical Nursing':             'Health Sciences',
  'Clinical Chemistry':                   'Health Sciences',
  'Hematology':                           'Health Sciences',
  'Medical Microbiology':                 'Health Sciences',
  'Pharmaceutical Chemistry':             'Health Sciences',
  'Radiographic Positioning':             'Health Sciences',

  // Social Sciences & Education
  'General Psychology':                   'Social Sciences & Education',
  'Developmental Psychology':             'Social Sciences & Education',
  'Social Psychology':                    'Social Sciences & Education',
  'Abnormal Psychology':                  'Social Sciences & Education',
  'Child and Adolescent Development':     'Social Sciences & Education',
  'Curriculum Development':               'Social Sciences & Education',
  'Introduction to Criminology':          'Social Sciences & Education',
  'Criminal Law':                         'Social Sciences & Education',
  'Forensic Science':                     'Social Sciences & Education',
};

/* All unique category names — used to build the subject picker UI */
const SUBJECT_CATEGORIES = [...new Set(Object.values(SUBJECT_CATEGORY_MAP))];

/* All subjects grouped by category — used to build grouped pickers */
const SUBJECTS_BY_CATEGORY = SUBJECT_CATEGORIES.reduce((acc, cat) => {
  acc[cat] = Object.entries(SUBJECT_CATEGORY_MAP)
    .filter(([, c]) => c === cat)
    .map(([s]) => s);
  return acc;
}, {});

/**
 * Returns unique category strings for an array of subject strings.
 * ["Data Structures and Algorithms", "Pharmacology"] → ["Computer Science", "Health Sciences"]
 */
function getSubjectCategories(subjects) {
  if (!Array.isArray(subjects)) return [];
  const cats = subjects.map(s => SUBJECT_CATEGORY_MAP[s]).filter(Boolean);
  return [...new Set(cats)];
}
