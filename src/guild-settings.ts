import { config } from './config.js';
import { pool, withTransaction } from './db.js';
import { featureDefinitions, type ChannelFeature, type FeatureKey } from './feature-definitions.js';
import type { RankRule } from './rank-rules.js';

export type GuildSettings = {
  channels: Partial<Record<ChannelFeature, string>>;
  afkChannelIds: string[];
  ranks: RankRule[];
  features: Partial<Record<FeatureKey, boolean>>;
  streamMentionRoleId?: string;
  streamActiveRoleId?: string;
};
const cache = new Map<string, GuildSettings>();
export function getGuildSettings(guildId: string): GuildSettings {
  return cache.get(guildId) ?? { channels: {}, afkChannelIds: [], ranks: [], features: {} };
}
export function isGuildReady(guildId: string): boolean { return cache.has(guildId); }
export function forgetGuild(guildId: string): void { cache.delete(guildId); }

export async function loadGuildSettings(guildId: string): Promise<void> {
  const legacy = guildId === config.guildId;
  const legacyChannels = legacy ? {
    member_welcome: config.memberLogChannelId,
    member_leave: config.memberLogChannelId,
    level_up: config.levelUpChannelId,
    rank_roles: config.levelUpChannelId,
    giveaway: config.giveawayChannelId,
  } : {};
  await withTransaction(async (db) => {
    const inserted = await db.query(
      `INSERT INTO guild_bot_settings (guild_id, channels, afk_channel_ids)
       VALUES ($1, $2::jsonb, $3::jsonb) ON CONFLICT DO NOTHING RETURNING guild_id`,
      [guildId, JSON.stringify(legacyChannels), JSON.stringify(legacy ? [...config.afkChannelIds] : [])],
    );
    if (!inserted.rowCount) return;
    if (legacy) {
      for (const [index, rank] of config.ranks.entries()) {
        await db.query(
          `INSERT INTO guild_rank_rules (guild_id, role_id, chat_level, talk_level, requirement_mode, priority)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [guildId, rank.roleId, rank.messageLevel, rank.voiceLevel, config.rankMode, index + 1],
        );
      }
    }
    for (const feature of featureDefinitions) {
      await db.query(
        `INSERT INTO guild_feature_settings (guild_id, feature_key, enabled)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [guildId, feature.key, legacy && !feature.key.startsWith('stream_') && (feature.key !== 'giveaway' || Boolean(config.giveawayChannelId))],
      );
    }
  });
  const [settings, ranks, features] = await Promise.all([
    pool.query<{ channels: GuildSettings['channels']; afk_channel_ids: string[]; stream_mention_role_id: string | null; stream_active_role_id: string | null }>(
      'SELECT channels, afk_channel_ids, stream_mention_role_id, stream_active_role_id FROM guild_bot_settings WHERE guild_id = $1', [guildId]),
    pool.query<{ role_id: string; chat_level: number; talk_level: number; requirement_mode: 'AND' | 'OR'; priority: number }>(
      'SELECT * FROM guild_rank_rules WHERE guild_id = $1 ORDER BY priority', [guildId]),
    pool.query<{ feature_key: FeatureKey; enabled: boolean }>(
      'SELECT feature_key, enabled FROM guild_feature_settings WHERE guild_id = $1', [guildId]),
  ]);
  cache.set(guildId, {
    channels: settings.rows[0].channels,
    afkChannelIds: settings.rows[0].afk_channel_ids,
    ranks: ranks.rows.map((row) => ({ roleId: row.role_id, chatLevel: row.chat_level, talkLevel: row.talk_level, mode: row.requirement_mode, priority: row.priority })),
    features: Object.fromEntries(features.rows.map((row) => [row.feature_key, row.enabled])),
    ...(settings.rows[0].stream_mention_role_id ? { streamMentionRoleId: settings.rows[0].stream_mention_role_id } : {}),
    ...(settings.rows[0].stream_active_role_id ? { streamActiveRoleId: settings.rows[0].stream_active_role_id } : {}),
  });
}

export async function saveStreamMentionRole(guildId: string, roleId: string | null): Promise<void> {
  await pool.query('UPDATE guild_bot_settings SET stream_mention_role_id=$2, updated_at=now() WHERE guild_id=$1', [guildId, roleId]);
  await loadGuildSettings(guildId);
}

export async function saveStreamActiveRole(guildId: string, roleId: string | null): Promise<void> {
  await pool.query('UPDATE guild_bot_settings SET stream_active_role_id=$2, updated_at=now() WHERE guild_id=$1', [guildId, roleId]);
  await loadGuildSettings(guildId);
}

export async function saveChannel(guildId: string, feature: ChannelFeature, channelId: string | null): Promise<void> {
  if (channelId) {
    await pool.query(
      `UPDATE guild_bot_settings SET channels = jsonb_set(channels, ARRAY[$2]::text[], to_jsonb($3::text)), updated_at = now() WHERE guild_id = $1`,
      [guildId, feature, channelId],
    );
  } else {
    await pool.query('UPDATE guild_bot_settings SET channels = channels - $2::text, updated_at = now() WHERE guild_id = $1', [guildId, feature]);
  }
  await loadGuildSettings(guildId);
}

export async function saveRankRule(guildId: string, rule: RankRule, updatedBy: string): Promise<void> {
  await pool.query(
    `INSERT INTO guild_rank_rules (guild_id, role_id, chat_level, talk_level, requirement_mode, priority, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (guild_id, role_id) DO UPDATE SET chat_level = EXCLUDED.chat_level,
       talk_level = EXCLUDED.talk_level, requirement_mode = EXCLUDED.requirement_mode,
       priority = EXCLUDED.priority, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [guildId, rule.roleId, rule.chatLevel, rule.talkLevel, rule.mode, rule.priority, updatedBy],
  );
  await loadGuildSettings(guildId);
}
export async function removeRankRule(guildId: string, roleId: string): Promise<void> {
  await pool.query('DELETE FROM guild_rank_rules WHERE guild_id = $1 AND role_id = $2', [guildId, roleId]);
  await loadGuildSettings(guildId);
}
export async function saveAfkChannel(guildId: string, channelId: string, add: boolean): Promise<void> {
  await pool.query(add
    ? `UPDATE guild_bot_settings SET afk_channel_ids = CASE WHEN afk_channel_ids ? $2::text THEN afk_channel_ids
       ELSE afk_channel_ids || jsonb_build_array($2::text) END, updated_at = now() WHERE guild_id = $1`
    : `UPDATE guild_bot_settings SET afk_channel_ids = afk_channel_ids - $2::text, updated_at = now() WHERE guild_id = $1`,
  [guildId, channelId]);
  await loadGuildSettings(guildId);
}
export async function saveFeature(guildId: string, feature: FeatureKey, enabled: boolean, updatedBy: string): Promise<void> {
  await pool.query(
    `INSERT INTO guild_feature_settings (guild_id, feature_key, enabled, updated_by)
     VALUES ($1, $2, $3, $4) ON CONFLICT (guild_id, feature_key) DO UPDATE SET
       enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [guildId, feature, enabled, updatedBy],
  );
  await loadGuildSettings(guildId);
}
