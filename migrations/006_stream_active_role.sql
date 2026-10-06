ALTER TABLE guild_bot_settings ADD COLUMN IF NOT EXISTS stream_active_role_id text;
CREATE TABLE IF NOT EXISTS stream_role_assignments (
  guild_id text NOT NULL, user_id text NOT NULL, role_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (guild_id, user_id, role_id)
);
INSERT INTO guild_feature_settings (guild_id, feature_key, enabled)
SELECT guild_id, 'stream_role', false FROM guild_bot_settings ON CONFLICT DO NOTHING;
