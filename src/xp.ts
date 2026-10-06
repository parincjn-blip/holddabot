import { createHash, randomInt } from 'node:crypto';
import type { GuildMember, Message } from 'discord.js';
import type pg from 'pg';
import { config } from './config.js';
import { messageLevelFromXp, voiceLevelFromXp, XP } from './constants.js';
import { pool, withTransaction } from './db.js';
import { isFeatureEnabled } from './features.js';
import { voiceMinuteAward } from './stream-rules.js';

export type MemberStats = {
  guild_id: string;
  user_id: string;
  display_name: string;
  joined_at: Date | null;
  left_at: Date | null;
  message_count: string;
  voice_minutes: string;
  message_xp: string;
  voice_xp: string;
  message_level: number;
  voice_level: number;
  message_rank?: string;
  voice_rank?: string;
};

type AwardResult = {
  amount: number;
  oldLevel: number;
  newLevel: number;
  today: number;
  capped: boolean;
};

function dayKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function upsertMember(client: pg.PoolClient, member: GuildMember) {
  await client.query(
    `INSERT INTO guild_members
       (guild_id, user_id, username, display_name, joined_at, left_at)
     VALUES ($1, $2, $3, $4, $5, NULL)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       joined_at = COALESCE(guild_members.joined_at, EXCLUDED.joined_at),
       left_at = NULL,
       updated_at = now()`,
    [member.guild.id, member.id, member.user.username, member.displayName, member.joinedAt],
  );
}

