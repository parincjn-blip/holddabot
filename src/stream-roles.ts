import type { Client, Guild } from 'discord.js';
import { pool } from './db.js';
import { getGuildSettings, isGuildReady } from './guild-settings.js';
import { isFeatureEnabled } from './features.js';
import { validateRankRole } from './feature-validation.js';

const queues = new Map<string, Promise<void>>();
export async function syncStreamRole(guild: Guild, userId: string): Promise<void> {
  const key = `${guild.id}:${userId}`;
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (!isGuildReady(guild.id)) return;
    const member = await guild.members.fetch({ user: userId, force: true }).catch((error: { code?: number }) => {
      if (error.code === 10007) return null;
      throw error;
    });
    const settings = getGuildSettings(guild.id);
    const voice = guild.voiceStates.cache.get(userId);
    const desired = member && !member.user.bot && voice?.channelId && voice.streaming
      && isFeatureEnabled(guild.id, 'stream_role') ? settings.streamActiveRoleId : undefined;
    const owned = await pool.query<{ role_id: string }>('SELECT role_id FROM stream_role_assignments WHERE guild_id=$1 AND user_id=$2', [guild.id,userId]);
    for (const { role_id: roleId } of owned.rows) {
      if (roleId === desired) continue;
      if (member?.roles.cache.has(roleId)) {
        if ((await validateRankRole(guild, roleId)).length) throw Error('Stream Role cleanup permission unavailable');
        await member.roles.remove(roleId, 'Disbot stream ended or configuration changed');
      }
      await pool.query('DELETE FROM stream_role_assignments WHERE guild_id=$1 AND user_id=$2 AND role_id=$3',[guild.id,userId,roleId]);
    }
    if (!member || !desired || member.roles.cache.has(desired)) return;
    if (settings.ranks.some(r => r.roleId === desired) || (await validateRankRole(guild,desired)).length) throw Error('Stream Role permission or configuration unavailable');
    // Persist intent before Discord write so a restart can retry or clean up an interrupted assignment.
    await pool.query('INSERT INTO stream_role_assignments (guild_id,user_id,role_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[guild.id,userId,desired]);
    await member.roles.add(desired,'Disbot active stream');
  });
  queues.set(key,next);
  try { await next; } finally { if(queues.get(key)===next) queues.delete(key); }
}

export async function reconcileStreamRoles(guild: Guild): Promise<void> {
  if (!isGuildReady(guild.id)) return;
  const owned = await pool.query<{ user_id: string }>('SELECT DISTINCT user_id FROM stream_role_assignments WHERE guild_id=$1',[guild.id]);
  const ids = new Set(owned.rows.map(r=>r.user_id));
  if (isFeatureEnabled(guild.id,'stream_role')) for (const state of guild.voiceStates.cache.values()) {
    if (state.streaming && state.channelId) ids.add(state.id);
  }
  for (const id of ids) await syncStreamRole(guild,id);
}
export function startStreamRoleWorker(client: Client): void {
  let running = false;
  const tick = async () => {
    if(running) return; running=true;
    try { for (const guild of client.guilds.cache.values()) await reconcileStreamRoles(guild).catch(() => console.error('Stream Role reconciliation failed; retrying next interval')); }
    finally { running=false; }
  };
  void tick(); setInterval(() => { void tick(); },60000).unref();
}
