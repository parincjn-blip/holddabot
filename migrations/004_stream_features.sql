-- Existing guilds opt in through /feature. Preserve every existing toggle.
INSERT INTO guild_feature_settings (guild_id, feature_key, enabled)
SELECT guild_id, feature_key, false
FROM guild_bot_settings
CROSS JOIN (VALUES ('stream_xp'), ('stream_start')) AS new_features(feature_key)
ON CONFLICT DO NOTHING;
