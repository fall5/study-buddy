-- ══════════════════════════════════════════════════════════════
-- STUDY BUDDY — Master Schema (v9, notification realtime)
-- Single source of truth. Safe to run on a fresh Supabase project
-- OR re-run on an existing one (all statements use IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS / ON CONFLICT DO NOTHING).
--
-- Sections
--   1. Extensions
--   2. Core tables
--   3. Messaging tables (DMs, group chats, group reads, room chat)
--   4. Creator tables (products, subscription tiers, user subs, quizzes)
--   5. Feature tables (notes, folders, sessions, join requests, call signals, purchases)
--   6. Missing-column migrations (safe ALTER TABLE patches)
--   7. Row-Level Security (group_reads policies cleaned before recreate)
--   8. Indexes
--   9. Realtime publication (v9: added matches, comments, join_requests,
--      purchases, user_subscriptions, sessions for notification channels)
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1. EXTENSIONS
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ─────────────────────────────────────────────────────────────
-- 2. CORE TABLES
-- ─────────────────────────────────────────────────────────────

-- ACCOUNTS
CREATE TABLE IF NOT EXISTS accounts (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  name          TEXT,
  initials      TEXT,
  headline      TEXT,
  location      TEXT,
  bio           TEXT,
  subjects      JSONB       DEFAULT '[]',
  avatar_color  TEXT,
  schedule      TEXT,
  style         TEXT,
  is_creator    BOOLEAN     DEFAULT false,
  creator_brand TEXT,
  account_type  TEXT        DEFAULT 'student' CHECK (account_type IN ('student', 'creator')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- POSTS
CREATE TABLE IF NOT EXISTS posts (
  id               TEXT        PRIMARY KEY,
  author_email     TEXT        NOT NULL,
  body             TEXT,
  subject          TEXT,
  schedule         TEXT,
  location         TEXT,
  type             TEXT        DEFAULT 'general',
  -- creator post fields
  post_type        TEXT,                     -- 'product' | 'subscription' | 'quiz'
  linked_item_id   TEXT,                     -- id of the linked product / quiz / tier
  is_premium       BOOLEAN     DEFAULT false,
  -- social
  tags             JSONB       DEFAULT '[]',
  likes            JSONB       DEFAULT '[]',
  media            JSONB       DEFAULT '[]',
  files            JSONB       DEFAULT '[]',
  -- access control (premium posts)
  access_list      JSONB       DEFAULT '[]',
  access_requests  JSONB       DEFAULT '[]',
  -- gather buddies
  gather_buddies   BOOLEAN     NOT NULL DEFAULT false,
  group_chat_id    TEXT,                     -- FK added below after group_chats is created
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- COMMENTS
CREATE TABLE IF NOT EXISTS comments (
  id          TEXT        PRIMARY KEY,
  post_id     TEXT        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_email  TEXT        NOT NULL,
  text        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- MATCHES (buddy connections)
CREATE TABLE IF NOT EXISTS matches (
  id         TEXT        PRIMARY KEY,
  from_email TEXT        NOT NULL,
  to_email   TEXT        NOT NULL,
  status     TEXT        DEFAULT 'pending',  -- 'pending' | 'accepted' | 'declined'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SAVED POSTS
CREATE TABLE IF NOT EXISTS saved_posts (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_email TEXT        NOT NULL,
  post_id    TEXT        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_email, post_id)
);


-- ─────────────────────────────────────────────────────────────
-- 3. MESSAGING TABLES
-- ─────────────────────────────────────────────────────────────

-- DIRECT MESSAGES
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT        PRIMARY KEY,
  from_email  TEXT        NOT NULL,
  to_email    TEXT        NOT NULL,
  text        TEXT,
  type        TEXT        DEFAULT 'text',
  attachment  JSONB,
  read        BOOLEAN     DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- GROUP CHATS
CREATE TABLE IF NOT EXISTS group_chats (
  id          TEXT        PRIMARY KEY,
  name        TEXT,
  host_email  TEXT,
  post_id     TEXT,
  members     TEXT[]      NOT NULL DEFAULT '{}',
  managers    TEXT[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- GROUP MESSAGES
CREATE TABLE IF NOT EXISTS group_messages (
  id            TEXT        PRIMARY KEY,
  group_chat_id TEXT        NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  from_email    TEXT        NOT NULL,
  text          TEXT        NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- GROUP READS (tracks per-user last-read timestamp for group chats — cross-device)
CREATE TABLE IF NOT EXISTS group_reads (
  user_email    TEXT        NOT NULL,
  group_chat_id TEXT        NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  last_read_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_email, group_chat_id)
);

-- Enable RLS immediately so the policy block below is never skipped
ALTER TABLE group_reads ENABLE ROW LEVEL SECURITY;

-- ROOM MESSAGES (live study-room chat)
CREATE TABLE IF NOT EXISTS room_messages (
  id          TEXT        PRIMARY KEY,
  session_id  TEXT        NOT NULL,
  from_email  TEXT        NOT NULL,
  body        TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Now that group_chats exists, add FK on posts
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS group_chat_id TEXT REFERENCES group_chats(id) ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────
-- 4. CREATOR TABLES
-- ─────────────────────────────────────────────────────────────

-- CREATOR APPLICATIONS
CREATE TABLE IF NOT EXISTS creator_apps (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT        UNIQUE NOT NULL,
  brand         TEXT,
  bio           TEXT,
  subject       TEXT,
  content_types JSONB       DEFAULT '[]',
  price         NUMERIC     DEFAULT 0,
  status        TEXT        DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  applied_at    TIMESTAMPTZ DEFAULT now(),
  approved_at   TIMESTAMPTZ
);

-- PRODUCTS (study materials sold by creators)
CREATE TABLE IF NOT EXISTS products (
  id             TEXT        PRIMARY KEY,
  creator_email  TEXT        NOT NULL,
  title          TEXT,
  description    TEXT,
  type           TEXT        DEFAULT 'notes',   -- 'notes' | 'guide' | 'cheatsheet' | 'flashcards' | 'slides' | 'template'
  price          NUMERIC     DEFAULT 0,
  subject        TEXT,
  content        TEXT,
  purchases      JSONB       DEFAULT '[]',
  access_list    JSONB       DEFAULT '[]',       -- emails granted access
  sales_count    INTEGER     DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- SUBSCRIPTION TIERS (defined by creators)
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id             TEXT        PRIMARY KEY,
  creator_email  TEXT        NOT NULL,
  name           TEXT,                           -- e.g. 'Basic', 'Pro'
  description    TEXT,
  price          NUMERIC     DEFAULT 0,
  perks          JSONB       DEFAULT '[]',       -- list of perk strings
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- USER SUBSCRIPTIONS (student → creator tier)
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id             TEXT        PRIMARY KEY,
  user_email     TEXT        NOT NULL,
  creator_email  TEXT        NOT NULL,
  tier_id        TEXT,
  price          NUMERIC     DEFAULT 0,
  since          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_email, creator_email)
);

-- QUIZZES
CREATE TABLE IF NOT EXISTS quizzes (
  id             TEXT        PRIMARY KEY,
  creator_email  TEXT        NOT NULL,
  title          TEXT,
  subject        TEXT,
  access         TEXT        DEFAULT 'free',    -- 'free' | 'subscription' | 'priced'
  price          NUMERIC     DEFAULT 0,          -- fixed price in ₱; only used when access = 'priced'
  questions      JSONB       DEFAULT '[]',
  attempts       INTEGER     DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────
-- 5. FEATURE TABLES
-- ─────────────────────────────────────────────────────────────

-- PERSONAL NOTES (notepad)
CREATE TABLE IF NOT EXISTS notes (
  id             TEXT        PRIMARY KEY,
  author_email   TEXT        NOT NULL,
  title          TEXT,
  content        TEXT,
  content_html   TEXT,
  summary        TEXT,
  subject        TEXT,
  tags           JSONB       DEFAULT '[]',
  is_public      BOOLEAN     DEFAULT false,
  drawing_data   TEXT,
  folder_id      TEXT,                          -- FK to notepad_folders
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- NOTEPAD FOLDERS
CREATE TABLE IF NOT EXISTS notepad_folders (
  id           TEXT        PRIMARY KEY,
  author_email TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  color        TEXT        DEFAULT '#7c3aed',
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- SESSIONS / STUDY ROOMS
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT        PRIMARY KEY,
  post_id      TEXT,
  host_email   TEXT        NOT NULL,
  title        TEXT,
  subject      TEXT,
  mode         TEXT        DEFAULT 'video',
  participants JSONB       DEFAULT '[]',
  room_notes   JSONB       DEFAULT '[]',
  room_chat    JSONB       DEFAULT '[]',
  active       BOOLEAN     DEFAULT false,
  -- whiteboard
  wb_access    JSONB       DEFAULT '[]',        -- emails granted draw access
  wb_data      TEXT,                            -- latest canvas PNG as base64 data URL
  -- room lock
  lock_pin     TEXT,                            -- 4-digit PIN string, NULL = unlocked
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- JOIN REQUESTS (students requesting to join a session post)
CREATE TABLE IF NOT EXISTS join_requests (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  post_id          TEXT        NOT NULL,
  requester_email  TEXT        NOT NULL,
  host_email       TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'declined'
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (post_id, requester_email)
);

-- CALL SIGNALS (WebRTC signalling)
CREATE TABLE IF NOT EXISTS call_signals (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  session_id     TEXT        NOT NULL,
  sender_email   TEXT        NOT NULL,
  receiver_email TEXT,
  type           TEXT        NOT NULL,
  data           JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- PURCHASES (one-time product purchases)
CREATE TABLE IF NOT EXISTS purchases (
  id           TEXT        PRIMARY KEY,
  user_email   TEXT        NOT NULL,
  product_id   TEXT        NOT NULL,
  price        NUMERIC     DEFAULT 0,
  purchased_at TIMESTAMPTZ DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────
-- 6. SAFE MISSING-COLUMN MIGRATIONS
--    (harmless if columns already exist)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE sessions      ADD COLUMN IF NOT EXISTS subject    TEXT;
ALTER TABLE sessions      ADD COLUMN IF NOT EXISTS active     BOOLEAN     DEFAULT false;
ALTER TABLE sessions      ADD COLUMN IF NOT EXISTS wb_access  JSONB       DEFAULT '[]';
ALTER TABLE sessions      ADD COLUMN IF NOT EXISTS wb_data    TEXT;
ALTER TABLE sessions      ADD COLUMN IF NOT EXISTS lock_pin   TEXT;

ALTER TABLE posts         ADD COLUMN IF NOT EXISTS post_type        TEXT;
ALTER TABLE posts         ADD COLUMN IF NOT EXISTS linked_item_id   TEXT;
ALTER TABLE posts         ADD COLUMN IF NOT EXISTS access_list      JSONB DEFAULT '[]';
ALTER TABLE posts         ADD COLUMN IF NOT EXISTS access_requests  JSONB DEFAULT '[]';
ALTER TABLE posts         ADD COLUMN IF NOT EXISTS gather_buddies   BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE products      ADD COLUMN IF NOT EXISTS access_list      JSONB DEFAULT '[]';
ALTER TABLE products      ADD COLUMN IF NOT EXISTS sales_count      INTEGER DEFAULT 0;
ALTER TABLE products      ADD COLUMN IF NOT EXISTS attached_files   JSONB DEFAULT '[]';

ALTER TABLE subscription_tiers ADD COLUMN IF NOT EXISTS perks       JSONB DEFAULT '[]';

ALTER TABLE group_chats   ADD COLUMN IF NOT EXISTS managers         TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE group_chats   ADD COLUMN IF NOT EXISTS host_email        TEXT;
ALTER TABLE group_chats   ADD COLUMN IF NOT EXISTS post_id           TEXT;

ALTER TABLE notes         ADD COLUMN IF NOT EXISTS folder_id        TEXT;

ALTER TABLE quizzes       ADD COLUMN IF NOT EXISTS price             NUMERIC     DEFAULT 0;

-- account_type: added in v8 for student/creator account distinction
ALTER TABLE accounts      ADD COLUMN IF NOT EXISTS account_type   TEXT DEFAULT 'student' CHECK (account_type IN ('student', 'creator'));

-- Backfill existing creator accounts so the column is immediately correct
UPDATE accounts SET account_type = 'creator' WHERE is_creator = true AND account_type = 'student';

-- Clean up any null post_id rows left from an earlier bug
DELETE FROM join_requests WHERE post_id IS NULL;

-- Publish control: products and quizzes are hidden until explicitly published (v9)
ALTER TABLE products ADD COLUMN IF NOT EXISTS profile_visible BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS feed_visible    BOOLEAN DEFAULT false;
ALTER TABLE quizzes  ADD COLUMN IF NOT EXISTS profile_visible BOOLEAN DEFAULT false;
ALTER TABLE quizzes  ADD COLUMN IF NOT EXISTS feed_visible    BOOLEAN DEFAULT false;


-- ─────────────────────────────────────────────────────────────
-- 7. ROW-LEVEL SECURITY
--    All tables open to anon + authenticated (app-level auth).
-- ─────────────────────────────────────────────────────────────
DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN (
      'accounts','posts','comments','matches','messages',
      'saved_posts','join_requests','sessions','notes','notepad_folders',
      'creator_apps','products','subscription_tiers','user_subscriptions',
      'quizzes','group_chats','group_messages','group_reads','room_messages',
      'call_signals','purchases'
    )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Drop ALL existing group_reads policies first to clear any duplicates
-- from previous schema runs (prevents the 406 conflict error)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'group_reads' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON group_reads', pol.policyname);
  END LOOP;
END $$;

-- Drop old anon-only policies, recreate to cover both anon + authenticated
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
    WHERE policyname LIKE 'anon_all_%' OR policyname LIKE 'all_users_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY "all_users_accounts"        ON accounts           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_posts"           ON posts              FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_comments"        ON comments           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_matches"         ON matches            FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_messages"        ON messages           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_saved"           ON saved_posts        FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_join_requests"   ON join_requests      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_sessions"        ON sessions           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_notes"           ON notes              FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_notepad_folders" ON notepad_folders    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_creator_apps"    ON creator_apps       FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_products"        ON products           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_sub_tiers"       ON subscription_tiers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_user_subs"       ON user_subscriptions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_quizzes"         ON quizzes            FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_group_chats"     ON group_chats        FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_group_messages"  ON group_messages     FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_group_reads"     ON group_reads        FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_room_messages"   ON room_messages      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_call_signals"    ON call_signals       FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_users_purchases"       ON purchases          FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────
-- 8. INDEXES
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_posts_author           ON posts(author_email);
CREATE INDEX IF NOT EXISTS idx_posts_created          ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_post_type        ON posts(post_type);
CREATE INDEX IF NOT EXISTS idx_posts_linked_item      ON posts(linked_item_id);
CREATE INDEX IF NOT EXISTS idx_posts_gather_buddies   ON posts(gather_buddies) WHERE gather_buddies = true;
CREATE INDEX IF NOT EXISTS idx_comments_post          ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_matches_from           ON matches(from_email);
CREATE INDEX IF NOT EXISTS idx_matches_to             ON matches(to_email);
CREATE INDEX IF NOT EXISTS idx_messages_from          ON messages(from_email);
CREATE INDEX IF NOT EXISTS idx_messages_to            ON messages(to_email);
CREATE INDEX IF NOT EXISTS idx_messages_created       ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_group_messages_group   ON group_messages(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_group_chats_host        ON group_chats(host_email);
CREATE INDEX IF NOT EXISTS idx_group_chats_post        ON group_chats(post_id);
CREATE INDEX IF NOT EXISTS idx_group_reads_user        ON group_reads(user_email);
CREATE INDEX IF NOT EXISTS idx_group_reads_gc          ON group_reads(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_rm_session_id          ON room_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_rm_created_at          ON room_messages(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_notes_author           ON notes(author_email);
CREATE INDEX IF NOT EXISTS idx_notes_folder           ON notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_notepad_folders_author ON notepad_folders(author_email);
CREATE INDEX IF NOT EXISTS idx_products_creator       ON products(creator_email);
CREATE INDEX IF NOT EXISTS idx_sub_tiers_creator      ON subscription_tiers(creator_email);
CREATE INDEX IF NOT EXISTS idx_user_subs_user         ON user_subscriptions(user_email);
CREATE INDEX IF NOT EXISTS idx_user_subs_creator      ON user_subscriptions(creator_email);
CREATE INDEX IF NOT EXISTS idx_quizzes_creator        ON quizzes(creator_email);
CREATE INDEX IF NOT EXISTS idx_sessions_host          ON sessions(host_email);
CREATE INDEX IF NOT EXISTS idx_jr_post                ON join_requests(post_id);
CREATE INDEX IF NOT EXISTS idx_jr_requester           ON join_requests(requester_email);
CREATE INDEX IF NOT EXISTS idx_jr_host                ON join_requests(host_email);
CREATE INDEX IF NOT EXISTS idx_jr_status              ON join_requests(status);
CREATE INDEX IF NOT EXISTS idx_call_signals_session   ON call_signals(session_id);
CREATE INDEX IF NOT EXISTS idx_call_signals_created   ON call_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_user         ON purchases(user_email);
CREATE INDEX IF NOT EXISTS idx_purchases_product      ON purchases(product_id);


-- ─────────────────────────────────────────────────────────────
-- 9. REALTIME PUBLICATION
--    Tables that need live push to the client.
--    REPLICA IDENTITY FULL is required so UPDATE events include
--    the OLD row values (needed for array-diff on participants,
--    members, etc.) and INSERT events include full row data.
-- ─────────────────────────────────────────────────────────────

-- ── Messaging & signalling (original) ──
ALTER TABLE messages       REPLICA IDENTITY FULL;
ALTER TABLE group_chats    REPLICA IDENTITY FULL;
ALTER TABLE group_messages REPLICA IDENTITY FULL;
ALTER TABLE group_reads    REPLICA IDENTITY FULL;
ALTER TABLE room_messages  REPLICA IDENTITY FULL;
ALTER TABLE call_signals   REPLICA IDENTITY FULL;
ALTER TABLE posts          REPLICA IDENTITY FULL;

-- ── Notification channels (added v9) ──
ALTER TABLE matches            REPLICA IDENTITY FULL;
ALTER TABLE comments           REPLICA IDENTITY FULL;
ALTER TABLE join_requests      REPLICA IDENTITY FULL;
ALTER TABLE purchases          REPLICA IDENTITY FULL;
ALTER TABLE user_subscriptions REPLICA IDENTITY FULL;
ALTER TABLE sessions           REPLICA IDENTITY FULL;

DO $$
DECLARE
  tbls TEXT[] := ARRAY[
    'messages',
    'group_chats',
    'group_messages',
    'group_reads',
    'room_messages',
    'call_signals',
    'posts',
    'matches',
    'comments',
    'join_requests',
    'purchases',
    'user_subscriptions',
    'sessions'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════
-- END OF MASTER SCHEMA (v9)
-- ══════════════════════════════════════════════════════════════
