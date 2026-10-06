CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guild_members (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  username text NOT NULL,
  display_name text NOT NULL,
  joined_at timestamptz,
  left_at timestamptz,
  message_count bigint NOT NULL DEFAULT 0,
  voice_minutes bigint NOT NULL DEFAULT 0,
  message_xp bigint NOT NULL DEFAULT 0,
  voice_xp bigint NOT NULL DEFAULT 0,
  message_level integer NOT NULL DEFAULT 0,
  voice_level integer NOT NULL DEFAULT 0,
  last_message_xp_at timestamptz,
  last_message_hash text,
  last_message_hash_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS daily_xp (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  xp_date date NOT NULL,
  message_xp integer NOT NULL DEFAULT 0 CHECK (message_xp >= 0),
  voice_xp integer NOT NULL DEFAULT 0 CHECK (voice_xp >= 0),
  PRIMARY KEY (guild_id, user_id, xp_date)
);

CREATE TABLE IF NOT EXISTS member_events (
  id bigserial PRIMARY KEY,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS xp_events (
  id bigserial PRIMARY KEY,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  source text NOT NULL,
  amount integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS giveaways (
  id bigserial PRIMARY KEY,
  guild_id text NOT NULL,
  channel_id text NOT NULL,
  message_id text,
  created_by text NOT NULL,
  prize text NOT NULL,
  giveaway_type text NOT NULL CHECK (giveaway_type IN ('first_come', 'random')),
  winner_count integer NOT NULL CHECK (winner_count BETWEEN 1 AND 100),
  min_message_level integer NOT NULL DEFAULT 0,
  min_voice_level integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ended', 'cancelled')),
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS giveaway_entries (
  giveaway_id bigint NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (giveaway_id, user_id)
);

CREATE TABLE IF NOT EXISTS giveaway_winners (
  giveaway_id bigint NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  selected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (giveaway_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_member_events_lookup
  ON member_events (guild_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_events_lookup
  ON xp_events (guild_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_giveaways_due
  ON giveaways (status, ends_at) WHERE status = 'open';

CREATE OR REPLACE VIEW member_leaderboard AS
SELECT guild_id, user_id, display_name, message_count, voice_minutes,
       message_xp, voice_xp, message_level, voice_level,
       row_number() OVER (PARTITION BY guild_id ORDER BY message_level DESC, message_xp DESC) AS message_rank,
       row_number() OVER (PARTITION BY guild_id ORDER BY voice_level DESC, voice_xp DESC) AS voice_rank
FROM guild_members
WHERE left_at IS NULL;