async function lockDailyRow(client: pg.PoolClient, guildId: string, userId: string) {
  const date = dayKey();
  await client.query(
    `INSERT INTO daily_xp (guild_id, user_id, xp_date)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [guildId, userId, date],
  );
  const result = await client.query<{ message_xp: number; voice_xp: number }>(
    `SELECT message_xp, voice_xp FROM daily_xp
     WHERE guild_id = $1 AND user_id = $2 AND xp_date = $3 FOR UPDATE`,
    [guildId, userId, date],
  );
  return { date, ...result.rows[0] };
}

export function messageFingerprint(content: string): string {
  const normalized = content.trim().replace(/\s+/g, ' ').toLocaleLowerCase('th');
  return createHash('sha256').update(normalized).digest('hex');
}

export function messageCanEarn(message: Message): boolean {
  const content = message.content.trim();
  if (content.startsWith('/')) return false;
  return Array.from(content).length >= XP.messageMinLength;
}

export async function recordMessage(member: GuildMember, content: string, eligible: boolean): Promise<AwardResult> {
  return withTransaction(async (client) => {
    await upsertMember(client, member);
    const rowResult = await client.query<{
      message_xp: string;
      message_level: number;
      last_message_xp_at: Date | null;
      last_message_hash: string | null;
      last_message_hash_at: Date | null;
    }>(
      `SELECT message_xp, message_level, last_message_xp_at,
              last_message_hash, last_message_hash_at
       FROM guild_members WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`,
      [member.guild.id, member.id],
    );
    const row = rowResult.rows[0];
    await client.query(
      `UPDATE guild_members SET message_count = message_count + 1, updated_at = now()
       WHERE guild_id = $1 AND user_id = $2`,
      [member.guild.id, member.id],
    );

    const now = Date.now();
    const fingerprint = messageFingerprint(content);
    const cooldownActive = row.last_message_xp_at
      ? now - row.last_message_xp_at.getTime() < XP.messageCooldownMs
      : false;
    const duplicate = row.last_message_hash === fingerprint && row.last_message_hash_at
      ? now - row.last_message_hash_at.getTime() < XP.duplicateWindowMs
      : false;
    if (!eligible || cooldownActive || duplicate) {
      return { amount: 0, oldLevel: row.message_level, newLevel: row.message_level, today: 0, capped: false };
    }

    const daily = await lockDailyRow(client, member.guild.id, member.id);
    const proposed = randomInt(XP.messageMinAward, XP.messageMaxAward + 1);
    const amount = Math.max(0, Math.min(proposed, XP.messageDailyCap - daily.message_xp));
    const totalXp = Number(row.message_xp) + amount;
    const newLevel = messageLevelFromXp(totalXp);
    await client.query(
      `UPDATE guild_members SET
         message_xp = $3, message_level = $4,
         last_message_xp_at = now(), last_message_hash = $5,
         last_message_hash_at = now(), updated_at = now()
       WHERE guild_id = $1 AND user_id = $2`,
      [member.guild.id, member.id, totalXp, newLevel, fingerprint],
    );
    if (amount > 0) {
      await client.query(
        `UPDATE daily_xp SET message_xp = message_xp + $4
         WHERE guild_id = $1 AND user_id = $2 AND xp_date = $3`,
        [member.guild.id, member.id, daily.date, amount],
      );
      await client.query(
        `INSERT INTO xp_events (guild_id, user_id, source, amount, reason)
         VALUES ($1, $2, 'message', $3, 'eligible_message')`,
        [member.guild.id, member.id, amount],
      );
    }
    return {
      amount,
      oldLevel: row.message_level,
      newLevel,
      today: daily.message_xp + amount,
      capped: daily.message_xp + amount >= XP.messageDailyCap,
    };
  });
}

export async function recordVoiceMinute(member: GuildMember): Promise<AwardResult> {
  // Snapshot this member's stream state at the same minute tick; viewers get no bonus.
  const streaming = member.voice.streaming === true && isFeatureEnabled(member.guild.id, 'stream_xp');
  return withTransaction(async (client) => {
    await upsertMember(client, member);
    const rowResult = await client.query<{ voice_xp: string; voice_level: number }>(
      `SELECT voice_xp, voice_level FROM guild_members
       WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`,
      [member.guild.id, member.id],
    );
    const row = rowResult.rows[0];
    const daily = await lockDailyRow(client, member.guild.id, member.id);
    const amount = voiceMinuteAward(streaming, true, daily.voice_xp);
    const totalXp = Number(row.voice_xp) + amount;
    const newLevel = voiceLevelFromXp(totalXp);
    await client.query(
      `UPDATE guild_members SET voice_minutes = voice_minutes + 1,
         voice_xp = $3, voice_level = $4, updated_at = now()
       WHERE guild_id = $1 AND user_id = $2`,
      [member.guild.id, member.id, totalXp, newLevel],
    );
    if (amount > 0) {
      await client.query(
        `UPDATE daily_xp SET voice_xp = voice_xp + $4
         WHERE guild_id = $1 AND user_id = $2 AND xp_date = $3`,
        [member.guild.id, member.id, daily.date, amount],
      );
      await client.query(
        `INSERT INTO xp_events (guild_id, user_id, source, amount, reason)
         VALUES ($1, $2, 'voice', $3, $4)`,
        [member.guild.id, member.id, amount, streaming ? 'streaming_voice_minute_x3' : 'eligible_voice_minute'],
      );
    }
    return {
      amount,
      oldLevel: row.voice_level,
      newLevel,
      today: daily.voice_xp + amount,
      capped: daily.voice_xp + amount >= XP.voiceDailyCap,
    };
  });
}

export async function getMemberStats(guildId: string, userId: string): Promise<MemberStats | null> {
  const result = await pool.query<MemberStats>(
    `SELECT * FROM member_leaderboard WHERE guild_id = $1 AND user_id = $2`,
    [guildId, userId],
  );
  return result.rows[0] ?? null;
}

export async function getDailyXp(guildId: string, userId: string) {
  const result = await pool.query<{ message_xp: number; voice_xp: number }>(
    `SELECT message_xp, voice_xp FROM daily_xp
     WHERE guild_id = $1 AND user_id = $2 AND xp_date = $3`,
    [guildId, userId, dayKey()],
  );
  return result.rows[0] ?? { message_xp: 0, voice_xp: 0 };
}

export async function getLeaderboard(guildId: string, type: 'message' | 'voice', limit = 10) {
  const order = type === 'message'
    ? 'message_level DESC, message_xp DESC'
    : 'voice_level DESC, voice_xp DESC';
  const result = await pool.query<MemberStats>(
    `SELECT * FROM member_leaderboard WHERE guild_id = $1 ORDER BY ${order} LIMIT $2`,
    [guildId, limit],
  );
  return result.rows;
}
