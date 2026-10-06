CREATE TABLE IF NOT EXISTS guild_feature_settings (
  guild_id text NOT NULL,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, feature_key)
);
