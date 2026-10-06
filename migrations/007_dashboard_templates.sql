CREATE TABLE guild_message_templates (
  guild_id text NOT NULL, template_key text NOT NULL,
  content jsonb, revision integer NOT NULL DEFAULT 0,
  updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, template_key)
);
CREATE TABLE guild_message_template_history (
  guild_id text NOT NULL, template_key text NOT NULL, revision integer NOT NULL,
  content jsonb, updated_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, template_key, revision)
);
CREATE TABLE dashboard_sessions (
  id_hash text PRIMARY KEY, user_info jsonb NOT NULL,
  access_token_cipher text NOT NULL, csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX dashboard_sessions_expiry ON dashboard_sessions(expires_at);
