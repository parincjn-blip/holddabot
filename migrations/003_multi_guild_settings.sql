ALTER TABLE guild_feature_settings ALTER COLUMN enabled SET DEFAULT false;

CREATE TABLE IF NOT EXISTS guild_bot_settings (
  guild_id text PRIMARY KEY,
  channels jsonb NOT NULL DEFAULT '{}'::jsonb,
  afk_channel_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS guild_rank_rules (
  guild_id text NOT NULL REFERENCES guild_bot_settings(guild_id),
  role_id text NOT NULL,
  chat_level integer NOT NULL CHECK (chat_level BETWEEN 0 AND 100),
  talk_level integer NOT NULL CHECK (talk_level BETWEEN 0 AND 30),
  requirement_mode text NOT NULL DEFAULT 'AND' CHECK (requirement_mode IN ('AND', 'OR')),
  priority integer NOT NULL CHECK (priority BETWEEN 1 AND 1000),
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (chat_level > 0 OR talk_level > 0),
  PRIMARY KEY (guild_id, role_id),
  UNIQUE (guild_id, priority)
);
