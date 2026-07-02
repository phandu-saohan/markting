-- ================================================================
-- MARKETING AUTOMATION PLATFORM — Database Init Script
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'user');
CREATE TYPE user_plan AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE platform_type AS ENUM ('facebook', 'zalo', 'tiktok', 'youtube', 'email');
CREATE TYPE account_type AS ENUM ('personal', 'fanpage', 'oa', 'channel');
CREATE TYPE account_status AS ENUM ('active', 'checkpoint', 'banned', 'expired');
CREATE TYPE proxy_protocol AS ENUM ('http', 'https', 'socks5');
CREATE TYPE group_privacy AS ENUM ('public', 'private', 'closed');
CREATE TYPE post_status AS ENUM ('draft', 'scheduled', 'queued', 'posted', 'failed');
CREATE TYPE post_platform AS ENUM ('facebook_group', 'facebook_fanpage', 'zalo_oa', 'zalo_personal', 'tiktok', 'youtube', 'reels');
CREATE TYPE media_type AS ENUM ('none', 'image', 'video');
CREATE TYPE campaign_platform AS ENUM ('facebook', 'zalo', 'tiktok', 'youtube', 'email', 'multi');
CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'completed');
CREATE TYPE job_status AS ENUM ('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');

-- ─── USERS ───────────────────────────────────────────────────────
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       VARCHAR(255) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  full_name   VARCHAR(255),
  role        user_role NOT NULL DEFAULT 'user',
  plan        user_plan NOT NULL DEFAULT 'free',
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PROXIES ─────────────────────────────────────────────────────
CREATE TABLE proxies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  host        VARCHAR(255) NOT NULL,
  port        INTEGER NOT NULL,
  username    VARCHAR(255),
  password    VARCHAR(255),
  protocol    proxy_protocol NOT NULL DEFAULT 'http',
  country     VARCHAR(10),
  is_active   BOOLEAN DEFAULT TRUE,
  last_used   TIMESTAMPTZ,
  fail_count  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ACCOUNTS ────────────────────────────────────────────────────
CREATE TABLE accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform        platform_type NOT NULL,
  account_type    account_type NOT NULL DEFAULT 'personal',
  label           VARCHAR(255),
  username        VARCHAR(255),
  cookies         TEXT,           -- AES-256 encrypted JSON
  access_token    TEXT,           -- AES-256 encrypted
  refresh_token   TEXT,           -- AES-256 encrypted
  token_expires   TIMESTAMPTZ,
  proxy_id        UUID REFERENCES proxies(id) ON DELETE SET NULL,
  status          account_status NOT NULL DEFAULT 'active',
  meta            JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── GROUPS ──────────────────────────────────────────────────────
CREATE TABLE groups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform        platform_type NOT NULL DEFAULT 'facebook',
  group_id        VARCHAR(255) NOT NULL,
  group_name      VARCHAR(500),
  member_count    INTEGER,
  privacy         group_privacy DEFAULT 'public',
  keywords        TEXT[],
  cover_image     TEXT,
  last_scraped    TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, group_id)
);

-- ─── CAMPAIGNS ───────────────────────────────────────────────────
CREATE TABLE campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  platform        campaign_platform NOT NULL,
  target_group_ids UUID[],
  account_ids     UUID[],
  schedule_config JSONB DEFAULT '{}',
  delay_min       INTEGER DEFAULT 5,
  delay_max       INTEGER DEFAULT 15,
  rotate_proxy    BOOLEAN DEFAULT TRUE,
  status          campaign_status NOT NULL DEFAULT 'draft',
  start_at        TIMESTAMPTZ,
  end_at          TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── POSTS ───────────────────────────────────────────────────────
CREATE TABLE posts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id     UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  title           VARCHAR(500),
  content         TEXT NOT NULL,
  media_urls      TEXT[],
  media_type      media_type DEFAULT 'none',
  platform        post_platform NOT NULL,
  hashtags        TEXT[],
  status          post_status NOT NULL DEFAULT 'draft',
  scheduled_at    TIMESTAMPTZ,
  posted_at       TIMESTAMPTZ,
  error_log       TEXT,
  external_post_id VARCHAR(255),
  meta            JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── JOB_QUEUES ──────────────────────────────────────────────────
CREATE TABLE job_queues (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id       UUID REFERENCES posts(id) ON DELETE CASCADE,
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  account_id    UUID REFERENCES accounts(id) ON DELETE SET NULL,
  group_id      UUID REFERENCES groups(id) ON DELETE SET NULL,
  queue_name    VARCHAR(100) NOT NULL,
  bull_job_id   VARCHAR(255),
  status        job_status NOT NULL DEFAULT 'waiting',
  attempts      INTEGER DEFAULT 0,
  max_attempts  INTEGER DEFAULT 3,
  scheduled_at  TIMESTAMPTZ,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  error         TEXT,
  result        JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── EMAIL_LISTS ─────────────────────────────────────────────────
CREATE TABLE email_lists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── EMAIL_CONTACTS ──────────────────────────────────────────────
CREATE TABLE email_contacts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id         UUID NOT NULL REFERENCES email_lists(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  name            VARCHAR(255),
  tags            TEXT[],
  custom_fields   JSONB DEFAULT '{}',
  is_active       BOOLEAN DEFAULT TRUE,
  unsubscribed    BOOLEAN DEFAULT FALSE,
  bounced         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, email)
);

-- ─── INDEXES ─────────────────────────────────────────────────────
CREATE INDEX idx_accounts_user_platform ON accounts(user_id, platform);
CREATE INDEX idx_groups_user_platform ON groups(user_id, platform);
CREATE INDEX idx_posts_campaign ON posts(campaign_id);
CREATE INDEX idx_posts_status_scheduled ON posts(status, scheduled_at);
CREATE INDEX idx_job_queues_status ON job_queues(status, scheduled_at);
CREATE INDEX idx_job_queues_bull_id ON job_queues(bull_job_id);
CREATE INDEX idx_email_contacts_list ON email_contacts(list_id, is_active);
